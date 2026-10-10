BEGIN;

-- Owner-entered manual payments. Payment and receipt rows are inserted as one
-- transaction; corrections retain the original payment and receipt records.
CREATE OR REPLACE FUNCTION private.record_invoice_payment(
  p_invoice_id uuid,
  p_request_key uuid,
  p_amount_minor bigint,
  p_received_local timestamp without time zone,
  p_method text,
  p_external_reference text,
  p_replaces_payment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_invoice public.invoices%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_predecessor_receipt public.receipts%ROWTYPE;
  v_receipt public.receipts%ROWTYPE;
  v_method text := NULLIF(pg_catalog.btrim(p_method), '');
  v_external_reference text := NULLIF(pg_catalog.btrim(p_external_reference), '');
  v_received_at timestamptz;
  v_paid numeric;
  v_payment_id uuid;
  v_receipt_id uuid;
  v_receipt_reference text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  IF p_invoice_id IS NULL OR p_request_key IS NULL OR p_amount_minor IS NULL
    OR p_amount_minor <= 0 OR p_received_local IS NULL
    OR v_method IS NULL OR pg_catalog.length(v_method) > 80
    OR pg_catalog.length(COALESCE(v_external_reference, '')) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid payment details';
  END IF;

  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;

  -- Shared business -> invoice -> request key is the common financial lock order.
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
  SELECT i.* INTO v_invoice
  FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Invoice unavailable';
  END IF;

  v_received_at := p_received_local AT TIME ZONE v_invoice.document_time_zone;
  IF (v_received_at AT TIME ZONE v_invoice.document_time_zone) IS DISTINCT FROM p_received_local THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Received time does not exist in the invoice time zone';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'webameen/payment-request/' || v_business_id::text || '/' || p_request_key::text, 0
    )
  );

  -- Resolve a retry before checking current outstanding balance. A retry after
  -- a later reversal still returns the original immutable payment/receipt pair.
  SELECT p.* INTO v_existing
  FROM public.payments AS p
  WHERE p.business_id = v_business_id AND p.request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.invoice_id IS DISTINCT FROM p_invoice_id
      OR v_existing.amount_minor IS DISTINCT FROM p_amount_minor
      OR v_existing.received_at IS DISTINCT FROM v_received_at
      OR v_existing.method IS DISTINCT FROM v_method
      OR v_existing.external_reference IS DISTINCT FROM v_external_reference
      OR v_existing.replaces_payment_id IS DISTINCT FROM p_replaces_payment_id
      OR v_existing.created_by IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Payment request key was reused with different details';
    END IF;
    SELECT r.* INTO v_receipt
    FROM public.receipts AS r
    WHERE r.business_id = v_business_id AND r.payment_id = v_existing.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Payment receipt is unavailable';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'created', false,
      'payment_id', v_existing.id,
      'receipt_id', v_receipt.id,
      'receipt_reference', v_receipt.reference,
      'reversed', EXISTS (
        SELECT 1 FROM public.payment_reversals AS r
        WHERE r.business_id = v_business_id AND r.payment_id = v_existing.id
      )
    );
  END IF;

  IF v_received_at < v_invoice.issued_at OR v_received_at > pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Received time must be after invoice issue and not in the future';
  END IF;

  IF p_replaces_payment_id IS NOT NULL THEN
    PERFORM 1 FROM public.payments AS p
    WHERE p.business_id = v_business_id AND p.invoice_id = p_invoice_id
      AND p.id = p_replaces_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Replacement payment unavailable';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_reversals AS r
      WHERE r.business_id = v_business_id AND r.invoice_id = p_invoice_id
        AND r.payment_id = p_replaces_payment_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Replacement requires a reversed payment on this invoice';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payments AS p
      WHERE p.business_id = v_business_id AND p.replaces_payment_id = p_replaces_payment_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This payment already has a replacement';
    END IF;
    SELECT r.* INTO v_predecessor_receipt
    FROM public.receipts AS r
    WHERE r.business_id = v_business_id AND r.invoice_id = p_invoice_id
      AND r.payment_id = p_replaces_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Replacement receipt predecessor is unavailable';
    END IF;
  END IF;

  SELECT COALESCE(pg_catalog.sum(p.amount_minor::numeric), 0) INTO v_paid
  FROM public.payments AS p
  WHERE p.business_id = v_business_id AND p.invoice_id = p_invoice_id
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_reversals AS r
      WHERE r.business_id = p.business_id AND r.payment_id = p.id
    );
  IF v_paid + p_amount_minor::numeric > v_invoice.total_minor::numeric THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Payment exceeds the current outstanding amount';
  END IF;

  v_payment_id := pg_catalog.gen_random_uuid();
  v_receipt_id := pg_catalog.gen_random_uuid();
  v_receipt_reference := 'RCP-' || pg_catalog.upper(v_receipt_id::text);
  INSERT INTO public.payments (
    id, business_id, invoice_id, amount_minor, currency_code, currency_exponent,
    received_at, method, external_reference, request_key, replaces_payment_id, created_by
  ) VALUES (
    v_payment_id, v_business_id, p_invoice_id, p_amount_minor,
    v_invoice.currency_code, v_invoice.currency_exponent,
    v_received_at, v_method, v_external_reference, p_request_key,
    p_replaces_payment_id, v_user_id
  );
  INSERT INTO public.receipts (
    id, business_id, invoice_id, payment_id, reference, amount_minor,
    currency_code, currency_exponent, replaces_receipt_id, issued_by
  ) VALUES (
    v_receipt_id, v_business_id, p_invoice_id, v_payment_id, v_receipt_reference,
    p_amount_minor, v_invoice.currency_code, v_invoice.currency_exponent,
    CASE WHEN p_replaces_payment_id IS NULL THEN NULL ELSE v_predecessor_receipt.id END,
    v_user_id
  );

  -- Run the deferred pair check while this restricted executor context is active.
  SET CONSTRAINTS public.receipt_completeness IMMEDIATE;
  SET CONSTRAINTS public.receipt_completeness DEFERRED;

  RETURN pg_catalog.jsonb_build_object(
    'created', true,
    'payment_id', v_payment_id,
    'receipt_id', v_receipt_id,
    'receipt_reference', v_receipt_reference,
    'reversed', false
  );
END
$fn$;

CREATE OR REPLACE FUNCTION private.reverse_invoice_payment(
  p_payment_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_invoice_id uuid;
  v_reversal public.payment_reversals%ROWTYPE;
  v_reason text := NULLIF(pg_catalog.btrim(p_reason), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  IF p_payment_id IS NULL OR v_reason IS NULL OR pg_catalog.length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter a payment and a reversal reason';
  END IF;

  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  SELECT p.invoice_id INTO v_invoice_id
  FROM public.payments AS p
  WHERE p.business_id = v_business_id AND p.id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment unavailable';
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
      'webameen/invoice/' || v_business_id::text || '/' || v_invoice_id::text, 0
    )
  );
  PERFORM 1 FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.id = v_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Invoice unavailable';
  END IF;
  PERFORM 1 FROM public.payments AS p
  WHERE p.business_id = v_business_id AND p.invoice_id = v_invoice_id
    AND p.id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment unavailable';
  END IF;

  SELECT r.* INTO v_reversal
  FROM public.payment_reversals AS r
  WHERE r.business_id = v_business_id AND r.payment_id = p_payment_id;
  IF FOUND THEN
    IF v_reversal.reason IS DISTINCT FROM v_reason
      OR v_reversal.reversed_by IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Payment was already reversed with different details';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'created', false,
      'payment_id', p_payment_id,
      'reversal_id', v_reversal.id,
      'reversed_at', v_reversal.reversed_at
    );
  END IF;

  INSERT INTO public.payment_reversals (
    business_id, invoice_id, payment_id, reason, reversed_by
  ) VALUES (
    v_business_id, v_invoice_id, p_payment_id, v_reason, v_user_id
  ) RETURNING * INTO v_reversal;
  RETURN pg_catalog.jsonb_build_object(
    'created', true,
    'payment_id', p_payment_id,
    'reversal_id', v_reversal.id,
    'reversed_at', v_reversal.reversed_at
  );
END
$fn$;

CREATE OR REPLACE FUNCTION private.get_invoice_payment_summary(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_invoice public.invoices%ROWTYPE;
  v_paid numeric;
  v_outstanding numeric;
  v_status text;
  v_local_today date;
  v_payments jsonb;
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
  SELECT i.* INTO v_invoice
  FROM public.invoices AS i
  WHERE i.business_id = v_business_id AND i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Invoice unavailable';
  END IF;

  SELECT COALESCE(pg_catalog.sum(p.amount_minor::numeric), 0) INTO v_paid
  FROM public.payments AS p
  WHERE p.business_id = v_business_id AND p.invoice_id = p_invoice_id
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_reversals AS r
      WHERE r.business_id = p.business_id AND r.payment_id = p.id
    );
  v_outstanding := v_invoice.total_minor::numeric - v_paid;
  v_status := CASE
    WHEN v_outstanding = 0 THEN 'paid'
    WHEN v_paid = 0 THEN 'unpaid'
    ELSE 'part_paid'
  END;
  v_local_today := (pg_catalog.statement_timestamp() AT TIME ZONE v_invoice.document_time_zone)::date;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'payment_id', p.id,
        'amount_minor', p.amount_minor::text,
        'received_at', p.received_at,
        'method', p.method,
        'external_reference', p.external_reference,
        'recorded_at', p.recorded_at,
        'replaces_payment_id', p.replaces_payment_id,
        'reversal', CASE WHEN r.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
          'reason', r.reason, 'reversed_at', r.reversed_at
        ) END,
        'receipt', CASE WHEN rc.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
          'id', rc.id, 'reference', rc.reference, 'issued_at', rc.issued_at,
          'replaces_receipt_id', rc.replaces_receipt_id
        ) END
      ) ORDER BY p.recorded_at, p.id
    ), '[]'::jsonb
  ) INTO v_payments
  FROM public.payments AS p
  LEFT JOIN public.payment_reversals AS r
    ON r.business_id = p.business_id AND r.invoice_id = p.invoice_id AND r.payment_id = p.id
  LEFT JOIN public.receipts AS rc
    ON rc.business_id = p.business_id AND rc.invoice_id = p.invoice_id AND rc.payment_id = p.id
  WHERE p.business_id = v_business_id AND p.invoice_id = p_invoice_id;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', v_invoice.id,
    'total_minor', v_invoice.total_minor::text,
    'currency_code', v_invoice.currency_code,
    'currency_exponent', v_invoice.currency_exponent,
    'due_on', v_invoice.due_on,
    'document_time_zone', v_invoice.document_time_zone,
    'local_today', v_local_today,
    'paid_minor', v_paid::text,
    'outstanding_minor', v_outstanding::text,
    'payment_status', v_status,
    'overdue', v_invoice.due_on IS NOT NULL
      AND v_invoice.due_on < v_local_today AND v_outstanding > 0,
    'payments', v_payments
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_request_key uuid,
  p_amount_minor bigint,
  p_received_local timestamp without time zone,
  p_method text,
  p_external_reference text,
  p_replaces_payment_id uuid
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.record_invoice_payment(
    p_invoice_id, p_request_key, p_amount_minor, p_received_local,
    p_method, p_external_reference, p_replaces_payment_id
  )
$fn$;

CREATE OR REPLACE FUNCTION public.reverse_invoice_payment(p_payment_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.reverse_invoice_payment(p_payment_id, p_reason)
$fn$;

CREATE OR REPLACE FUNCTION public.get_invoice_payment_summary(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.get_invoice_payment_summary(p_invoice_id)
$fn$;

REVOKE ALL ON FUNCTION private.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reverse_invoice_payment(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION public.reverse_invoice_payment(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.get_invoice_payment_summary(uuid)
  FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON FUNCTION public.get_invoice_payment_summary(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.reverse_invoice_payment(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_invoice_payment(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_invoice_payment_summary(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_payment_summary(uuid)
  TO authenticated;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)
  OWNER TO webameen_executor;
ALTER FUNCTION private.reverse_invoice_payment(uuid,text)
  OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
