BEGIN;

-- One narrow owner command. Existing business RLS, fixed-column guards and
-- asset key/hash checks remain in force; this command cannot edit assets.
CREATE FUNCTION private.update_business_settings(
  p_display_name text, p_contact_email text, p_contact_phone text,
  p_postal_address text, p_state_code text, p_gst_registered boolean,
  p_gstin text, p_default_terms text, p_time_zone text,
  p_bank_name text, p_bank_account_name text, p_bank_account_number text,
  p_bank_ifsc text, p_upi_id text, p_payment_instructions text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_contact_email text := NULLIF(pg_catalog.btrim(p_contact_email), '');
  v_state_code text := NULLIF(pg_catalog.btrim(p_state_code), '');
  v_gstin text := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_gstin)), '');
  v_time_zone text := pg_catalog.btrim(p_time_zone);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  -- Find the tenant from identity, never from a caller-supplied business ID.
  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m WHERE m.user_id = v_user_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  -- Membership disabling takes the exclusive form of this lock. Recheck after
  -- acquiring it so an in-flight disable cannot race this update.
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS m
    WHERE m.user_id = v_user_id AND m.business_id = v_business_id
      AND m.role = 'owner' AND m.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;

  IF v_display_name IS NULL OR v_display_name = ''
    OR (v_contact_email IS NOT NULL AND v_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    OR (v_state_code IS NOT NULL AND v_state_code NOT IN (
      '01','02','03','04','05','06','07','08','09','10','11','12',
      '13','14','15','16','17','18','19','20','21','22','23','24',
      '26','27','29','30','31','32','33','34','35','36','37','38'
    ))
    OR (p_gst_registered IS TRUE AND v_gstin IS NULL)
    OR (v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$')
    OR v_time_zone IS NULL OR v_time_zone = ''
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_time_zone)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid business settings';
  END IF;

  UPDATE public.businesses AS b SET
    display_name = v_display_name,
    contact_email = v_contact_email,
    contact_phone = NULLIF(pg_catalog.btrim(p_contact_phone), ''),
    postal_address = NULLIF(pg_catalog.btrim(p_postal_address), ''),
    state_code = v_state_code,
    gst_registered = p_gst_registered,
    gstin = v_gstin,
    default_terms = NULLIF(pg_catalog.btrim(p_default_terms), ''),
    time_zone = v_time_zone,
    bank_name = NULLIF(pg_catalog.btrim(p_bank_name), ''),
    bank_account_name = NULLIF(pg_catalog.btrim(p_bank_account_name), ''),
    bank_account_number = NULLIF(pg_catalog.btrim(p_bank_account_number), ''),
    bank_ifsc = NULLIF(pg_catalog.btrim(p_bank_ifsc), ''),
    upi_id = NULLIF(pg_catalog.btrim(p_upi_id), ''),
    payment_instructions = NULLIF(pg_catalog.btrim(p_payment_instructions), ''),
    updated_at = pg_catalog.clock_timestamp()
  WHERE b.id = v_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  RETURN v_business_id;
END
$fn$;

CREATE FUNCTION public.update_business_settings(
  p_display_name text, p_contact_email text, p_contact_phone text,
  p_postal_address text, p_state_code text, p_gst_registered boolean,
  p_gstin text, p_default_terms text, p_time_zone text,
  p_bank_name text, p_bank_account_name text, p_bank_account_number text,
  p_bank_ifsc text, p_upi_id text, p_payment_instructions text
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.update_business_settings(
    p_display_name, p_contact_email, p_contact_phone, p_postal_address,
    p_state_code, p_gst_registered, p_gstin, p_default_terms, p_time_zone,
    p_bank_name, p_bank_account_name, p_bank_account_number, p_bank_ifsc,
    p_upi_id, p_payment_instructions
  )
$fn$;

REVOKE ALL ON FUNCTION private.update_business_settings(text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_business_settings(text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.update_business_settings(text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_settings(text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text)
  TO authenticated;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.update_business_settings(text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text)
  OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;

