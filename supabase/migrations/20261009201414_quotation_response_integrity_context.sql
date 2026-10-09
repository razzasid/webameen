BEGIN;

-- Deferred constraint triggers otherwise run after the security-definer RPC
-- returns, when the outer service_role again has no table access. Flush only
-- the existing quotation integrity triggers while the scoped broker is active.
GRANT webameen_quote_broker TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA private TO webameen_quote_broker;
SET LOCAL ROLE webameen_quote_broker;

CREATE OR REPLACE FUNCTION private.respond_to_public_quotation(
  p_token_hash_hex text,p_kind text,p_customer_note text,p_respondent_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_hash bytea; v_business_id uuid; v_quote_id uuid; v_version_id uuid;
  v_link record; v_quote record; v_version record; v_existing record;
  v_now timestamptz; v_note text:=NULLIF(pg_catalog.btrim(p_customer_note),'');
  v_name text:=NULLIF(pg_catalog.btrim(p_respondent_name),'');
BEGIN
  IF p_token_hash_hex IS NULL OR p_token_hash_hex !~ '^[0-9a-fA-F]{64}$'
    OR p_kind IS NULL OR p_kind NOT IN ('approved','change_requested')
    OR pg_catalog.length(COALESCE(v_note,''))>2000
    OR pg_catalog.length(COALESCE(v_name,''))>200 THEN
    RETURN pg_catalog.jsonb_build_object('status','invalid');
  END IF;
  v_hash:=pg_catalog.decode(p_token_hash_hex,'hex');
  SELECT l.business_id,l.quotation_id,l.version_id
    INTO v_business_id,v_quote_id,v_version_id
    FROM public.quotation_public_links AS l WHERE l.token_hash=v_hash;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','unavailable'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/'||v_business_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.business_memberships AS m
    WHERE m.business_id=v_business_id AND m.disabled_at IS NULL) THEN
    RETURN pg_catalog.jsonb_build_object('status','unavailable');
  END IF;
  SELECT q.id,q.business_id,q.reference,q.current_version_id INTO v_quote FROM public.quotations AS q
    WHERE q.business_id=v_business_id AND q.id=v_quote_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','unavailable'); END IF;
  SELECT l.id,l.business_id,l.quotation_id,l.version_id,l.token_hash,
      l.access_expires_at,l.created_at,l.revoked_at INTO v_link
    FROM public.quotation_public_links AS l
    WHERE l.business_id=v_business_id AND l.quotation_id=v_quote_id
      AND l.version_id=v_version_id AND l.token_hash=v_hash;
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('status','unavailable');
  END IF;
  v_now:=pg_catalog.clock_timestamp();
  IF v_link.access_expires_at IS NOT NULL AND v_now>=v_link.access_expires_at THEN
    RETURN pg_catalog.jsonb_build_object('status','unavailable');
  END IF;
  IF v_quote.current_version_id<>v_version_id THEN
    RETURN pg_catalog.jsonb_build_object('status','unavailable');
  END IF;
  SELECT v.id,v.business_id,v.quotation_id,v.state,v.shared_at,v.response_deadline_at
    INTO v_version FROM public.quotation_versions AS v
    WHERE v.business_id=v_business_id AND v.quotation_id=v_quote_id
      AND v.id=v_version_id AND v.shared_at IS NOT NULL;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','unavailable'); END IF;
  SELECT r.id,r.business_id,r.quotation_id,r.version_id,r.public_link_id,r.kind,
      r.customer_note,r.respondent_name,r.responded_at INTO v_existing
    FROM public.quotation_responses AS r
    WHERE r.business_id=v_business_id AND r.version_id=v_version_id;
  IF FOUND THEN
    IF v_existing.public_link_id=v_link.id AND v_existing.kind=p_kind
      AND v_existing.customer_note IS NOT DISTINCT FROM v_note
      AND v_existing.respondent_name IS NOT DISTINCT FROM v_name THEN
      RETURN pg_catalog.jsonb_build_object('status','recorded','kind',v_existing.kind,
        'responded_at',v_existing.responded_at);
    END IF;
    RETURN pg_catalog.jsonb_build_object('status','already_responded',
      'kind',v_existing.kind,'responded_at',v_existing.responded_at);
  END IF;
  IF v_version.state<>'shared' THEN
    RETURN pg_catalog.jsonb_build_object('status','already_responded');
  END IF;
  IF v_version.response_deadline_at IS NOT NULL AND v_now>=v_version.response_deadline_at THEN
    RETURN pg_catalog.jsonb_build_object('status','expired');
  END IF;
  INSERT INTO public.quotation_responses(
    business_id,quotation_id,version_id,public_link_id,kind,
    customer_note,respondent_name,responded_at)
  VALUES(v_business_id,v_quote_id,v_version_id,v_link.id,p_kind,v_note,v_name,v_now);
  UPDATE public.quotation_versions SET state=p_kind
    WHERE business_id=v_business_id AND id=v_version_id;
  UPDATE public.quotations SET updated_at=v_now
    WHERE business_id=v_business_id AND id=v_quote_id;
  SET CONSTRAINTS public.quotation_integrity IMMEDIATE;
  SET CONSTRAINTS public.quotation_integrity DEFERRED;
  RETURN pg_catalog.jsonb_build_object('status','recorded','kind',p_kind,'responded_at',v_now);
END
$fn$;

RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM webameen_quote_broker;
REVOKE webameen_quote_broker FROM CURRENT_USER;

COMMIT;
