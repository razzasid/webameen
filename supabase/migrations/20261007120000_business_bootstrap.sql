BEGIN;

-- Supabase owns auth's schema ACL. The custom executor inherits the built-in
-- authenticated role's auth schema access; it remains NOLOGIN/NOBYPASSRLS and
-- cannot SET ROLE authenticated. Authenticated can never assume executor.
GRANT authenticated TO webameen_executor WITH INHERIT TRUE, SET FALSE;

-- auth.users has provider-managed RLS with no custom-role policy. This narrow
-- read-only helper can inspect only the current JWT subject's verification
-- field. It is private, accepts no user ID and cannot write application data.
CREATE FUNCTION private.verified_caller_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT u.id FROM auth.users AS u
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
$fn$;
REVOKE ALL ON FUNCTION private.verified_caller_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.verified_caller_id() TO webameen_executor;

-- The only owner write exposed in this milestone. The executor remains subject
-- to the existing forced RLS policies and cannot log in or bypass RLS.
CREATE FUNCTION private.bootstrap_business(
  p_display_name text,
  p_contact_email text,
  p_contact_phone text,
  p_postal_address text,
  p_state_code text,
  p_gst_registered boolean,
  p_gstin text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_contact_email text := pg_catalog.btrim(p_contact_email);
  v_contact_phone text := pg_catalog.btrim(p_contact_phone);
  v_postal_address text := pg_catalog.btrim(p_postal_address);
  v_gstin text := pg_catalog.upper(pg_catalog.btrim(p_gstin));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  -- Serializes both repeated submissions and concurrent first submissions.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('webameen/bootstrap/' || v_user_id::text, 0)
  );

  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m WHERE m.user_id = v_user_id;
  IF v_business_id IS NOT NULL THEN
    RETURN v_business_id;
  END IF;

  IF private.verified_caller_id() IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Verified email required';
  END IF;

  IF v_display_name IS NULL OR v_display_name = ''
    OR v_contact_email IS NULL OR v_contact_email = ''
    OR v_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR v_contact_phone IS NULL OR v_contact_phone = ''
    OR v_postal_address IS NULL OR v_postal_address = ''
    OR p_state_code IS NULL OR p_state_code NOT IN (
      '01','02','03','04','05','06','07','08','09','10','11','12',
      '13','14','15','16','17','18','19','20','21','22','23','24',
      '26','27','29','30','31','32','33','34','35','36','37','38'
    )
    OR p_gst_registered IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid business setup input';
  END IF;

  IF v_gstin = '' THEN v_gstin := NULL; END IF;
  IF p_gst_registered AND v_gstin IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'GSTIN required';
  END IF;
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid GSTIN format';
  END IF;

  v_business_id := pg_catalog.gen_random_uuid();
  INSERT INTO public.businesses (
    id, display_name, contact_email, contact_phone, postal_address,
    state_code, gst_registered, gstin, created_by
  ) VALUES (
    v_business_id, v_display_name, v_contact_email, v_contact_phone,
    v_postal_address, p_state_code, p_gst_registered, v_gstin, v_user_id
  );

  INSERT INTO public.business_memberships (business_id, user_id)
  VALUES (v_business_id, v_user_id);

  -- The creator-based FK is deferred. This read uses the normal owner policy.
  SELECT b.id INTO v_business_id FROM public.businesses AS b
  WHERE b.id = v_business_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Business setup denied';
  END IF;
  RETURN v_business_id;
END
$fn$;

-- Keep the transaction command private; PostgREST sees only this fixed wrapper.
CREATE FUNCTION public.bootstrap_business(
  p_display_name text,
  p_contact_email text,
  p_contact_phone text,
  p_postal_address text,
  p_state_code text,
  p_gst_registered boolean,
  p_gstin text
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.bootstrap_business(
    p_display_name, p_contact_email, p_contact_phone, p_postal_address,
    p_state_code, p_gst_registered, p_gstin
  )
$fn$;

REVOKE ALL ON FUNCTION private.bootstrap_business(text,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bootstrap_business(text,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.bootstrap_business(text,text,text,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_business(text,text,text,text,text,boolean,text) TO authenticated;

-- PostgreSQL requires the recipient to have CREATE while transferring
-- function ownership. Revoke it before commit, as in the foundation migration.
GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.bootstrap_business(text,text,text,text,text,boolean,text) OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
