BEGIN;

-- Evolve public.invoices to support direct invoice creation alongside quotation-converted invoices.
ALTER TABLE public.invoices
  ALTER COLUMN quotation_id DROP NOT NULL,
  ALTER COLUMN source_version_id DROP NOT NULL,
  ALTER COLUMN approved_response_id DROP NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN origin text NOT NULL DEFAULT 'quotation_converted',
  ADD COLUMN request_key uuid;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_origin_enum_ck
    CHECK (origin IN ('quotation_converted', 'direct')),
  ADD CONSTRAINT invoices_origin_shape_ck
    CHECK (
      (origin = 'quotation_converted' AND quotation_id IS NOT NULL AND source_version_id IS NOT NULL AND approved_response_id IS NOT NULL) OR
      (origin = 'direct' AND quotation_id IS NULL AND source_version_id IS NULL AND approved_response_id IS NULL)
    );

-- Add explicit customer foreign key since quotation_customer_fk is bypassed when quotation_id is null.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_customer_fk
    FOREIGN KEY (business_id, customer_id)
    REFERENCES public.customers (business_id, id)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

-- Replace u_i2 with a partial unique index so null quotation_ids (for direct invoices) do not conflict.
ALTER TABLE public.invoices DROP CONSTRAINT u_i2;
CREATE UNIQUE INDEX u_i2 ON public.invoices (business_id, quotation_id) WHERE quotation_id IS NOT NULL;

-- Unique index on request_key for direct invoice idempotency within the business.
CREATE UNIQUE INDEX u_i_request_key ON public.invoices (business_id, request_key) WHERE request_key IS NOT NULL;

-- Evolve public.invoice_items to support direct invoice items.
ALTER TABLE public.invoice_items
  ALTER COLUMN source_version_id DROP NOT NULL,
  ALTER COLUMN source_quotation_item_id DROP NOT NULL;

ALTER TABLE public.invoice_items
  ADD COLUMN source_catalog_item_id uuid;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_catalog_fk
    FOREIGN KEY (business_id, source_catalog_item_id)
    REFERENCES public.catalog_items (business_id, id)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

-- Ensure invoice items always link directly to an existing invoice row.
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_invoice_fk
    FOREIGN KEY (business_id, invoice_id)
    REFERENCES public.invoices (business_id, id)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

-- Replace u_n2 with a partial unique index so null source_quotation_item_ids do not conflict.
ALTER TABLE public.invoice_items DROP CONSTRAINT u_n2;
CREATE UNIQUE INDEX u_n2 ON public.invoice_items (business_id, invoice_id, source_quotation_item_id) WHERE source_quotation_item_id IS NOT NULL;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_line_source_ck
    CHECK (
      (source_version_id IS NOT NULL AND source_quotation_item_id IS NOT NULL) OR
      (source_version_id IS NULL AND source_quotation_item_id IS NULL)
    );

-- Index for customer invoice lookup
CREATE INDEX IF NOT EXISTS x_i_direct_customer ON public.invoices (business_id, customer_id, issued_at DESC);

-- Direct invoice creation function
CREATE FUNCTION private.create_direct_invoice(
  p_request_key uuid,
  p_customer_id uuid,
  p_due_on date,
  p_snapshot jsonb,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_existing_id uuid;
  v_existing_customer_id uuid;
  v_customer public.customers%ROWTYPE;
  v_business public.businesses%ROWTYPE;
  v_effective_snapshot jsonb;
  v_calculation jsonb;
  v_calc_lines jsonb;
  v_period public.invoice_number_sequences%ROWTYPE;
  v_candidate_date date;
  v_issued_at timestamptz;
  v_invoice_date date;
  v_sequence_number numeric;
  v_number_text text;
  v_expected_reference text;
  v_invoice_id uuid;
  v_doc_time_zone text;
  v_auto_treatment text;
  v_treatment text;
  v_treatment_override text;
  v_pos_applicable boolean;
  v_pos_state text;
  v_pos_text text;
  v_rev_charge boolean;
  v_seller_gst_reg boolean;
  v_buyer_gstin_app boolean;
  v_terms text;
  v_pay_instructions text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  IF p_request_key IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Customer and request key are required';
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
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/gst-options', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('webameen/invoice-create/' || p_request_key::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.user_id = v_user_id AND m.business_id = v_business_id
      AND m.role = 'owner' AND m.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;

  -- Idempotency check on request_key
  SELECT i.id, i.customer_id INTO v_existing_id, v_existing_customer_id
  FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.request_key = p_request_key;
  IF FOUND THEN
    IF v_existing_customer_id <> p_customer_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Creation key belongs to a different customer';
    END IF;
    RETURN pg_catalog.jsonb_build_object('invoice_id', v_existing_id, 'created', false);
  END IF;

  -- Verify active customer
  SELECT c.* INTO v_customer
  FROM public.customers AS c
  WHERE c.business_id = v_business_id AND c.id = p_customer_id AND c.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select an active customer';
  END IF;

  -- Verify business
  SELECT b.* INTO v_business
  FROM public.businesses AS b
  WHERE b.id = v_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Business unavailable';
  END IF;

  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
    OR pg_catalog.jsonb_array_length(p_lines) = 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'At least one invoice line item is required';
  END IF;

  v_effective_snapshot := COALESCE(p_snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'seller_state_code', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'seller_state_code'), ''), v_business.state_code),
    'buyer_state_code', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_state_code'), ''), v_customer.state_code),
    'seller_display_name', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'seller_display_name'), ''), v_business.display_name),
    'seller_postal_address', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'seller_postal_address'), ''), v_business.postal_address),
    'buyer_display_name', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_display_name'), ''), v_customer.display_name),
    'buyer_billing_address', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_billing_address'), ''), v_customer.billing_address)
  );

  IF COALESCE(NULLIF(pg_catalog.btrim(v_effective_snapshot->>'buyer_billing_address'), ''), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Buyer billing address is required';
  END IF;
  IF COALESCE(NULLIF(pg_catalog.btrim(v_effective_snapshot->>'seller_postal_address'), ''), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Seller postal address is required';
  END IF;
  IF COALESCE(NULLIF(pg_catalog.btrim(v_effective_snapshot->>'seller_state_code'), ''), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Seller state code is required';
  END IF;
  IF COALESCE(NULLIF(pg_catalog.btrim(v_effective_snapshot->>'buyer_state_code'), ''), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Buyer state code is required';
  END IF;

  -- Reuses established calculation rules and GST rate validations
  v_calculation := private.calculate_quotation_draft(v_business_id, v_effective_snapshot, p_lines);
  v_calc_lines := v_calculation->'lines';

  v_doc_time_zone := COALESCE(NULLIF(pg_catalog.btrim(v_effective_snapshot->>'document_time_zone'), ''), v_business.time_zone);
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_doc_time_zone) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid document time zone';
  END IF;

  v_candidate_date := (pg_catalog.statement_timestamp() AT TIME ZONE v_doc_time_zone)::date;
  SELECT p.* INTO v_period
  FROM public.invoice_number_sequences AS p
  WHERE p.business_id = v_business_id
    AND p.starts_on <= v_candidate_date AND v_candidate_date < p.ends_before
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No invoice numbering period covers the current document date';
  END IF;

  v_issued_at := pg_catalog.clock_timestamp();
  v_invoice_date := (v_issued_at AT TIME ZONE v_doc_time_zone)::date;
  IF v_invoice_date < v_period.starts_on OR v_invoice_date >= v_period.ends_before THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Invoice date crossed a numbering period boundary; retry the issue';
  END IF;
  IF p_due_on IS NOT NULL AND p_due_on < v_invoice_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Due date cannot precede the invoice date';
  END IF;

  v_sequence_number := CASE
    WHEN v_period.last_issued_number IS NULL THEN v_period.starting_number::numeric
    ELSE v_period.last_issued_number::numeric + 1
  END;
  IF v_sequence_number > 9223372036854775807::numeric THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'Invoice numbering period is exhausted';
  END IF;
  v_number_text := pg_catalog.lpad(
    v_sequence_number::text,
    greatest(v_period.minimum_digits::integer, pg_catalog.length(v_sequence_number::text)),
    '0'
  );

  SELECT pg_catalog.string_agg(
    CASE pieces.part[1]
      WHEN '{number}' THEN v_number_text
      WHEN '{prefix}' THEN v_period.prefix
      WHEN '{period}' THEN v_period.period_key
      ELSE pieces.part[1]
    END,
    '' ORDER BY pieces.ordinal
  ) INTO v_expected_reference
  FROM pg_catalog.regexp_matches(
    v_period.format_template,
    '([{]prefix[}]|[{]period[}]|[{]number[}]|[^{}]+)',
    'g'
  ) WITH ORDINALITY AS pieces(part, ordinal);

  UPDATE public.invoice_number_sequences AS p SET
    last_issued_number = v_sequence_number::bigint,
    updated_at = pg_catalog.clock_timestamp()
  WHERE p.business_id = v_business_id AND p.period_key = v_period.period_key;

  v_auto_treatment := v_calculation->>'auto_treatment';
  v_treatment := v_calculation->>'treatment';
  v_treatment_override := NULLIF(pg_catalog.btrim(v_effective_snapshot->>'gst_treatment_override'), '');
  v_pos_applicable := COALESCE((v_effective_snapshot->>'place_of_supply_applicable')::boolean, false);
  IF v_pos_applicable THEN
    v_pos_state := NULLIF(pg_catalog.btrim(v_effective_snapshot->>'place_of_supply_state_code'), '');
    v_pos_text := NULLIF(pg_catalog.btrim(v_effective_snapshot->>'place_of_supply_text'), '');
  ELSE
    v_pos_state := NULL;
    v_pos_text := NULL;
  END IF;
  v_rev_charge := COALESCE((v_effective_snapshot->>'reverse_charge_applies')::boolean, false);
  v_seller_gst_reg := COALESCE((v_effective_snapshot->>'seller_gst_registered')::boolean, v_business.gst_registered, false);
  v_buyer_gstin_app := COALESCE((v_effective_snapshot->>'buyer_gstin_applicable')::boolean, v_customer.gstin_applicable, false);
  v_terms := NULLIF(pg_catalog.btrim(v_effective_snapshot->>'terms'), '');
  v_pay_instructions := NULLIF(pg_catalog.btrim(v_effective_snapshot->>'payment_instructions'), '');

  INSERT INTO public.invoices (
    business_id, quotation_id, customer_id, source_version_id, approved_response_id,
    origin, request_key,
    numbering_period, sequence_number, reference, issued_at, invoice_date, due_on, created_by,
    seller_display_name, seller_contact_email, seller_contact_phone, seller_postal_address,
    seller_country_code, seller_state_code, seller_gst_registered, seller_gstin,
    seller_logo_asset_key, seller_logo_sha256, seller_signature_asset_key, seller_signature_sha256,
    buyer_display_name, buyer_contact_name, buyer_email, buyer_phone, buyer_billing_address,
    buyer_state_code, buyer_gstin_applicable, buyer_gstin, currency_code, currency_exponent,
    quantity_scale, calculation_rule_code, price_tax_mode, gst_auto_treatment,
    gst_treatment_override, gst_treatment, document_time_zone, place_of_supply_applicable,
    place_of_supply_state_code, place_of_supply_text, reverse_charge_applies, subtotal_minor,
    taxable_subtotal_minor, cgst_total_minor, sgst_total_minor, igst_total_minor, gst_total_minor,
    total_minor, seller_bank_name, seller_bank_account_name, seller_bank_account_number,
    seller_bank_ifsc, seller_upi_id, payment_instructions, terms
  ) VALUES (
    v_business_id, NULL, p_customer_id, NULL, NULL,
    'direct', p_request_key,
    v_period.period_key, v_sequence_number::bigint, v_expected_reference,
    v_issued_at, v_invoice_date, p_due_on, v_user_id,
    (v_effective_snapshot->>'seller_display_name'),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_contact_email', v_business.contact_email)), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_contact_phone', v_business.contact_phone)), ''),
    (v_effective_snapshot->>'seller_postal_address'),
    'IN',
    (v_effective_snapshot->>'seller_state_code'),
    v_seller_gst_reg,
    CASE WHEN v_seller_gst_reg THEN NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_gstin', v_business.gstin)), '') ELSE NULL END,
    v_business.logo_asset_key, v_business.logo_sha256,
    v_business.signature_asset_key, v_business.signature_sha256,
    (v_effective_snapshot->>'buyer_display_name'),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'buyer_contact_name', v_customer.contact_name)), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'buyer_email', v_customer.email)), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'buyer_phone', v_customer.phone)), ''),
    (v_effective_snapshot->>'buyer_billing_address'),
    (v_effective_snapshot->>'buyer_state_code'),
    v_buyer_gstin_app,
    CASE WHEN v_buyer_gstin_app THEN NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'buyer_gstin', v_customer.gstin)), '') ELSE NULL END,
    'INR', 2,
    3, 'in-gst-exclusive-line-paise-half-up-v1', 'exclusive',
    v_auto_treatment, v_treatment_override, v_treatment,
    v_doc_time_zone, v_pos_applicable, v_pos_state, v_pos_text, v_rev_charge,
    (v_calculation->>'subtotal_minor')::bigint,
    (v_calculation->>'taxable_subtotal_minor')::bigint,
    (v_calculation->>'cgst_total_minor')::bigint,
    (v_calculation->>'sgst_total_minor')::bigint,
    (v_calculation->>'igst_total_minor')::bigint,
    (v_calculation->>'gst_total_minor')::bigint,
    (v_calculation->>'total_minor')::bigint,
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_bank_name', v_business.bank_name)), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_bank_account_name', v_business.bank_account_name)), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_bank_account_number', v_business.bank_account_number)), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_bank_ifsc', v_business.bank_ifsc)), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_effective_snapshot->>'seller_upi_id', v_business.upi_id)), ''),
    COALESCE(v_pay_instructions, v_business.payment_instructions),
    COALESCE(v_terms, v_business.default_terms)
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_items (
    business_id, invoice_id, source_version_id, source_quotation_item_id,
    source_catalog_item_id, position, description, unit_label, hsn_sac,
    quantity, unit_price_minor, line_subtotal_minor, gst_category, gst_treatment,
    gst_rate, taxable_amount_minor, cgst_rate, cgst_amount_minor, sgst_rate,
    sgst_amount_minor, igst_rate, igst_amount_minor, line_total_minor
  )
  SELECT
    v_business_id,
    v_invoice_id,
    NULL,
    NULL,
    CASE WHEN (line_elem->>'source_catalog_item_id') IS NOT NULL AND (line_elem->>'source_catalog_item_id') <> ''
      THEN (line_elem->>'source_catalog_item_id')::uuid
      ELSE NULL
    END,
    (line_elem->>'position')::integer,
    line_elem->>'description',
    NULLIF(line_elem->>'unit_label', ''),
    NULLIF(line_elem->>'hsn_sac', ''),
    (line_elem->>'quantity')::numeric,
    (line_elem->>'unit_price_minor')::bigint,
    (line_elem->>'line_subtotal_minor')::bigint,
    line_elem->>'gst_category',
    line_elem->>'gst_treatment',
    CASE WHEN (line_elem->>'gst_rate') IS NOT NULL THEN (line_elem->>'gst_rate')::numeric ELSE NULL END,
    (line_elem->>'taxable_amount_minor')::bigint,
    CASE WHEN (line_elem->>'cgst_rate') IS NOT NULL THEN (line_elem->>'cgst_rate')::numeric ELSE NULL END,
    (line_elem->>'cgst_amount_minor')::bigint,
    CASE WHEN (line_elem->>'sgst_rate') IS NOT NULL THEN (line_elem->>'sgst_rate')::numeric ELSE NULL END,
    (line_elem->>'sgst_amount_minor')::bigint,
    CASE WHEN (line_elem->>'igst_rate') IS NOT NULL THEN (line_elem->>'igst_rate')::numeric ELSE NULL END,
    (line_elem->>'igst_amount_minor')::bigint,
    (line_elem->>'line_total_minor')::bigint
  FROM pg_catalog.jsonb_array_elements(v_calc_lines) AS line_elem;

  RETURN pg_catalog.jsonb_build_object('invoice_id', v_invoice_id, 'created', true);
END
$fn$;

CREATE FUNCTION public.create_direct_invoice(
  p_request_key uuid,
  p_customer_id uuid,
  p_due_on date,
  p_snapshot jsonb,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.create_direct_invoice(p_request_key, p_customer_id, p_due_on, p_snapshot, p_lines)
$fn$;

CREATE FUNCTION private.preview_direct_invoice(
  p_customer_id uuid,
  p_snapshot jsonb,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_customer public.customers%ROWTYPE;
  v_business public.businesses%ROWTYPE;
  v_effective_snapshot jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
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
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/gst-options', 0)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.user_id = v_user_id AND m.business_id = v_business_id
      AND m.role = 'owner' AND m.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers AS c
  WHERE c.business_id = v_business_id AND c.id = p_customer_id AND c.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner and customer required';
  END IF;

  SELECT b.* INTO v_business
  FROM public.businesses AS b
  WHERE b.id = v_business_id;

  v_effective_snapshot := COALESCE(p_snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'seller_state_code', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'seller_state_code'), ''), v_business.state_code),
    'buyer_state_code', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_state_code'), ''), v_customer.state_code),
    'seller_display_name', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'seller_display_name'), ''), v_business.display_name),
    'seller_postal_address', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'seller_postal_address'), ''), v_business.postal_address),
    'buyer_display_name', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_display_name'), ''), v_customer.display_name),
    'buyer_billing_address', COALESCE(NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_billing_address'), ''), v_customer.billing_address)
  );

  RETURN private.calculate_quotation_draft(v_business_id, v_effective_snapshot, p_lines);
END
$fn$;

CREATE FUNCTION public.preview_direct_invoice(
  p_customer_id uuid,
  p_snapshot jsonb,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.preview_direct_invoice(p_customer_id, p_snapshot, p_lines)
$fn$;

REVOKE ALL ON FUNCTION private.create_direct_invoice(uuid,uuid,date,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_direct_invoice(uuid,uuid,date,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.preview_direct_invoice(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.preview_direct_invoice(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.create_direct_invoice(uuid,uuid,date,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_invoice(uuid,uuid,date,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.preview_direct_invoice(uuid,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_direct_invoice(uuid,jsonb,jsonb) TO authenticated;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.create_direct_invoice(uuid,uuid,date,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.preview_direct_invoice(uuid,jsonb,jsonb) OWNER TO webameen_executor;

CREATE OR REPLACE FUNCTION private.guard_invoice_issue() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  period public.invoice_number_sequences;
  version public.quotation_versions;
  digits text;
  expected_reference text;
BEGIN
  SELECT * INTO period FROM public.invoice_number_sequences
  WHERE business_id = NEW.business_id AND period_key = NEW.numbering_period FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sequence_number IS DISTINCT FROM period.last_issued_number
     OR NEW.sequence_number < period.starting_number THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice number must match its transactional allocation';
  END IF;

  digits := NEW.sequence_number::text;
  digits := lpad(digits, greatest(period.minimum_digits, length(digits)), '0');

  SELECT string_agg(
    CASE pieces.part[1] WHEN '{number}' THEN digits WHEN '{prefix}' THEN period.prefix
      WHEN '{period}' THEN period.period_key ELSE pieces.part[1] END, '' ORDER BY pieces.ordinal
  ) INTO expected_reference
  FROM regexp_matches(period.format_template, '([{]prefix[}]|[{]period[}]|[{]number[}]|[^{}]+)', 'g')
    WITH ORDINALITY AS pieces(part, ordinal);

  IF NEW.reference IS DISTINCT FROM expected_reference
     OR NEW.invoice_date IS DISTINCT FROM (NEW.issued_at AT TIME ZONE NEW.document_time_zone)::date
     OR NEW.invoice_date < period.starts_on OR NEW.invoice_date >= period.ends_before THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice reference/date does not match frozen issuance settings';
  END IF;

  IF NEW.origin = 'direct' THEN
    IF NEW.quotation_id IS NOT NULL OR NEW.source_version_id IS NOT NULL OR NEW.approved_response_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Direct invoice cannot have quotation linkage';
    END IF;
    IF NEW.due_on IS NOT NULL AND NEW.due_on < NEW.invoice_date THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice due date cannot precede invoice date';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO version FROM public.quotation_versions WHERE business_id = NEW.business_id AND id = NEW.source_version_id;
  IF version.state IS DISTINCT FROM 'approved' OR NOT EXISTS (
    SELECT FROM public.quotations WHERE business_id = NEW.business_id AND id = NEW.quotation_id AND current_version_id = NEW.source_version_id
  ) OR NOT EXISTS (
    SELECT FROM public.quotation_responses WHERE business_id = NEW.business_id AND id = NEW.approved_response_id AND version_id = NEW.source_version_id AND kind = 'approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice requires current approved quotation and exact approval';
  END IF;

  IF NEW.issued_at < version.shared_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice reference/date does not match frozen issuance settings';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION private.check_invoice_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  b uuid;
  i uuid;
  inv public.invoices;
  source public.quotation_versions;
BEGIN
  b := NEW.business_id;
  IF TG_TABLE_NAME = 'invoices' THEN i := NEW.id; ELSE i := NEW.invoice_id; END IF;
  SELECT * INTO inv FROM public.invoices WHERE business_id = b AND id = i;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF inv.origin = 'direct' THEN
    IF NOT EXISTS (SELECT FROM public.invoice_items WHERE business_id = b AND invoice_id = i) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice requires at least one line item';
    END IF;
    IF EXISTS (
      SELECT FROM public.invoice_items n
      WHERE business_id = b AND invoice_id = i
        AND (n.position < 1 OR n.position > (SELECT count(*) FROM public.invoice_items WHERE business_id = b AND invoice_id = i))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice lines must have contiguous valid positions';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO source FROM public.quotation_versions WHERE business_id = b AND id = inv.source_version_id;
  IF ROW(inv.seller_display_name, inv.seller_contact_email, inv.seller_contact_phone, inv.seller_postal_address, inv.seller_country_code, inv.seller_state_code, inv.seller_gst_registered, inv.seller_gstin, inv.seller_logo_asset_key, inv.seller_logo_sha256, inv.seller_signature_asset_key, inv.seller_signature_sha256, inv.buyer_display_name, inv.buyer_contact_name, inv.buyer_email, inv.buyer_phone, inv.buyer_billing_address, inv.buyer_state_code, inv.buyer_gstin_applicable, inv.buyer_gstin, inv.currency_code, inv.currency_exponent, inv.quantity_scale, inv.calculation_rule_code, inv.price_tax_mode, inv.gst_auto_treatment, inv.gst_treatment_override, inv.gst_treatment, inv.document_time_zone, inv.place_of_supply_applicable, inv.place_of_supply_state_code, inv.place_of_supply_text, inv.reverse_charge_applies, inv.subtotal_minor, inv.taxable_subtotal_minor, inv.cgst_total_minor, inv.sgst_total_minor, inv.igst_total_minor, inv.gst_total_minor, inv.total_minor, inv.seller_bank_name, inv.seller_bank_account_name, inv.seller_bank_account_number, inv.seller_bank_ifsc, inv.seller_upi_id, inv.payment_instructions, inv.terms)
     IS DISTINCT FROM ROW(source.seller_display_name, source.seller_contact_email, source.seller_contact_phone, source.seller_postal_address, source.seller_country_code, source.seller_state_code, source.seller_gst_registered, source.seller_gstin, source.seller_logo_asset_key, source.seller_logo_sha256, source.seller_signature_asset_key, source.seller_signature_sha256, source.buyer_display_name, source.buyer_contact_name, source.buyer_email, source.buyer_phone, source.buyer_billing_address, source.buyer_state_code, source.buyer_gstin_applicable, source.buyer_gstin, source.currency_code, source.currency_exponent, source.quantity_scale, source.calculation_rule_code, source.price_tax_mode, source.gst_auto_treatment, source.gst_treatment_override, source.gst_treatment, source.document_time_zone, source.place_of_supply_applicable, source.place_of_supply_state_code, source.place_of_supply_text, source.reverse_charge_applies, source.subtotal_minor, source.taxable_subtotal_minor, source.cgst_total_minor, source.sgst_total_minor, source.igst_total_minor, source.gst_total_minor, source.total_minor, source.seller_bank_name, source.seller_bank_account_name, source.seller_bank_account_number, source.seller_bank_ifsc, source.seller_upi_id, source.payment_instructions, source.terms) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Every invoice document field must equal its approved snapshot';
  END IF;
  IF NOT EXISTS (SELECT FROM public.invoice_items WHERE business_id = b AND invoice_id = i) OR EXISTS (
    SELECT FROM
      (SELECT * FROM public.quotation_items WHERE business_id = b AND version_id = inv.source_version_id) q
      FULL JOIN (SELECT * FROM public.invoice_items WHERE business_id = b AND invoice_id = i) n
      ON q.id = n.source_quotation_item_id
    WHERE q.id IS NULL OR n.id IS NULL OR q.position IS DISTINCT FROM n.position
       OR ROW(q.description, q.unit_label, q.hsn_sac, q.quantity, q.unit_price_minor, q.line_subtotal_minor, q.gst_category, q.gst_treatment, q.gst_rate, q.taxable_amount_minor, q.cgst_rate, q.cgst_amount_minor, q.sgst_rate, q.sgst_amount_minor, q.igst_rate, q.igst_amount_minor, q.line_total_minor)
          IS DISTINCT FROM ROW(n.description, n.unit_label, n.hsn_sac, n.quantity, n.unit_price_minor, n.line_subtotal_minor, n.gst_category, n.gst_treatment, n.gst_rate, n.taxable_amount_minor, n.cgst_rate, n.cgst_amount_minor, n.sgst_rate, n.sgst_amount_minor, n.igst_rate, n.igst_amount_minor, n.line_total_minor)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice source IDs, positions and every line field must match exactly';
  END IF;
  RETURN NULL;
END
$fn$;

ALTER FUNCTION private.guard_invoice_issue() OWNER TO webameen_executor;
ALTER FUNCTION private.check_invoice_snapshot() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_invoice_issue() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION private.check_invoice_snapshot() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;

REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
