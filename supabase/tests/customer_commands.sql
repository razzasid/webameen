-- Execute against disposable local Supabase only. All fixtures roll back.
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

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('e1000000-0000-0000-0000-000000000001','customer-a@example.invalid',clock_timestamp()),
 ('e1000000-0000-0000-0000-000000000002','customer-b@example.invalid',clock_timestamp());

SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Customer A','a@example.invalid','1234567890','A address','29',false,NULL);
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.customers),'New business customer list starts empty');
SELECT pg_temp.expect_error(
  'SELECT public.create_customer(''Invalid state'',NULL,NULL,NULL,NULL,NULL,false,NULL)',
  '22023','Customer state is required by command validation');
SELECT pg_temp.expect_error(
  'SELECT public.create_customer(''Missing GSTIN'',NULL,NULL,NULL,NULL,''29'',true,NULL)',
  '22023','Applicable GSTIN is required');
SELECT pg_temp.expect_error(
  'INSERT INTO public.customers(business_id,display_name,state_code,created_by) SELECT business_id,''Raw write'',''29'',user_id FROM public.business_memberships WHERE user_id=auth.uid()',
  '42501','Authenticated raw customer insert remains denied');
SELECT pg_temp.expect_error(
  'UPDATE public.customers SET display_name=''Raw edit''',
  '42501','Authenticated raw customer update remains denied');
SELECT pg_temp.assert_ok(
  (SELECT public.create_customer('Northwind',NULL,'northwind@example.invalid','9876543210','Address','29',true,'27ABCDE1234F1Z5') IS NOT NULL),
  'Customer is created with session-derived business and prefix mismatch allowed');
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.customers),'Owner can read own customer');
CREATE TEMP TABLE customer_fixture(id uuid);
INSERT INTO customer_fixture SELECT id FROM public.customers;

RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Customer B','b@example.invalid','1234567890','B address','27',false,NULL);
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.customers),'Business B cannot read Business A customer');
SELECT pg_temp.expect_error(
  'SELECT public.update_customer((SELECT id FROM customer_fixture),''Foreign edit'',NULL,NULL,NULL,NULL,''27'',false,NULL)',
  'P0002','Business B cannot edit Business A customer by ID');
SELECT pg_temp.assert_ok(
  (SELECT public.create_customer('Business B Customer',NULL,NULL,NULL,NULL,'27',false,NULL) IS NOT NULL),
  'Customer creation takes no client business ID');
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.customers),'Business B sees only its own customer');

ROLLBACK;
