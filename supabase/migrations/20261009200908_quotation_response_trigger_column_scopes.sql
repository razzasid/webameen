BEGIN;

-- Public quotation responses run through the isolated broker role, which has
-- column-level reads only. Keep the original integrity checks while projecting
-- exactly the columns those checks consume.
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA private TO webameen_executor;
SET LOCAL ROLE webameen_executor;

CREATE OR REPLACE FUNCTION private.check_quotation_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE b uuid; q uuid; quote record; v record;
        line_count bigint; totals record; response_kind text;
BEGIN
  IF TG_TABLE_NAME = 'quotations' THEN
    IF TG_OP = 'DELETE' THEN b := OLD.business_id; q := OLD.id; ELSE b := NEW.business_id; q := NEW.id; END IF;
  ELSIF TG_TABLE_NAME = 'quotation_items' THEN
    IF TG_OP = 'DELETE' THEN b := OLD.business_id;
      SELECT quotation_id INTO q FROM public.quotation_versions WHERE business_id=b AND id=OLD.version_id;
    ELSE b := NEW.business_id;
      SELECT quotation_id INTO q FROM public.quotation_versions WHERE business_id=b AND id=NEW.version_id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN b := OLD.business_id; q := OLD.quotation_id;
    ELSE b := NEW.business_id; q := NEW.quotation_id; END IF;
  END IF;
  SELECT current_version_id INTO quote FROM public.quotations WHERE business_id=b AND id=q;
  IF NOT FOUND THEN RETURN NULL; END IF; -- Permitted complete initial-draft purge.
  SELECT id, version_number, state INTO v FROM public.quotation_versions
  WHERE business_id=b AND quotation_id=q ORDER BY version_number DESC LIMIT 1;
  IF NOT FOUND OR quote.current_version_id <> v.id OR v.state='superseded' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Current quotation version must be the last nonsuperseded version';
  END IF;
  FOR v IN SELECT id, state, shared_at, seller_state_code, buyer_state_code,
      gst_auto_treatment, gst_treatment_override, gst_treatment,
      subtotal_minor, taxable_subtotal_minor, cgst_total_minor, sgst_total_minor,
      igst_total_minor, gst_total_minor, total_minor
    FROM public.quotation_versions WHERE business_id=b AND quotation_id=q LOOP
    IF v.id <> quote.current_version_id AND v.state <> 'superseded' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Every preceding version must be superseded';
    END IF;
    SELECT kind INTO response_kind FROM public.quotation_responses WHERE business_id=b AND version_id=v.id;
    IF (v.state IN ('draft','shared') AND response_kind IS NOT NULL)
       OR (v.state IN ('approved','change_requested') AND response_kind IS DISTINCT FROM v.state) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Version state does not match retained response';
    END IF;
    SELECT count(*), sum(line_subtotal_minor) base, sum(taxable_amount_minor) taxable,
      sum(cgst_amount_minor) cgst, sum(sgst_amount_minor) sgst, sum(igst_amount_minor) igst,
      sum(line_total_minor) total
    INTO totals FROM public.quotation_items WHERE business_id=b AND version_id=v.id;
    line_count := totals.count;
    IF v.shared_at IS NOT NULL AND line_count=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='A frozen quotation requires at least one line';
    END IF;
    IF line_count>0 AND (
      ROW(v.subtotal_minor::numeric,v.taxable_subtotal_minor::numeric,v.cgst_total_minor::numeric,v.sgst_total_minor::numeric,v.igst_total_minor::numeric,v.gst_total_minor::numeric,v.total_minor::numeric)
      IS DISTINCT FROM ROW(totals.base,totals.taxable,totals.cgst,totals.sgst,totals.igst,totals.cgst+totals.sgst+totals.igst,totals.total)
      OR v.gst_auto_treatment IS DISTINCT FROM CASE WHEN v.seller_state_code=v.buyer_state_code THEN 'cgst_sgst' ELSE 'igst' END
      OR v.gst_treatment IS DISTINCT FROM coalesce(v.gst_treatment_override,v.gst_auto_treatment)
      OR EXISTS (SELECT FROM public.quotation_items WHERE business_id=b AND version_id=v.id AND gst_category='taxable' AND gst_treatment<>v.gst_treatment)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Quotation inputs, line routes or totals disagree';
    END IF;
    IF line_count=0 AND (
      coalesce(v.subtotal_minor,0)<>0 OR coalesce(v.taxable_subtotal_minor,0)<>0
      OR coalesce(v.cgst_total_minor,0)<>0 OR coalesce(v.sgst_total_minor,0)<>0
      OR coalesce(v.igst_total_minor,0)<>0 OR coalesce(v.gst_total_minor,0)<>0 OR coalesce(v.total_minor,0)<>0
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='An empty draft cannot have nonzero totals';
    END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION private.guard_response() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v record; link record;
BEGIN
  SELECT state, shared_at, response_deadline_at INTO v
    FROM public.quotation_versions WHERE business_id=NEW.business_id AND id=NEW.version_id;
  SELECT id, revoked_at, access_expires_at, created_at INTO link
    FROM public.quotation_public_links WHERE business_id=NEW.business_id AND id=NEW.public_link_id;
  IF v.state IS DISTINCT FROM 'shared' OR link.id IS NULL OR link.revoked_at IS NOT NULL
     OR (link.access_expires_at IS NOT NULL AND pg_catalog.clock_timestamp() >= link.access_expires_at)
     OR (v.response_deadline_at IS NOT NULL AND pg_catalog.clock_timestamp() >= v.response_deadline_at)
     OR NEW.responded_at < v.shared_at
     OR NEW.responded_at < link.created_at
     OR NOT EXISTS (SELECT FROM public.quotations WHERE business_id=NEW.business_id AND id=NEW.quotation_id AND current_version_id=NEW.version_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Response requires an accessible current shared quotation before its deadline';
  END IF;
  RETURN NEW;
END
$fn$;

RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
