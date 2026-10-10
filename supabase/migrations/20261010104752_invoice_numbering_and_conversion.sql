BEGIN;

-- Numbering periods are configured from owner-supplied dates and formats. No
-- financial-year boundary or statutory invoice format is inferred here.
CREATE FUNCTION private.configure_invoice_number_period(
  p_period_key text,
  p_starts_on date,
  p_ends_before date,
  p_prefix text,
  p_format_template text,
  p_minimum_digits smallint,
  p_starting_number bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_period_key text := NULLIF(pg_catalog.btrim(p_period_key), '');
  v_prefix text := pg_catalog.btrim(p_prefix);
  v_template text := NULLIF(pg_catalog.btrim(p_format_template), '');
  v_sequence public.invoice_number_sequences%ROWTYPE;
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.user_id = v_user_id AND m.business_id = v_business_id
      AND m.role = 'owner' AND m.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;

  IF v_period_key IS NULL OR pg_catalog.length(v_period_key) > 80
    OR p_starts_on IS NULL OR p_ends_before IS NULL OR p_ends_before <= p_starts_on
    OR p_prefix IS NULL
    OR pg_catalog.length(v_prefix) > 80
    OR v_template IS NULL OR pg_catalog.length(v_template) > 160
    OR p_minimum_digits IS NULL OR p_minimum_digits NOT BETWEEN 1 AND 19
    OR p_starting_number IS NULL OR p_starting_number <= 0
    OR (pg_catalog.length(v_template) - pg_catalog.length(pg_catalog.replace(v_template, '{number}', ''))) <> pg_catalog.length('{number}')
    OR pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(v_template, '{number}', ''), '{prefix}', ''), '{period}', '') ~ '[{}]'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid invoice numbering period settings';
  END IF;

  INSERT INTO public.invoice_number_sequences AS current_period (
    business_id, period_key, starts_on, ends_before, prefix,
    format_template, minimum_digits, starting_number, created_by
  ) VALUES (
    v_business_id, v_period_key, p_starts_on, p_ends_before, v_prefix,
    v_template, p_minimum_digits, p_starting_number, v_user_id
  )
  ON CONFLICT (business_id, period_key) DO UPDATE SET
    starts_on = EXCLUDED.starts_on,
    ends_before = EXCLUDED.ends_before,
    prefix = EXCLUDED.prefix,
    format_template = EXCLUDED.format_template,
    minimum_digits = EXCLUDED.minimum_digits,
    starting_number = EXCLUDED.starting_number,
    updated_at = pg_catalog.clock_timestamp()
  RETURNING current_period.* INTO v_sequence;

  RETURN pg_catalog.jsonb_build_object(
    'period_key', v_sequence.period_key,
    'starts_on', v_sequence.starts_on,
    'ends_before', v_sequence.ends_before,
    'prefix', v_sequence.prefix,
    'format_template', v_sequence.format_template,
    'minimum_digits', v_sequence.minimum_digits,
    'starting_number', v_sequence.starting_number::text,
    'last_issued_number', v_sequence.last_issued_number::text,
    'used', v_sequence.last_issued_number IS NOT NULL
  );
END
$fn$;

CREATE FUNCTION public.configure_invoice_number_period(
  p_period_key text,
  p_starts_on date,
  p_ends_before date,
  p_prefix text,
  p_format_template text,
  p_minimum_digits smallint,
  p_starting_number bigint
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.configure_invoice_number_period(
    p_period_key, p_starts_on, p_ends_before, p_prefix,
    p_format_template, p_minimum_digits, p_starting_number
  )
$fn$;

CREATE FUNCTION private.convert_approved_quotation(
  p_quotation_id uuid,
  p_due_on date,
  p_confirmed_review boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_customer_id uuid;
  v_version_id uuid;
  v_existing_id uuid;
  v_approval_id uuid;
  v_version public.quotation_versions%ROWTYPE;
  v_period public.invoice_number_sequences%ROWTYPE;
  v_candidate_date date;
  v_issued_at timestamptz;
  v_invoice_date date;
  v_sequence_number numeric;
  v_number_text text;
  v_expected_reference text;
  v_invoice_id uuid;
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

  -- Lock order is shared business, quotation, then numbering period. Disabling
  -- membership and period changes take the exclusive business lock.
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

  SELECT q.customer_id, q.current_version_id
    INTO v_customer_id, v_version_id
  FROM public.quotations AS q
  WHERE q.business_id = v_business_id AND q.id = p_quotation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Quotation unavailable';
  END IF;

  -- The quotation key is the idempotency key. A retry returns the issued
  -- invoice before checking fresh form values or current quotation state.
  SELECT i.id INTO v_existing_id
  FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.quotation_id = p_quotation_id;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('invoice_id', v_existing_id, 'created', false);
  END IF;

  IF p_confirmed_review IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Review the approved quotation before issuing an invoice';
  END IF;

  SELECT v.* INTO v_version
  FROM public.quotation_versions AS v
  WHERE v.business_id = v_business_id AND v.quotation_id = p_quotation_id
    AND v.id = v_version_id;
  IF NOT FOUND OR v_version.state IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice requires the current approved quotation version';
  END IF;

  SELECT r.id INTO v_approval_id
  FROM public.quotation_responses AS r
  WHERE r.business_id = v_business_id AND r.quotation_id = p_quotation_id
    AND r.version_id = v_version_id AND r.kind = 'approved';
  IF v_approval_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice requires recorded customer approval';
  END IF;

  -- statement_timestamp selects the candidate period; issued_at and the final
  -- local date are captured only after the period row lock has been acquired.
  v_candidate_date := (pg_catalog.statement_timestamp() AT TIME ZONE v_version.document_time_zone)::date;
  SELECT p.* INTO v_period
  FROM public.invoice_number_sequences AS p
  WHERE p.business_id = v_business_id
    AND p.starts_on <= v_candidate_date AND v_candidate_date < p.ends_before
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No invoice numbering period covers the current document date';
  END IF;

  v_issued_at := pg_catalog.clock_timestamp();
  v_invoice_date := (v_issued_at AT TIME ZONE v_version.document_time_zone)::date;
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

  INSERT INTO public.invoices (
    business_id, quotation_id, customer_id, source_version_id, approved_response_id,
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
  )
  SELECT
    v_business_id, p_quotation_id, v_customer_id, v_version_id, v_approval_id,
    v_period.period_key, v_sequence_number::bigint, v_expected_reference,
    v_issued_at, v_invoice_date, p_due_on, v_user_id,
    v.seller_display_name, v.seller_contact_email, v.seller_contact_phone, v.seller_postal_address,
    v.seller_country_code, v.seller_state_code, v.seller_gst_registered, v.seller_gstin,
    v.seller_logo_asset_key, v.seller_logo_sha256, v.seller_signature_asset_key, v.seller_signature_sha256,
    v.buyer_display_name, v.buyer_contact_name, v.buyer_email, v.buyer_phone, v.buyer_billing_address,
    v.buyer_state_code, v.buyer_gstin_applicable, v.buyer_gstin, v.currency_code, v.currency_exponent,
    v.quantity_scale, v.calculation_rule_code, v.price_tax_mode, v.gst_auto_treatment,
    v.gst_treatment_override, v.gst_treatment, v.document_time_zone, v.place_of_supply_applicable,
    v.place_of_supply_state_code, v.place_of_supply_text, v.reverse_charge_applies, v.subtotal_minor,
    v.taxable_subtotal_minor, v.cgst_total_minor, v.sgst_total_minor, v.igst_total_minor, v.gst_total_minor,
    v.total_minor, v.seller_bank_name, v.seller_bank_account_name, v.seller_bank_account_number,
    v.seller_bank_ifsc, v.seller_upi_id, v.payment_instructions, v.terms
  FROM public.quotation_versions AS v
  WHERE v.business_id = v_business_id AND v.id = v_version_id
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_items (
    business_id, invoice_id, source_version_id, source_quotation_item_id, position,
    description, unit_label, hsn_sac, quantity, unit_price_minor, line_subtotal_minor,
    gst_category, gst_treatment, gst_rate, taxable_amount_minor, cgst_rate, cgst_amount_minor,
    sgst_rate, sgst_amount_minor, igst_rate, igst_amount_minor, line_total_minor
  )
  SELECT
    q.business_id, v_invoice_id, q.version_id, q.id, q.position,
    q.description, q.unit_label, q.hsn_sac, q.quantity, q.unit_price_minor, q.line_subtotal_minor,
    q.gst_category, q.gst_treatment, q.gst_rate, q.taxable_amount_minor, q.cgst_rate, q.cgst_amount_minor,
    q.sgst_rate, q.sgst_amount_minor, q.igst_rate, q.igst_amount_minor, q.line_total_minor
  FROM public.quotation_items AS q
  WHERE q.business_id = v_business_id AND q.version_id = v_version_id;

  RETURN pg_catalog.jsonb_build_object('invoice_id', v_invoice_id, 'created', true);
END
$fn$;

CREATE FUNCTION public.convert_approved_quotation(
  p_quotation_id uuid,
  p_due_on date,
  p_confirmed_review boolean
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.convert_approved_quotation(p_quotation_id, p_due_on, p_confirmed_review)
$fn$;

REVOKE ALL ON FUNCTION private.configure_invoice_number_period(text,date,date,text,text,smallint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.configure_invoice_number_period(text,date,date,text,text,smallint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.convert_approved_quotation(uuid,date,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.convert_approved_quotation(uuid,date,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.configure_invoice_number_period(text,date,date,text,text,smallint,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_invoice_number_period(text,date,date,text,text,smallint,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.convert_approved_quotation(uuid,date,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_approved_quotation(uuid,date,boolean)
  TO authenticated;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.configure_invoice_number_period(text,date,date,text,text,smallint,bigint)
  OWNER TO webameen_executor;
ALTER FUNCTION private.convert_approved_quotation(uuid,date,boolean)
  OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
