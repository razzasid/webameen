BEGIN;

-- Keep bearer digests private even for business owners. Owners can inspect
-- link state, but cannot retrieve the stored secret or enumerate customer data.
REVOKE SELECT ON TABLE public.invoice_public_links
  FROM PUBLIC, anon, authenticated, service_role, webameen_executor,
       webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT (
  id, business_id, invoice_id, creation_request_key, access_expires_at,
  created_at, revoked_by, revoked_at, revocation_reason
) ON TABLE public.invoice_public_links TO authenticated, webameen_executor;

GRANT USAGE ON SCHEMA private TO authenticated, service_role,
  webameen_invoice_broker;

-- The invoice broker has a deliberately narrow read projection. The public
-- application still reaches it only through one fixed, token-resolving RPC.
GRANT SELECT (business_id, role, disabled_at)
  ON public.business_memberships TO webameen_invoice_broker;
GRANT SELECT (
  id, business_id, reference, issued_at, invoice_date, due_on,
  seller_display_name, seller_contact_email, seller_contact_phone,
  seller_postal_address, seller_country_code, seller_state_code,
  seller_gst_registered, seller_gstin,
  buyer_display_name, buyer_contact_name, buyer_email, buyer_phone,
  buyer_billing_address, buyer_state_code, buyer_gstin_applicable, buyer_gstin,
  currency_code, currency_exponent, quantity_scale, calculation_rule_code,
  price_tax_mode, gst_auto_treatment, gst_treatment_override, gst_treatment,
  document_time_zone, place_of_supply_applicable, place_of_supply_state_code,
  place_of_supply_text, reverse_charge_applies,
  subtotal_minor, taxable_subtotal_minor, cgst_total_minor, sgst_total_minor,
  igst_total_minor, gst_total_minor, total_minor,
  seller_bank_name, seller_bank_account_name, seller_bank_account_number,
  seller_bank_ifsc, seller_upi_id, payment_instructions, terms
) ON public.invoices TO webameen_invoice_broker;
GRANT SELECT (
  id, business_id, invoice_id, position, description, unit_label, hsn_sac,
  quantity, unit_price_minor, line_subtotal_minor, gst_category, gst_treatment,
  gst_rate, taxable_amount_minor, cgst_rate, cgst_amount_minor, sgst_rate,
  sgst_amount_minor, igst_rate, igst_amount_minor, line_total_minor
) ON public.invoice_items TO webameen_invoice_broker;
GRANT SELECT (
  id, business_id, invoice_id, token_hash, access_expires_at, created_at,
  revoked_at
) ON public.invoice_public_links TO webameen_invoice_broker;

CREATE POLICY invoice_broker_membership_read ON public.business_memberships
  FOR SELECT TO webameen_invoice_broker
  USING (role = 'owner' AND disabled_at IS NULL);
CREATE POLICY invoice_broker_invoice_read ON public.invoices
  FOR SELECT TO webameen_invoice_broker USING (true);
CREATE POLICY invoice_broker_invoice_item_read ON public.invoice_items
  FOR SELECT TO webameen_invoice_broker USING (
    EXISTS (
      SELECT 1 FROM public.invoices AS i
      WHERE i.business_id = invoice_items.business_id
        AND i.id = invoice_items.invoice_id
    )
  );
CREATE POLICY invoice_broker_link_read ON public.invoice_public_links
  FOR SELECT TO webameen_invoice_broker USING (true);

CREATE FUNCTION private.create_invoice_link(
  p_invoice_id uuid,
  p_creation_request_key uuid,
  p_token_hash_hex text,
  p_access_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_existing public.invoice_public_links%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF v_user_id IS NULL OR p_invoice_id IS NULL
    OR p_creation_request_key IS NULL OR p_token_hash_hex IS NULL
    OR p_token_hash_hex !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid invoice link request';
  END IF;

  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.user_id = v_user_id AND m.business_id = v_business_id
      AND m.role = 'owner' AND m.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'webameen/invoice/' || v_business_id::text || '/' || p_invoice_id::text, 0
    )
  );
  PERFORM 1 FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Invoice unavailable';
  END IF;

  -- Resolve request retries before looking at the active link. Reusing a key
  -- cannot rotate or replace a newer link.
  SELECT l.* INTO v_existing
  FROM public.invoice_public_links AS l
  WHERE l.business_id = v_business_id
    AND l.creation_request_key = p_creation_request_key;
  IF FOUND THEN
    IF v_existing.invoice_id <> p_invoice_id
      OR v_existing.access_expires_at IS DISTINCT FROM p_access_expires_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice link request key was reused with different inputs';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'link_id', v_existing.id,
      'created', false,
      'active', v_existing.revoked_at IS NULL
        AND (v_existing.access_expires_at IS NULL
          OR v_existing.access_expires_at > pg_catalog.clock_timestamp()),
      'access_expires_at', v_existing.access_expires_at
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_public_links AS l
    WHERE l.business_id = v_business_id AND l.invoice_id = p_invoice_id
      AND l.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An active invoice link already exists';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  IF p_access_expires_at IS NOT NULL AND p_access_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The link access cutoff must be in the future';
  END IF;
  INSERT INTO public.invoice_public_links (
    business_id, invoice_id, token_hash, creation_request_key,
    access_expires_at, created_by, created_at
  ) VALUES (
    v_business_id, p_invoice_id, pg_catalog.decode(p_token_hash_hex, 'hex'),
    p_creation_request_key, p_access_expires_at, v_user_id, v_now
  ) RETURNING * INTO v_existing;
  RETURN pg_catalog.jsonb_build_object(
    'link_id', v_existing.id, 'created', true, 'active', true,
    'access_expires_at', v_existing.access_expires_at
  );
END
$fn$;

CREATE FUNCTION private.rotate_invoice_link(
  p_invoice_id uuid,
  p_creation_request_key uuid,
  p_token_hash_hex text,
  p_access_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_existing public.invoice_public_links%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF v_user_id IS NULL OR p_invoice_id IS NULL
    OR p_creation_request_key IS NULL OR p_token_hash_hex IS NULL
    OR p_token_hash_hex !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid invoice link request';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.user_id = v_user_id AND m.business_id = v_business_id
      AND m.role = 'owner' AND m.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'webameen/invoice/' || v_business_id::text || '/' || p_invoice_id::text, 0
    )
  );
  PERFORM 1 FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Invoice unavailable';
  END IF;

  SELECT l.* INTO v_existing
  FROM public.invoice_public_links AS l
  WHERE l.business_id = v_business_id
    AND l.creation_request_key = p_creation_request_key;
  IF FOUND THEN
    IF v_existing.invoice_id <> p_invoice_id
      OR v_existing.access_expires_at IS DISTINCT FROM p_access_expires_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice link request key was reused with different inputs';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'link_id', v_existing.id, 'created', false,
      'active', v_existing.revoked_at IS NULL
        AND (v_existing.access_expires_at IS NULL
          OR v_existing.access_expires_at > pg_catalog.clock_timestamp()),
      'access_expires_at', v_existing.access_expires_at
    );
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF p_access_expires_at IS NOT NULL AND p_access_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The link access cutoff must be in the future';
  END IF;
  UPDATE public.invoice_public_links AS l
  SET revoked_by = v_user_id, revoked_at = v_now, revocation_reason = 'rotated'
  WHERE l.business_id = v_business_id AND l.invoice_id = p_invoice_id
    AND l.revoked_at IS NULL;
  INSERT INTO public.invoice_public_links (
    business_id, invoice_id, token_hash, creation_request_key,
    access_expires_at, created_by, created_at
  ) VALUES (
    v_business_id, p_invoice_id, pg_catalog.decode(p_token_hash_hex, 'hex'),
    p_creation_request_key, p_access_expires_at, v_user_id, v_now
  ) RETURNING * INTO v_existing;
  RETURN pg_catalog.jsonb_build_object(
    'link_id', v_existing.id, 'created', true, 'active', true,
    'access_expires_at', v_existing.access_expires_at
  );
END
$fn$;

CREATE FUNCTION private.revoke_invoice_link(
  p_invoice_id uuid, p_link_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_link public.invoice_public_links%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF v_user_id IS NULL OR p_invoice_id IS NULL OR p_link_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authenticated owner required';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.user_id = v_user_id AND m.business_id = v_business_id
      AND m.role = 'owner' AND m.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'webameen/invoice/' || v_business_id::text || '/' || p_invoice_id::text, 0
    )
  );
  PERFORM 1 FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Invoice unavailable';
  END IF;
  SELECT l.* INTO v_link
  FROM public.invoice_public_links AS l
  WHERE l.business_id = v_business_id AND l.invoice_id = p_invoice_id
    AND l.id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Invoice link unavailable';
  END IF;
  IF v_link.revoked_at IS NULL THEN
    v_now := pg_catalog.clock_timestamp();
    UPDATE public.invoice_public_links AS l
    SET revoked_by = v_user_id, revoked_at = v_now,
        revocation_reason = 'owner_revoked'
    WHERE l.business_id = v_business_id AND l.id = p_link_id;
    v_link.revoked_at := v_now;
    v_link.revocation_reason := 'owner_revoked';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'link_id', v_link.id, 'revoked_at', v_link.revoked_at,
    'revocation_reason', v_link.revocation_reason
  );
END
$fn$;

CREATE FUNCTION private.read_public_invoice(p_token_hash_hex text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_hash bytea;
  v_business_id uuid;
  v_invoice_id uuid;
  v_link_id uuid;
  v_link public.invoice_public_links%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_token_hash_hex IS NULL OR p_token_hash_hex !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN NULL;
  END IF;
  v_hash := pg_catalog.decode(p_token_hash_hex, 'hex');
  SELECT l.business_id, l.invoice_id, l.id
    INTO v_business_id, v_invoice_id, v_link_id
  FROM public.invoice_public_links AS l
  WHERE l.token_hash = v_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.business_id = v_business_id AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'webameen/invoice/' || v_business_id::text || '/' || v_invoice_id::text, 0
    )
  );
  SELECT i.* INTO v_invoice
  FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.id = v_invoice_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT l.* INTO v_link
  FROM public.invoice_public_links AS l
  WHERE l.business_id = v_business_id AND l.invoice_id = v_invoice_id
    AND l.id = v_link_id AND l.token_hash = v_hash;
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN RETURN NULL; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_link.access_expires_at IS NOT NULL
    AND v_now >= v_link.access_expires_at THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'kind', 'invoice',
    'reference', v_invoice.reference,
    'invoice_date', v_invoice.invoice_date,
    'due_on', v_invoice.due_on,
    'issued_at', v_invoice.issued_at,
    'seller', pg_catalog.jsonb_build_object(
      'display_name', v_invoice.seller_display_name,
      'email', v_invoice.seller_contact_email,
      'phone', v_invoice.seller_contact_phone,
      'address', v_invoice.seller_postal_address,
      'country_code', v_invoice.seller_country_code,
      'state_code', v_invoice.seller_state_code,
      'gst_registered', v_invoice.seller_gst_registered,
      'gstin', v_invoice.seller_gstin
    ),
    'buyer', pg_catalog.jsonb_build_object(
      'display_name', v_invoice.buyer_display_name,
      'contact_name', v_invoice.buyer_contact_name,
      'email', v_invoice.buyer_email,
      'phone', v_invoice.buyer_phone,
      'billing_address', v_invoice.buyer_billing_address,
      'state_code', v_invoice.buyer_state_code,
      'gstin_applicable', v_invoice.buyer_gstin_applicable,
      'gstin', v_invoice.buyer_gstin
    ),
    'document', pg_catalog.jsonb_build_object(
      'currency_code', v_invoice.currency_code,
      'currency_exponent', v_invoice.currency_exponent,
      'quantity_scale', v_invoice.quantity_scale,
      'calculation_rule_code', v_invoice.calculation_rule_code,
      'price_tax_mode', v_invoice.price_tax_mode,
      'gst_auto_treatment', v_invoice.gst_auto_treatment,
      'gst_treatment_override', v_invoice.gst_treatment_override,
      'gst_treatment', v_invoice.gst_treatment,
      'document_time_zone', v_invoice.document_time_zone,
      'place_of_supply_applicable', v_invoice.place_of_supply_applicable,
      'place_of_supply_state_code', v_invoice.place_of_supply_state_code,
      'place_of_supply_text', v_invoice.place_of_supply_text,
      'reverse_charge_applies', v_invoice.reverse_charge_applies,
      'terms', v_invoice.terms
    ),
    'totals', pg_catalog.jsonb_build_object(
      'subtotal_minor', v_invoice.subtotal_minor::text,
      'taxable_subtotal_minor', v_invoice.taxable_subtotal_minor::text,
      'cgst_total_minor', v_invoice.cgst_total_minor::text,
      'sgst_total_minor', v_invoice.sgst_total_minor::text,
      'igst_total_minor', v_invoice.igst_total_minor::text,
      'gst_total_minor', v_invoice.gst_total_minor::text,
      'total_minor', v_invoice.total_minor::text
    ),
    'remittance', pg_catalog.jsonb_build_object(
      'bank_name', v_invoice.seller_bank_name,
      'bank_account_name', v_invoice.seller_bank_account_name,
      'bank_account_number', v_invoice.seller_bank_account_number,
      'bank_ifsc', v_invoice.seller_bank_ifsc,
      'upi_id', v_invoice.seller_upi_id,
      'payment_instructions', v_invoice.payment_instructions
    ),
    'lines', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'position', li.position,
        'description', li.description,
        'unit_label', li.unit_label,
        'hsn_sac', li.hsn_sac,
        'quantity', li.quantity::text,
        'unit_price_minor', li.unit_price_minor::text,
        'line_subtotal_minor', li.line_subtotal_minor::text,
        'gst_category', li.gst_category,
        'gst_treatment', li.gst_treatment,
        'gst_rate', li.gst_rate::text,
        'taxable_amount_minor', li.taxable_amount_minor::text,
        'cgst_rate', li.cgst_rate::text,
        'cgst_amount_minor', li.cgst_amount_minor::text,
        'sgst_rate', li.sgst_rate::text,
        'sgst_amount_minor', li.sgst_amount_minor::text,
        'igst_rate', li.igst_rate::text,
        'igst_amount_minor', li.igst_amount_minor::text,
        'line_total_minor', li.line_total_minor::text
      ) ORDER BY li.position)
      FROM public.invoice_items AS li
      WHERE li.business_id = v_business_id AND li.invoice_id = v_invoice_id
    ), '[]'::jsonb)
  );
END
$fn$;

CREATE FUNCTION public.create_invoice_link(
  p_invoice_id uuid, p_creation_request_key uuid, p_token_hash_hex text,
  p_access_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.create_invoice_link(
  p_invoice_id, p_creation_request_key, p_token_hash_hex, p_access_expires_at
) $fn$;
CREATE FUNCTION public.rotate_invoice_link(
  p_invoice_id uuid, p_creation_request_key uuid, p_token_hash_hex text,
  p_access_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.rotate_invoice_link(
  p_invoice_id, p_creation_request_key, p_token_hash_hex, p_access_expires_at
) $fn$;
CREATE FUNCTION public.revoke_invoice_link(p_invoice_id uuid, p_link_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.revoke_invoice_link(p_invoice_id, p_link_id) $fn$;
CREATE FUNCTION public.read_public_invoice(p_token_hash_hex text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.read_public_invoice(p_token_hash_hex) $fn$;

REVOKE ALL ON FUNCTION private.create_invoice_link(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, webameen_executor,
       webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION private.rotate_invoice_link(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, webameen_executor,
       webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION private.revoke_invoice_link(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, webameen_executor,
       webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION private.read_public_invoice(text)
  FROM PUBLIC, anon, authenticated, service_role, webameen_executor,
       webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION public.create_invoice_link(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rotate_invoice_link(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_invoice_link(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_public_invoice(text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.create_invoice_link(uuid, uuid, text, timestamptz),
  private.rotate_invoice_link(uuid, uuid, text, timestamptz),
  private.revoke_invoice_link(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.read_public_invoice(text)
  TO service_role, webameen_invoice_broker;
GRANT EXECUTE ON FUNCTION public.create_invoice_link(uuid, uuid, text, timestamptz),
  public.rotate_invoice_link(uuid, uuid, text, timestamptz),
  public.revoke_invoice_link(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_public_invoice(text)
  TO service_role, webameen_invoice_broker;

COMMIT;
