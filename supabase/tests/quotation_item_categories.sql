-- Local Supabase only; every fixture is rolled back.
BEGIN;
CREATE FUNCTION pg_temp.assert_ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $t$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END $t$;

INSERT INTO public.gst_rate_options(rate,selectable) VALUES (0,true)
ON CONFLICT(rate) DO UPDATE SET selectable=true;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  ('e7200000-0000-4000-8000-000000000001','categories@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claims','{"sub":"e7200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Category Seller','seller@example.invalid','9999','Seller address','29',false,NULL);
SELECT public.create_customer('Category Buyer',NULL,'buyer@example.invalid',NULL,'Buyer address','29',false,NULL);
RESET ROLE;

CREATE TEMP TABLE category_fixture(quote_id uuid,customer_id uuid);
INSERT INTO category_fixture
SELECT 'e7211111-1111-4111-8111-111111111111',id
FROM public.customers WHERE display_name='Category Buyer';
GRANT SELECT ON category_fixture TO authenticated;
SET LOCAL ROLE authenticated;
SELECT item_categories FROM public.quotation_versions LIMIT 0;
SELECT public.create_quotation_draft(quote_id,customer_id) FROM category_fixture;

CREATE TEMP TABLE category_input(snapshot jsonb,categories jsonb,lines jsonb);
GRANT SELECT ON category_input TO authenticated;
INSERT INTO category_input VALUES (
  '{"seller_display_name":"Category Seller","seller_postal_address":"Seller address","seller_state_code":"29","seller_gst_registered":false,"buyer_display_name":"Category Buyer","buyer_billing_address":"Buyer address","buyer_state_code":"29","buyer_gstin_applicable":false,"document_time_zone":"Asia/Kolkata","place_of_supply_applicable":false,"reverse_charge_applies":false}'::jsonb,
  '[{"id":"e7222222-2222-4222-8222-222222222221","name":"Furniture"},{"id":"e7222222-2222-4222-8222-222222222222","name":"Materials"}]'::jsonb,
  '[{"category_id":"e7222222-2222-4222-8222-222222222221","description":"Table","unit_label":"each","quantity":"1","unit_price_minor":"10000","gst_category":"no_gst"},{"category_id":"e7222222-2222-4222-8222-222222222221","description":"Chair","unit_label":"each","quantity":"1","unit_price_minor":"5000","gst_category":"no_gst"},{"category_id":"e7222222-2222-4222-8222-222222222222","description":"Timber","unit_label":"piece","quantity":"2","unit_price_minor":"3000","gst_category":"no_gst"},{"category_id":"e7222222-2222-4222-8222-222222222222","description":"Nails","unit_label":"box","quantity":"1","unit_price_minor":"1000","gst_category":"no_gst"}]'::jsonb
);

SELECT public.save_quotation_draft(f.quote_id,0,
  i.snapshot || jsonb_build_object('item_categories',i.categories),i.lines)
FROM category_fixture f CROSS JOIN category_input i;

CREATE TEMP TABLE category_saved AS
SELECT public.get_quotation_draft(quote_id) AS document FROM category_fixture;
SELECT pg_temp.assert_ok(
  (SELECT document->'item_categories' = i.categories FROM category_saved CROSS JOIN category_input i),
  'Both main categories remain saved in their original order');
SELECT pg_temp.assert_ok(
  (SELECT count(*)=4 FROM category_saved,
    LATERAL jsonb_array_elements(document->'lines') AS line(value)),
  'All four subcategory items remain in the quotation');
SELECT pg_temp.assert_ok(
  (SELECT bool_and(
      (line.value->>'category_id') = CASE WHEN line.ordinality <= 2
        THEN 'e7222222-2222-4222-8222-222222222221'
        ELSE 'e7222222-2222-4222-8222-222222222222' END
    )
   FROM category_saved,
     LATERAL jsonb_array_elements(document->'lines') WITH ORDINALITY AS line(value,ordinality)),
  'Each saved item stays under the category selected in the editor');
SELECT pg_temp.assert_ok(
  (SELECT edit_sequence=1 FROM public.quotation_versions WHERE quotation_id=(SELECT quote_id FROM category_fixture)),
  'Saving the category structure completes as one normal draft edit');

RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
