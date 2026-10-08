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
 ('e2000000-0000-0000-0000-000000000001','catalog-a@example.invalid',clock_timestamp()),
 ('e2000000-0000-0000-0000-000000000002','catalog-b@example.invalid',clock_timestamp());
CREATE TEMP TABLE catalog_test_rate(value numeric);
DO $configured_rate$
DECLARE candidate numeric := 0;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (SELECT FROM public.gst_rate_options WHERE rate=candidate);
    candidate := candidate + 0.125;
  END LOOP;
  INSERT INTO catalog_test_rate VALUES (candidate);
END
$configured_rate$;
INSERT INTO public.gst_rate_options(rate,selectable)
SELECT value,true FROM catalog_test_rate;
CREATE TEMP TABLE catalog_unconfigured_rate(value numeric);
DO $unconfigured_rate$
DECLARE candidate numeric := 0;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (SELECT FROM public.gst_rate_options WHERE rate=candidate);
    candidate := candidate + 0.125;
  END LOOP;
  INSERT INTO catalog_unconfigured_rate VALUES (candidate);
END
$unconfigured_rate$;
GRANT SELECT ON catalog_test_rate, catalog_unconfigured_rate TO authenticated;

SELECT set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Catalog A','a@example.invalid','1234567890','A address','29',false,NULL);
SELECT pg_temp.assert_ok(
  to_regprocedure('public.create_catalog_item(text,text,text,text,bigint,text,numeric,text)') IS NOT NULL,
  'Create command is explicit and has no client business_id parameter');
SELECT pg_temp.expect_error(
  format('SELECT public.create_catalog_item(''product'',''Unconfigured taxable'',NULL,NULL,100,''taxable'',%s,NULL)',
    (SELECT value FROM catalog_unconfigured_rate)),
  '22023','Taxable rate must be configured');
SELECT pg_temp.expect_error(
  'INSERT INTO public.catalog_items(business_id,kind,name,default_gst_category,created_by) SELECT business_id,''product'',''Raw write'',''no_gst'',user_id FROM public.business_memberships WHERE user_id=auth.uid()',
  '42501','Authenticated raw catalog insert remains denied');
SELECT pg_temp.expect_error(
  'UPDATE public.catalog_items SET name=''Raw edit''',
  '42501','Authenticated raw catalog update remains denied');
SELECT pg_temp.assert_ok(
  (SELECT public.create_catalog_item('service','Monthly support','Monthly package','custom month',125009,'taxable',(SELECT value FROM catalog_test_rate),'0101') IS NOT NULL),
  'Configured taxable service is created with a custom unit, paise price and HSN/SAC');
SELECT pg_temp.assert_ok(
  EXISTS (SELECT FROM public.list_catalog_gst_rates() AS rates WHERE rates.rate=(SELECT value::text FROM catalog_test_rate)),
  'Configured selectable GST rates are returned as exact decimal text');
SELECT pg_temp.assert_ok(
  (SELECT public.create_catalog_item('product','Exempt sample',NULL,'piece',NULL,'exempt',NULL,NULL) IS NOT NULL),
  'Exempt item requires no GST rate or default price');
SELECT pg_temp.assert_ok(
  (SELECT public.create_catalog_item('product','No GST sample',NULL,NULL,NULL,'no_gst',NULL,NULL) IS NOT NULL),
  'No-GST item requires no GST rate');
CREATE TEMP TABLE catalog_fixture(id uuid);
INSERT INTO catalog_fixture SELECT id FROM public.catalog_items WHERE name='Monthly support';
SELECT pg_temp.assert_ok((SELECT count(*)=3 FROM public.catalog_items),'Owner sees only own catalog entries');
SELECT pg_temp.assert_ok(
  (SELECT default_unit_price_minor='125009' AND default_gst_rate=(SELECT value::text FROM catalog_test_rate)
   FROM public.get_catalog_item((SELECT id FROM catalog_fixture))),
  'Item detail read returns exact paise and NUMERIC text');
SELECT pg_temp.assert_ok(
  (SELECT count(*)=1 AND min(default_unit_price_minor)='125009' AND min(default_gst_rate)=(SELECT value::text FROM catalog_test_rate)
   FROM public.list_catalog_items('Monthly support',0,12)),
  'Search read returns exact paise and NUMERIC text');
RESET ROLE;
UPDATE public.gst_rate_options SET selectable=false WHERE rate=(SELECT value FROM catalog_test_rate);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  NOT EXISTS (SELECT FROM public.list_catalog_gst_rates() AS rates WHERE rates.rate=(SELECT value::text FROM catalog_test_rate)),
  'Retired GST rates are omitted from new selections');
SELECT public.update_catalog_item(
  (SELECT id FROM catalog_fixture),'service','Monthly support revised','Updated description',
  'custom month',200001,'taxable',(SELECT value FROM catalog_test_rate),'0102'
);
SELECT pg_temp.assert_ok(
  (SELECT name='Monthly support revised' AND description='Updated description'
      AND unit_label='custom month' AND default_unit_price_minor=200001 AND hsn_sac='0102'
   FROM public.catalog_items WHERE id=(SELECT id FROM catalog_fixture)),
  'Catalog item edits preserve integer-paise values and HSN/SAC after rate retirement');

RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Catalog B','b@example.invalid','1234567890','B address','27',false,NULL);
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.catalog_items),'Business B cannot read Business A catalog entries');
SELECT pg_temp.expect_error(
  'SELECT public.update_catalog_item((SELECT id FROM catalog_fixture),''product'',''Foreign edit'',NULL,NULL,NULL,''no_gst'',NULL,NULL)',
  'P0002','Business B cannot edit Business A catalog item by ID');
SELECT pg_temp.assert_ok(
  (SELECT public.create_catalog_item('product','Business B item',NULL,NULL,NULL,'no_gst',NULL,NULL) IS NOT NULL),
  'Business B creation derives its own business from the authenticated session');
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.catalog_items),'Business B sees only its own new catalog entry');

ROLLBACK;
