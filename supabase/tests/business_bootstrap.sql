-- Execute against disposable local Supabase only. Every fixture rolls back.
BEGIN;
CREATE FUNCTION pg_temp.assert_ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END
$test$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
  END;
  PERFORM pg_temp.assert_ok(actual = expected, label);
END
$test$;

INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
 ('e0000000-0000-0000-0000-000000000001', 'bootstrap-a@example.invalid', clock_timestamp()),
 ('e0000000-0000-0000-0000-000000000002', 'bootstrap-b@example.invalid', clock_timestamp()),
 ('e0000000-0000-0000-0000-000000000003', 'bootstrap-c@example.invalid', NULL);

SELECT set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Alpha Shop','alpha@example.com','1234567890','Alpha address','29',false,NULL);
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=1, 'First owner sees exactly one business');
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.business_memberships)=1, 'First owner has exactly one membership');
SELECT public.bootstrap_business('Different retry','other@example.com','1234567890','Other address','27',true,'27ABCDE1234F1Z5');
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=1, 'Retry does not create or overwrite a business');
SELECT pg_temp.assert_ok((SELECT display_name FROM public.businesses)='Alpha Shop', 'Retry preserves original profile');
SELECT pg_temp.expect_error(
  'INSERT INTO public.businesses(display_name,created_by) VALUES (''Forbidden'',''e0000000-0000-0000-0000-000000000001'')',
  '42501', 'Authenticated caller has no raw business INSERT');

RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=0, 'Second owner cannot read first business');
SELECT public.bootstrap_business('Beta Shop','beta@example.com','1234567890','Beta address','29',true,'27abcde1234f1z5');
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=1, 'Second owner sees only its business');
SELECT pg_temp.assert_ok((SELECT gstin FROM public.businesses)='27ABCDE1234F1Z5', 'GSTIN normalized; prefix mismatch is non-blocking');
SELECT pg_temp.assert_ok((SELECT role FROM public.business_memberships)='owner', 'Creator receives owner membership');

RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses WHERE created_by IN ('e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002'))=2, 'Exactly two businesses committed in transaction');
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.business_memberships WHERE user_id IN ('e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002'))=2, 'One membership per owner');

SELECT set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.bootstrap_business(''Unverified'',''u@example.com'',''123'',''Address'',''29'',false,NULL)',
  '42501', 'Unverified email cannot bootstrap');
SELECT pg_temp.expect_error(
  'SELECT public.bootstrap_business(''Invalid'',''i@example.com'',''123'',''Address'',''29'',true,NULL)',
  '42501', 'Verification is checked before input');

RESET ROLE;
UPDATE public.business_memberships SET disabled_at = clock_timestamp() WHERE user_id='e0000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Attempt','a@example.com','123','Address','29',false,NULL);
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=0, 'Disabled owner cannot read business or create a second');

ROLLBACK;
