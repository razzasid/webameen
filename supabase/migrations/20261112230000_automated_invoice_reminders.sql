BEGIN;

-- Webameen: Automated Invoice Payment Reminder & Scheduling System
-- Forward-only migration introducing reminder schedules, occurrences, and delivery records.

-- 1. Create tables

CREATE TABLE public.invoice_reminder_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  channels text[] NOT NULL,
  schedule_type text NOT NULL,
  timing_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_date date NOT NULL,
  end_date date,
  template_type text NOT NULL DEFAULT 'upcoming',
  custom_message text,
  custom_email_subject text,
  auto_send_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  stop_reason text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT reminder_schedules_channels_nonempty_ck CHECK (cardinality(channels) > 0),
  CONSTRAINT reminder_schedules_type_ck CHECK (schedule_type IN ('due_date_relative', 'custom_dates', 'recurring', 'hybrid')),
  CONSTRAINT reminder_schedules_template_type_ck CHECK (template_type IN ('upcoming', 'due_today', 'overdue', 'part_paid', 'follow_up', 'custom')),
  CONSTRAINT reminder_schedules_status_ck CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  CONSTRAINT reminder_schedules_dates_ck CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE public.invoice_reminder_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.invoice_reminder_schedules(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  channel text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  scheduled_date date NOT NULL,
  message_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  processing_started_at timestamptz,
  processed_at timestamptz,
  failure_reason text,
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT reminder_occurrences_channel_ck CHECK (channel IN ('whatsapp', 'email', 'sms')),
  CONSTRAINT reminder_occurrences_message_type_ck CHECK (message_type IN ('upcoming', 'due_today', 'overdue', 'part_paid', 'follow_up', 'custom')),
  CONSTRAINT reminder_occurrences_status_ck CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled', 'skipped')),
  CONSTRAINT reminder_occurrences_attempts_ck CHECK (attempt_count >= 0 AND max_attempts >= 1)
);

CREATE TABLE public.invoice_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid REFERENCES public.invoice_reminder_occurrences(id) ON DELETE SET NULL,
  schedule_id uuid NOT NULL REFERENCES public.invoice_reminder_schedules(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  channel text NOT NULL,
  recipient text NOT NULL,
  rendered_subject text,
  rendered_body text NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
  delivery_status text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivered_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT reminder_deliveries_channel_ck CHECK (channel IN ('whatsapp', 'email', 'sms')),
  CONSTRAINT reminder_deliveries_status_ck CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'undelivered'))
);

-- 2. Foreign keys and composite business isolation constraints

ALTER TABLE public.invoice_reminder_schedules
  ADD CONSTRAINT reminder_schedules_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE public.invoice_reminder_schedules
  ADD CONSTRAINT reminder_schedules_invoice_fk FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoices (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE public.invoice_reminder_schedules
  ADD CONSTRAINT reminder_schedules_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE public.invoice_reminder_occurrences
  ADD CONSTRAINT reminder_occurrences_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE public.invoice_reminder_occurrences
  ADD CONSTRAINT reminder_occurrences_invoice_fk FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoices (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE public.invoice_reminder_deliveries
  ADD CONSTRAINT reminder_deliveries_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE public.invoice_reminder_deliveries
  ADD CONSTRAINT reminder_deliveries_invoice_fk FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoices (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;

-- 3. Indexes & Unique constraints

-- Only one active or paused schedule per invoice at any time
CREATE UNIQUE INDEX u_reminder_schedule_active_or_paused
  ON public.invoice_reminder_schedules (business_id, invoice_id)
  WHERE status IN ('active', 'paused');

CREATE INDEX x_reminder_schedule_lookup
  ON public.invoice_reminder_schedules (business_id, invoice_id, status);

-- Prevent duplicate occurrences for the same schedule, date, channel, and message type
CREATE UNIQUE INDEX u_reminder_occurrence_unique_event
  ON public.invoice_reminder_occurrences (schedule_id, channel, scheduled_date, message_type);

-- Fast lookup for background worker claiming due occurrences
CREATE INDEX x_reminder_occurrence_claiming
  ON public.invoice_reminder_occurrences (status, scheduled_for)
  WHERE status IN ('pending', 'failed');

CREATE INDEX x_reminder_occurrence_invoice
  ON public.invoice_reminder_occurrences (business_id, invoice_id, scheduled_for DESC);

CREATE INDEX x_reminder_delivery_invoice
  ON public.invoice_reminder_deliveries (business_id, invoice_id, sent_at DESC);

CREATE INDEX x_reminder_delivery_schedule
  ON public.invoice_reminder_deliveries (schedule_id, sent_at DESC);

-- 4. Enable RLS and define policies

ALTER TABLE public.invoice_reminder_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_schedules FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_reminder_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_occurrences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_deliveries FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invoice_reminder_schedules FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON TABLE public.invoice_reminder_occurrences FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
REVOKE ALL ON TABLE public.invoice_reminder_deliveries FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;

-- Grants for authenticated users (scoped by RLS to active owners)
GRANT SELECT ON public.invoice_reminder_schedules TO authenticated, webameen_executor, service_role;
GRANT SELECT ON public.invoice_reminder_occurrences TO authenticated, webameen_executor, service_role;
GRANT SELECT ON public.invoice_reminder_deliveries TO authenticated, webameen_executor, service_role;

GRANT INSERT, UPDATE ON public.invoice_reminder_schedules TO authenticated, webameen_executor, service_role;
GRANT INSERT, UPDATE, DELETE ON public.invoice_reminder_occurrences TO authenticated, webameen_executor, service_role;
GRANT INSERT, UPDATE ON public.invoice_reminder_deliveries TO webameen_executor, service_role;

-- RLS policies: owner access only
CREATE POLICY reminder_schedules_read ON public.invoice_reminder_schedules
  FOR SELECT TO authenticated, webameen_executor
  USING (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_schedules.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_schedules_service_all ON public.invoice_reminder_schedules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY reminder_schedules_owner_insert ON public.invoice_reminder_schedules
  FOR INSERT TO authenticated, webameen_executor
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_schedules.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_schedules_owner_update ON public.invoice_reminder_schedules
  FOR UPDATE TO authenticated, webameen_executor
  USING (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_schedules.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_schedules.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_occurrences_read ON public.invoice_reminder_occurrences
  FOR SELECT TO authenticated, webameen_executor
  USING (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_occurrences.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_occurrences_service_all ON public.invoice_reminder_occurrences
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY reminder_occurrences_owner_insert ON public.invoice_reminder_occurrences
  FOR INSERT TO authenticated, webameen_executor
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_occurrences.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_occurrences_owner_update ON public.invoice_reminder_occurrences
  FOR UPDATE TO authenticated, webameen_executor
  USING (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_occurrences.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_occurrences.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_occurrences_owner_delete ON public.invoice_reminder_occurrences
  FOR DELETE TO authenticated, webameen_executor
  USING (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_occurrences.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_deliveries_read ON public.invoice_reminder_deliveries
  FOR SELECT TO authenticated, webameen_executor
  USING (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_deliveries.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

CREATE POLICY reminder_deliveries_service_all ON public.invoice_reminder_deliveries
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY reminder_deliveries_executor_insert ON public.invoice_reminder_deliveries
  FOR INSERT TO webameen_executor
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.business_id = invoice_reminder_deliveries.business_id
      AND m.role = 'owner'
      AND m.disabled_at IS NULL
  ));

-- 5. Stored procedures for authoritative calculations & atomic background claims

-- Calculate authoritative payment status without requiring auth.uid() (for trusted workers/triggers)
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

-- Atomic claim of due occurrences: prevents duplicate processing across workers/cron runs
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

-- Automatic payment sync trigger on payments / payment_reversals:
-- If invoice is fully paid, stop reminder schedule and cancel pending occurrences!
CREATE OR REPLACE FUNCTION private.sync_reminder_schedule_on_payment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_invoice_id uuid;
  v_business_id uuid;
  v_status jsonb;
  v_outstanding numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
    v_business_id := OLD.business_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
    v_business_id := NEW.business_id;
  END IF;

  v_status := private.get_authoritative_payment_status(v_invoice_id);
  IF v_status IS NOT NULL THEN
    v_outstanding := (v_status->>'outstanding_minor')::numeric;
    IF v_outstanding <= 0 THEN
      -- Mark active or paused schedules as completed
      UPDATE public.invoice_reminder_schedules
      SET status = 'completed',
          stop_reason = 'fully_paid',
          updated_at = pg_catalog.clock_timestamp()
      WHERE business_id = v_business_id
        AND invoice_id = v_invoice_id
        AND status IN ('active', 'paused');

      -- Skip all pending occurrences
      UPDATE public.invoice_reminder_occurrences
      SET status = 'skipped',
          skip_reason = 'fully_paid',
          updated_at = pg_catalog.clock_timestamp()
      WHERE business_id = v_business_id
        AND invoice_id = v_invoice_id
        AND status IN ('pending', 'processing');
    END IF;
  END IF;

  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER sync_reminders_after_payment
  AFTER INSERT OR UPDATE ON public.payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.sync_reminder_schedule_on_payment();

CREATE CONSTRAINT TRIGGER sync_reminders_after_payment_reversal
  AFTER INSERT OR UPDATE ON public.payment_reversals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.sync_reminder_schedule_on_payment();

-- Grants on functions
REVOKE ALL ON FUNCTION private.get_authoritative_payment_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.claim_due_reminder_occurrences(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.get_authoritative_payment_status(uuid) TO service_role, webameen_executor, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_due_reminder_occurrences(integer) TO service_role, webameen_executor, authenticated;

-- Public wrappers for PostgREST RPC access
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
