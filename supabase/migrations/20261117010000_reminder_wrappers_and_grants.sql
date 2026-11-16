BEGIN;

-- 1. Table Grants for authenticated users (business owners) to manage schedules & occurrences
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reminder_schedules TO authenticated, webameen_executor;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reminder_occurrences TO authenticated, webameen_executor;
GRANT SELECT, INSERT ON public.invoice_reminder_deliveries TO authenticated, webameen_executor;

-- 2. Update private function get_authoritative_payment_status to support dynamic contact fallbacks
CREATE OR REPLACE FUNCTION private.get_authoritative_payment_status(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_paid numeric;
  v_outstanding numeric;
  v_status text;
  v_local_today date;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE business_id = v_invoice.business_id AND id = v_invoice.customer_id;

  SELECT COALESCE(pg_catalog.sum(p.amount_minor::numeric), 0) INTO v_paid
  FROM public.payments AS p
  WHERE p.business_id = v_invoice.business_id AND p.invoice_id = p_invoice_id
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_reversals AS r
      WHERE r.business_id = p.business_id AND r.payment_id = p.id
    );

  v_outstanding := v_invoice.total_minor::numeric - v_paid;
  v_status := CASE
    WHEN v_outstanding <= 0 THEN 'paid'
    WHEN v_paid = 0 THEN 'unpaid'
    ELSE 'part_paid'
  END;

  v_local_today := (pg_catalog.clock_timestamp() AT TIME ZONE v_invoice.document_time_zone)::date;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', v_invoice.id,
    'business_id', v_invoice.business_id,
    'reference', v_invoice.reference,
    'total_minor', v_invoice.total_minor::text,
    'paid_minor', v_paid::text,
    'outstanding_minor', v_outstanding::text,
    'currency_code', v_invoice.currency_code,
    'due_on', v_invoice.due_on,
    'document_time_zone', v_invoice.document_time_zone,
    'local_today', v_local_today,
    'payment_status', v_status,
    'overdue', v_invoice.due_on IS NOT NULL AND v_invoice.due_on < v_local_today AND v_outstanding > 0,
    'buyer_display_name', COALESCE(v_customer.display_name, v_invoice.buyer_display_name),
    'buyer_contact_name', COALESCE(v_customer.contact_name, v_invoice.buyer_contact_name),
    'buyer_email', COALESCE(v_customer.email, v_invoice.buyer_email),
    'buyer_phone', COALESCE(v_customer.phone, v_invoice.buyer_phone),
    'seller_display_name', v_invoice.seller_display_name
  );
END
$fn$;

-- 3. Update private claim function
CREATE OR REPLACE FUNCTION private.claim_due_reminder_occurrences(p_batch_size integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_limit integer := CASE WHEN p_batch_size IS NULL OR p_batch_size <= 0 THEN 10 ELSE p_batch_size END;
  v_claimed_ids uuid[];
  v_result jsonb;
BEGIN
  IF v_limit > 100 THEN
    v_limit := 100;
  END IF;

  -- Select and lock candidates with FOR UPDATE SKIP LOCKED
  SELECT pg_catalog.array_agg(o.id) INTO v_claimed_ids
  FROM (
    SELECT occ.id
    FROM public.invoice_reminder_occurrences occ
    JOIN public.invoice_reminder_schedules sch ON sch.id = occ.schedule_id
    WHERE sch.status = 'active'
      AND sch.auto_send_enabled = true
      AND occ.status IN ('pending', 'failed')
      AND (occ.status = 'pending' OR (occ.status = 'failed' AND occ.attempt_count < occ.max_attempts AND (occ.next_retry_at IS NULL OR occ.next_retry_at <= pg_catalog.clock_timestamp())))
      AND occ.scheduled_for <= pg_catalog.clock_timestamp()
    ORDER BY occ.scheduled_for ASC
    LIMIT v_limit
    FOR UPDATE OF occ SKIP LOCKED
  ) o;

  IF v_claimed_ids IS NULL OR pg_catalog.cardinality(v_claimed_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Update claimed rows to processing
  UPDATE public.invoice_reminder_occurrences
  SET status = 'processing',
      processing_started_at = pg_catalog.clock_timestamp(),
      attempt_count = attempt_count + 1,
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = ANY(v_claimed_ids);

  -- Return claimed occurrences with invoice and schedule metadata
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'occurrence_id', occ.id,
        'schedule_id', occ.schedule_id,
        'business_id', occ.business_id,
        'invoice_id', occ.invoice_id,
        'channel', occ.channel,
        'scheduled_for', occ.scheduled_for,
        'scheduled_date', occ.scheduled_date,
        'message_type', occ.message_type,
        'attempt_count', occ.attempt_count,
        'max_attempts', occ.max_attempts,
        'timezone', sch.timezone,
        'auto_send_enabled', sch.auto_send_enabled,
        'template_type', sch.template_type,
        'custom_message', sch.custom_message,
        'custom_email_subject', sch.custom_email_subject,
        'schedule_status', sch.status
      )
    ), '[]'::jsonb
  ) INTO v_result
  FROM public.invoice_reminder_occurrences occ
  JOIN public.invoice_reminder_schedules sch ON sch.id = occ.schedule_id
  WHERE occ.id = ANY(v_claimed_ids);

  RETURN v_result;
END
$fn$;

-- 4. Grants on private functions
GRANT EXECUTE ON FUNCTION private.get_authoritative_payment_status(uuid) TO service_role, webameen_executor, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_due_reminder_occurrences(integer) TO service_role, webameen_executor, authenticated;

-- 5. Public wrappers for PostgREST RPC access
CREATE OR REPLACE FUNCTION public.claim_due_reminder_occurrences(p_batch_size integer)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.claim_due_reminder_occurrences(p_batch_size);
$fn$;

CREATE OR REPLACE FUNCTION public.get_authoritative_payment_status(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.get_authoritative_payment_status(p_invoice_id);
$fn$;

GRANT EXECUTE ON FUNCTION public.claim_due_reminder_occurrences(integer) TO service_role, webameen_executor, authenticated;
GRANT EXECUTE ON FUNCTION public.get_authoritative_payment_status(uuid) TO service_role, webameen_executor, authenticated;

COMMIT;
