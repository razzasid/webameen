-- Execute against disposable local Supabase. All fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $test$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
  END;
  PERFORM pg_temp.assert_ok(actual = expected, label);
END $test$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('e6000000-0000-0000-0000-000000000001','settings-a@example.invalid',clock_timestamp()),
 ('e6000000-0000-0000-0000-000000000002','settings-b@example.invalid',clock_timestamp()),
 ('e6000000-0000-0000-0000-000000000003','settings-guest@example.invalid',clock_timestamp());
SELECT pg_temp.assert_ok(
  (SELECT pg_get_userbyid(proowner)='webameen_executor'
   FROM pg_proc WHERE oid='private.update_business_settings(text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text)'::regprocedure),
  'Private command uses the restricted executor');
SELECT pg_temp.assert_ok(
  NOT has_function_privilege('anon','public.update_business_settings(text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text)','EXECUTE'),
  'Guest role has no command grant');
SELECT set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Original Shop','original@example.invalid','12345','Old address','29',false,NULL);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Other Shop','other@example.invalid','54321','Other address','27',false,NULL);
RESET ROLE;

-- One existing draft snapshot proves settings changes never rewrite document data.
INSERT INTO public.customers(business_id,display_name,created_by)
SELECT business_id,'Snapshot Buyer',user_id FROM public.business_memberships
WHERE user_id='e6000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE settings_quote_ids(quotation_id uuid, version_id uuid);
INSERT INTO settings_quote_ids VALUES (gen_random_uuid(),gen_random_uuid());
GRANT SELECT ON settings_quote_ids TO authenticated;
INSERT INTO public.quotations(id,business_id,customer_id,reference,current_version_id,created_by)
SELECT ids.quotation_id,m.business_id,c.id,'settings-test',ids.version_id,m.user_id
FROM settings_quote_ids ids CROSS JOIN public.business_memberships m
JOIN public.customers c ON c.business_id=m.business_id
WHERE m.user_id='e6000000-0000-0000-0000-000000000001';
INSERT INTO public.quotation_versions(id,business_id,quotation_id,version_number,created_by,seller_display_name,seller_bank_name,terms)
SELECT ids.version_id,m.business_id,ids.quotation_id,1,m.user_id,'Frozen Seller','Frozen Bank','Frozen terms'
FROM settings_quote_ids ids CROSS JOIN public.business_memberships m
WHERE m.user_id='e6000000-0000-0000-0000-000000000001';

SELECT set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  public.update_business_settings('  Updated Shop  ','  new@example.invalid  ','  9999  ','  New address  ','29',true,' 27abcde1234f1z5 ',
    '  New terms  ','Asia/Kolkata','  New Bank  ','  Holder  ','  123456  ','  ABCD0000000  ','  user@upi  ','  Transfer manually  ') IS NOT NULL,
  'Owner can update settings with fixed command');
SELECT pg_temp.assert_ok(
  (SELECT display_name='Updated Shop' AND contact_email='new@example.invalid'
     AND gstin='27ABCDE1234F1Z5' AND bank_name='New Bank' AND default_terms='New terms'
     AND country_code='IN' AND currency_code='INR' AND time_zone='Asia/Kolkata'
   FROM public.businesses WHERE created_by=auth.uid()),
  'Text and GSTIN normalized; fixed region remains');
SELECT pg_temp.assert_ok(
  (SELECT seller_display_name='Frozen Seller' AND seller_bank_name='Frozen Bank' AND terms='Frozen terms'
   FROM public.quotation_versions WHERE id=(SELECT version_id FROM settings_quote_ids)),
  'Existing document snapshot unchanged');
SELECT pg_temp.expect_error(
  'UPDATE public.businesses SET display_name=''Raw edit'' WHERE created_by=auth.uid()',
  '42501','Raw business writes remain denied');
SELECT pg_temp.expect_error(
  'SELECT public.update_business_settings(''Shop'',NULL,NULL,NULL,''99'',false,NULL,NULL,''Asia/Kolkata'',NULL,NULL,NULL,NULL,NULL,NULL)',
  '22023','Unknown state rejected');
SELECT pg_temp.expect_error(
  'SELECT public.update_business_settings(''Shop'',NULL,NULL,NULL,''29'',true,NULL,NULL,''Asia/Kolkata'',NULL,NULL,NULL,NULL,NULL,NULL)',
  '22023','Registered seller requires GSTIN');
SELECT pg_temp.expect_error(
  'SELECT public.update_business_settings(''Shop'',NULL,NULL,NULL,''29'',false,NULL,NULL,''Not/A_Zone'',NULL,NULL,NULL,NULL,NULL,NULL)',
  '22023','Invalid IANA zone rejected');
SELECT pg_temp.assert_ok(
  (SELECT country_code='IN' AND currency_code='INR' AND public_catalog_slug IS NOT NULL
   FROM public.businesses WHERE created_by=auth.uid()),
  'Command cannot change country, currency or catalog slug');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=1, 'Foreign owner sees only own business');
SELECT public.update_business_settings('Other Updated',NULL,NULL,NULL,'27',false,NULL,NULL,'UTC',NULL,NULL,NULL,NULL,NULL,NULL);
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses WHERE display_name='Updated Shop')=0, 'Foreign owner cannot edit first business');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.update_business_settings(''Guest'',NULL,NULL,NULL,NULL,NULL,NULL,NULL,''UTC'',NULL,NULL,NULL,NULL,NULL,NULL)',
  '42501','Authenticated user without business denied');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error(
  'SELECT public.update_business_settings(''Guest'',NULL,NULL,NULL,NULL,NULL,NULL,NULL,''UTC'',NULL,NULL,NULL,NULL,NULL,NULL)',
  '42501','Unauthenticated role denied command');
RESET ROLE;

UPDATE public.business_memberships SET disabled_at=clock_timestamp()
WHERE user_id='e6000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.update_business_settings(''Disabled'',NULL,NULL,NULL,NULL,NULL,NULL,NULL,''UTC'',NULL,NULL,NULL,NULL,NULL,NULL)',
  '42501','Disabled owner denied command');
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
