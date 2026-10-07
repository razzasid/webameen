BEGIN;

-- These fixed owner commands derive the business from auth.uid(). Callers can
-- never choose a tenant, and all table access remains subject to forced RLS.
CREATE FUNCTION private.create_customer(
  p_display_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_billing_address text,
  p_state_code text,
  p_gstin_applicable boolean,
  p_gstin text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_customer_id uuid;
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_contact_name text := NULLIF(pg_catalog.btrim(p_contact_name), '');
  v_email text := NULLIF(pg_catalog.btrim(p_email), '');
  v_phone text := NULLIF(pg_catalog.btrim(p_phone), '');
  v_address text := NULLIF(pg_catalog.btrim(p_billing_address), '');
  v_gstin text := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_gstin)), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active business owner required';
  END IF;
  IF v_display_name IS NULL OR v_display_name = ''
    OR p_state_code IS NULL OR p_state_code NOT IN (
      '01','02','03','04','05','06','07','08','09','10','11','12',
      '13','14','15','16','17','18','19','20','21','22','23','24',
      '26','27','29','30','31','32','33','34','35','36','37','38'
    ) OR p_gstin_applicable IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid customer input';
  END IF;
  IF p_gstin_applicable AND v_gstin IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'GSTIN required';
  END IF;
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid GSTIN format';
  END IF;
  INSERT INTO public.customers (
    business_id, display_name, contact_name, email, phone, billing_address,
    state_code, gstin_applicable, gstin, created_by
  ) VALUES (
    v_business_id, v_display_name, v_contact_name, v_email, v_phone, v_address,
    p_state_code, p_gstin_applicable, CASE WHEN p_gstin_applicable THEN v_gstin ELSE NULL END,
    v_user_id
  ) RETURNING id INTO v_customer_id;
  RETURN v_customer_id;
END
$fn$;

CREATE FUNCTION private.update_customer(
  p_customer_id uuid,
  p_display_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_billing_address text,
  p_state_code text,
  p_gstin_applicable boolean,
  p_gstin text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_customer_id uuid;
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_contact_name text := NULLIF(pg_catalog.btrim(p_contact_name), '');
  v_email text := NULLIF(pg_catalog.btrim(p_email), '');
  v_phone text := NULLIF(pg_catalog.btrim(p_phone), '');
  v_address text := NULLIF(pg_catalog.btrim(p_billing_address), '');
  v_gstin text := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_gstin)), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active business owner required';
  END IF;
  IF p_customer_id IS NULL OR v_display_name IS NULL OR v_display_name = ''
    OR p_state_code IS NULL OR p_state_code NOT IN (
      '01','02','03','04','05','06','07','08','09','10','11','12',
      '13','14','15','16','17','18','19','20','21','22','23','24',
      '26','27','29','30','31','32','33','34','35','36','37','38'
    ) OR p_gstin_applicable IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid customer input';
  END IF;
  IF p_gstin_applicable AND v_gstin IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'GSTIN required';
  END IF;
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid GSTIN format';
  END IF;
  UPDATE public.customers AS c SET
    display_name = v_display_name, contact_name = v_contact_name,
    email = v_email, phone = v_phone, billing_address = v_address,
    state_code = p_state_code, gstin_applicable = p_gstin_applicable,
    gstin = CASE WHEN p_gstin_applicable THEN v_gstin ELSE NULL END,
    updated_at = pg_catalog.clock_timestamp()
  WHERE c.id = p_customer_id AND c.business_id = v_business_id
  RETURNING c.id INTO v_customer_id;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Customer not found';
  END IF;
  RETURN v_customer_id;
END
$fn$;

CREATE FUNCTION public.create_customer(
  p_display_name text, p_contact_name text, p_email text, p_phone text,
  p_billing_address text, p_state_code text, p_gstin_applicable boolean, p_gstin text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.create_customer($1,$2,$3,$4,$5,$6,$7,$8) $fn$;

CREATE FUNCTION public.update_customer(
  p_customer_id uuid, p_display_name text, p_contact_name text, p_email text,
  p_phone text, p_billing_address text, p_state_code text,
  p_gstin_applicable boolean, p_gstin text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.update_customer($1,$2,$3,$4,$5,$6,$7,$8,$9) $fn$;

REVOKE ALL ON FUNCTION private.create_customer(text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_customer(uuid,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_customer(text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_customer(uuid,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_customer(text,text,text,text,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_customer(uuid,text,text,text,text,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer(text,text,text,text,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer(uuid,text,text,text,text,text,text,boolean,text) TO authenticated;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.create_customer(text,text,text,text,text,text,boolean,text) OWNER TO webameen_executor;
ALTER FUNCTION private.update_customer(uuid,text,text,text,text,text,text,boolean,text) OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
