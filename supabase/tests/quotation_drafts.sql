-- Local Supabase only; every fixture is rolled back.
BEGIN;
CREATE FUNCTION pg_temp.assert_ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $t$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $t$;
CREATE FUNCTION pg_temp.expect_error(statement text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $t$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  PERFORM pg_temp.assert_ok(actual=expected,label);
END $t$;

INSERT INTO public.gst_rate_options(rate,selectable) VALUES (0,true),(5,true),(18,true)
ON CONFLICT(rate) DO UPDATE SET selectable=true;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('e7000000-0000-0000-0000-000000000001','draft-a@example.invalid',clock_timestamp()),
('e7000000-0000-0000-0000-000000000002','draft-b@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claims','{"sub":"e7000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Seller A','seller@example.invalid','9999','Seller address','29',true,'29ABCDE1234F1Z5');
SELECT public.create_customer('Buyer A',NULL,'buyer@example.invalid',NULL,'Buyer address','29',false,NULL);
RESET ROLE;
CREATE TEMP TABLE draft_fixture(quote_id uuid,customer_id uuid);
INSERT INTO draft_fixture SELECT 'e7111111-1111-4111-8111-111111111111',id FROM public.customers WHERE display_name='Buyer A';
GRANT SELECT ON draft_fixture TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  public.create_quotation_draft((SELECT quote_id FROM draft_fixture),(SELECT customer_id FROM draft_fixture))=(SELECT quote_id FROM draft_fixture),
  'Atomic draft creation returns stable ID');
SELECT pg_temp.assert_ok(
  public.create_quotation_draft((SELECT quote_id FROM draft_fixture),(SELECT customer_id FROM draft_fixture))=(SELECT quote_id FROM draft_fixture),
  'Identical creation retry returns original draft');
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.quotations),'One quotation after retry');
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.quotation_versions),'One initial version after retry');
SELECT pg_temp.assert_ok(
  (SELECT v.seller_display_name=b.display_name
    AND v.seller_contact_email IS NOT DISTINCT FROM b.contact_email
    AND v.seller_contact_phone IS NOT DISTINCT FROM b.contact_phone
    AND v.seller_postal_address IS NOT DISTINCT FROM b.postal_address
    AND v.seller_state_code IS NOT DISTINCT FROM b.state_code
    AND v.seller_gst_registered IS NOT DISTINCT FROM b.gst_registered
    AND v.seller_gstin IS NOT DISTINCT FROM b.gstin
    AND v.seller_logo_asset_key IS NOT DISTINCT FROM b.logo_asset_key
    AND v.seller_logo_sha256 IS NOT DISTINCT FROM b.logo_sha256
    AND v.seller_signature_asset_key IS NOT DISTINCT FROM b.signature_asset_key
    AND v.seller_signature_sha256 IS NOT DISTINCT FROM b.signature_sha256
    AND v.buyer_display_name=c.display_name
    AND v.buyer_contact_name IS NOT DISTINCT FROM c.contact_name
    AND v.buyer_email IS NOT DISTINCT FROM c.email
    AND v.buyer_phone IS NOT DISTINCT FROM c.phone
    AND v.buyer_billing_address IS NOT DISTINCT FROM c.billing_address
    AND v.buyer_state_code IS NOT DISTINCT FROM c.state_code
    AND v.buyer_gstin_applicable IS NOT DISTINCT FROM c.gstin_applicable
    AND v.buyer_gstin IS NOT DISTINCT FROM c.gstin
    AND v.currency_code='INR' AND v.currency_exponent=2 AND v.quantity_scale=3
    AND v.price_tax_mode='exclusive'
    AND v.calculation_rule_code='in-gst-exclusive-line-paise-half-up-v1'
    AND v.document_time_zone=b.time_zone
    AND v.seller_bank_name IS NULL AND v.terms IS NULL
   FROM public.quotation_versions v JOIN public.businesses b ON b.id=v.business_id
   JOIN public.quotations q ON q.id=v.quotation_id
   JOIN public.customers c ON c.id=q.customer_id),
  'Creation copies all current seller/buyer identities, fixed document rules and assets; optional defaults stay opt-in');

CREATE TEMP TABLE draft_input(snapshot jsonb,lines jsonb);
GRANT SELECT ON draft_input TO authenticated;
INSERT INTO draft_input VALUES (
  jsonb_build_object('seller_display_name','Seller A','seller_postal_address','Seller address',
    'seller_state_code','29','seller_gst_registered',true,'seller_gstin','29ABCDE1234F1Z5',
    'buyer_display_name','Buyer A','buyer_billing_address','Buyer address',
    'buyer_state_code','29','buyer_gstin_applicable',false,'document_time_zone','Asia/Kolkata',
    'place_of_supply_applicable',false,'reverse_charge_applies',false),
  jsonb_build_array(jsonb_build_object('description','Service','unit_label','each','quantity','1',
    'unit_price_minor','1000000','gst_category','taxable','gst_rate','18'))
);
SELECT pg_temp.assert_ok(
  (SELECT public.preview_quotation_draft(f.quote_id,0,i.snapshot,i.lines)->>'total_minor'='1180000'
   FROM draft_fixture f CROSS JOIN draft_input i),
  'Preview uses exact 18 percent calculation');
SELECT pg_temp.assert_ok(
  (SELECT public.save_quotation_draft(f.quote_id,0,i.snapshot,i.lines)->>'total_minor'='1180000'
   FROM draft_fixture f CROSS JOIN draft_input i),
  'Saved same-state total is 11800 rupees');
SELECT pg_temp.assert_ok((SELECT total_minor=1180000 AND cgst_total_minor=90000 AND sgst_total_minor=90000 AND igst_total_minor=0 AND edit_sequence=1 FROM public.quotation_versions),'Stored components and sequence agree');
SELECT pg_temp.assert_ok((SELECT count(*)=1 AND min(line_total_minor)=1180000 FROM public.quotation_items),'Line persisted atomically');
SELECT pg_temp.assert_ok(
  (SELECT result->>'total_minor'='1180000'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,
     i.snapshot || '{"total_minor":"0"}'::jsonb,
     jsonb_set(i.lines,'{0,line_total_minor}','"0"'::jsonb)) result),
  'Caller-forged totals are ignored by the authoritative calculation');
SELECT pg_temp.assert_ok(
  (SELECT result->>'auto_treatment'='igst' AND result->>'treatment'='igst'
    AND result->>'igst_total_minor'='180000' AND result->>'cgst_total_minor'='0'
    AND result->>'total_minor'='1180000'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,
     jsonb_set(i.snapshot,'{buyer_state_code}','"27"'::jsonb),i.lines) result),
  'Different-state 18 percent uses IGST with the same total');
SELECT pg_temp.assert_ok(
  (SELECT result->>'auto_treatment'='igst' AND result->>'treatment'='cgst_sgst'
    AND result->>'cgst_total_minor'='90000' AND result->>'sgst_total_minor'='90000'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,
     jsonb_set(jsonb_set(i.snapshot,'{buyer_state_code}','"27"'::jsonb),'{gst_treatment_override}','"cgst_sgst"'::jsonb),i.lines) result),
  'Manual override retains automatic suggestion and exact components');
SELECT pg_temp.assert_ok(
  (SELECT result->>'total_minor'='22' AND result->>'cgst_total_minor'='1' AND result->>'sgst_total_minor'='1'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,i.snapshot,
     '[{"description":"Tiny","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"taxable","gst_rate":"5"}]'::jsonb) result),
  'Twenty paise at 5 percent rounds each same-state component to one paise');
SELECT pg_temp.assert_ok(
  (SELECT result->>'total_minor'='21' AND result->>'igst_total_minor'='1'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,
     jsonb_set(i.snapshot,'{buyer_state_code}','"27"'::jsonb),
     '[{"description":"Tiny","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"taxable","gst_rate":"5"}]'::jsonb) result),
  'Twenty paise at 5 percent uses one paise IGST');
SELECT pg_temp.assert_ok(
  (SELECT result->>'total_minor'='2' AND result->'lines'->0->>'line_subtotal_minor'='2'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,i.snapshot,
     '[{"description":"Small","unit_label":"each","quantity":"1.5","unit_price_minor":"1","gst_category":"no_gst"}]'::jsonb) result),
  'One-and-a-half units at one paise rounds base to two paise');
SELECT pg_temp.assert_ok(
  (SELECT result->>'taxable_subtotal_minor'='20' AND result->>'gst_total_minor'='0'
    AND result->'lines'->0->>'gst_category'='taxable'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,i.snapshot,
     '[{"description":"Zero taxable","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"taxable","gst_rate":"0"}]'::jsonb) result),
  'Taxable zero percent stays taxable, distinct from exempt');
SELECT pg_temp.assert_ok(
  (SELECT result->>'taxable_subtotal_minor'='0' AND result->>'total_minor'='40'
    AND result->'lines'->0->>'gst_category'='exempt' AND result->'lines'->1->>'gst_category'='no_gst'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,i.snapshot,
     '[{"description":"Exempt","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"exempt"},{"description":"No GST","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"no_gst"}]'::jsonb) result),
  'Exempt and no-GST remain separate classifications in mixed sums');
SELECT pg_temp.assert_ok(
  (SELECT result->>'subtotal_minor'='10040' AND result->>'taxable_subtotal_minor'='10000'
    AND result->>'cgst_total_minor'='900' AND result->>'sgst_total_minor'='900'
    AND result->>'total_minor'='11840'
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,i.snapshot,
     '[{"description":"Taxable","unit_label":"each","quantity":"1","unit_price_minor":"10000","gst_category":"taxable","gst_rate":"18"},{"description":"Exempt","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"exempt"},{"description":"No GST","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"no_gst"}]'::jsonb) result),
  'Mixed category totals sum rounded line amounts');
RESET ROLE;
INSERT INTO public.gst_rate_options(rate,selectable) VALUES(12.345,true)
ON CONFLICT(rate) DO UPDATE SET selectable=true;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT result->>'total_minor'='11234' AND (result->'lines'->0->>'cgst_rate')::numeric=6.1725
   FROM draft_fixture f CROSS JOIN draft_input i
   CROSS JOIN LATERAL public.preview_quotation_draft(f.quote_id,1,i.snapshot,
     '[{"description":"Decimal rate","unit_label":"each","quantity":"1","unit_price_minor":"10000","gst_category":"taxable","gst_rate":"12.345"}]'::jsonb) result),
  'Decimal total rate retains exact half-component precision');
SELECT pg_temp.expect_error(
  'SELECT public.preview_quotation_draft(f.quote_id,1,i.snapshot,''[{"description":"Invalid","unit_label":"each","quantity":"1.2345","unit_price_minor":"20","gst_category":"no_gst"}]''::jsonb) FROM draft_fixture f CROSS JOIN draft_input i',
  '22023','Fourth decimal quantity rejected before storage');
SELECT pg_temp.expect_error(
  'SELECT public.save_quotation_draft(f.quote_id,1,i.snapshot,''[{"description":"Overflow","unit_label":"each","quantity":"2","unit_price_minor":"9223372036854775807","gst_category":"no_gst"}]''::jsonb) FROM draft_fixture f CROSS JOIN draft_input i',
  '22023','Overflow rejects the complete save');
SELECT pg_temp.assert_ok((SELECT edit_sequence=1 FROM public.quotation_versions),'Failed save leaves sequence unchanged');
SELECT pg_temp.assert_ok((SELECT count(*)=1 AND min(line_total_minor)=1180000 FROM public.quotation_items),'Failed save leaves previous line unchanged');
SELECT pg_temp.assert_ok(
  (SELECT pg_catalog.jsonb_typeof(detail->'totals'->'total_minor')='string'
    AND detail->'totals'->>'total_minor'='1180000'
    AND pg_catalog.jsonb_typeof(detail->'lines'->0->'unit_price_minor')='string'
    AND detail->'snapshot'->>'seller_display_name'='Seller A'
   FROM draft_fixture f CROSS JOIN LATERAL public.get_quotation_draft(f.quote_id) detail),
  'Owner read retains exact money strings and snapshot values');
SELECT public.create_customer('Another Buyer',NULL,NULL,NULL,'Other address','27',false,NULL);
SELECT pg_temp.expect_error(
  'SELECT public.create_quotation_draft(f.quote_id,c.id) FROM draft_fixture f CROSS JOIN public.customers c WHERE c.display_name=''Another Buyer''',
  '23514','Reused creation key with different customer conflicts');
SELECT pg_temp.expect_error(
  'SELECT public.preview_quotation_draft(f.quote_id,1,i.snapshot,''[{"source_catalog_item_id":"00000000-0000-0000-0000-000000000999","description":"Foreign","unit_label":"each","quantity":"1","unit_price_minor":"20","gst_category":"no_gst"}]''::jsonb) FROM draft_fixture f CROSS JOIN draft_input i',
  '42501','Unknown or foreign catalog source denied');
SELECT pg_temp.expect_error(
  'SELECT public.save_quotation_draft(f.quote_id,0,i.snapshot,i.lines) FROM draft_fixture f CROSS JOIN draft_input i',
  '40001','Stale sequence rejected');
SELECT pg_temp.expect_error(
  'INSERT INTO public.quotation_items(business_id,version_id,position,description,unit_label,quantity,unit_price_minor,line_subtotal_minor,gst_category,gst_treatment,taxable_amount_minor,cgst_amount_minor,sgst_amount_minor,igst_amount_minor,line_total_minor) VALUES (gen_random_uuid(),gen_random_uuid(),1,''raw'',''each'',1,0,0,''no_gst'',''none'',0,0,0,0,0)',
  '42501','Authenticated raw line write denied');
RESET ROLE;

-- A second owner may neither attach another business's customer nor read/edit its draft.
SELECT set_config('request.jwt.claims','{"sub":"e7000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Seller B','b@example.invalid','9999','B address','27',false,NULL);
SELECT public.create_customer('Buyer B',NULL,NULL,NULL,'B buyer address','27',false,NULL);
RESET ROLE;
CREATE TEMP TABLE foreign_fixture(customer_id uuid);
INSERT INTO foreign_fixture SELECT id FROM public.customers WHERE display_name='Buyer B';
GRANT SELECT ON foreign_fixture TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e7000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.create_quotation_draft(gen_random_uuid(),customer_id) FROM foreign_fixture',
  '22023','Foreign customer cannot be attached to a quotation');
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.list_quotation_drafts()),'Owner A lists only its quotation');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e7000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok((SELECT public.get_quotation_draft(quote_id) IS NULL FROM draft_fixture),'Foreign owner cannot read quotation detail');
SELECT pg_temp.assert_ok(
  (SELECT count(*)=0 FROM public.quotation_versions v JOIN draft_fixture f ON v.quotation_id=f.quote_id),
  'Foreign owner cannot read a version ID under RLS');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.list_quotation_drafts()),'Foreign owner cannot list private quotations');
SELECT pg_temp.expect_error(
  'SELECT public.save_quotation_draft(f.quote_id,1,i.snapshot,i.lines) FROM draft_fixture f CROSS JOIN draft_input i',
  'P0002','Foreign owner cannot save draft');
RESET ROLE;

-- Live master changes must not alter the copied seller and buyer identities.
UPDATE public.businesses SET display_name='Seller A changed' WHERE display_name='Seller A';
UPDATE public.customers SET display_name='Buyer A changed' WHERE display_name='Buyer A';
SELECT set_config('request.jwt.claims','{"sub":"e7000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT detail->'snapshot'->>'seller_display_name'='Seller A'
    AND detail->'snapshot'->>'buyer_display_name'='Buyer A'
   FROM draft_fixture f CROSS JOIN LATERAL public.get_quotation_draft(f.quote_id) detail),
  'Master record edits do not refresh the draft snapshot');
RESET ROLE;

-- Retired selectable rates block a new calculation, but never erase saved values.
UPDATE public.gst_rate_options SET selectable=false WHERE rate=18;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.preview_quotation_draft(f.quote_id,1,i.snapshot,i.lines) FROM draft_fixture f CROSS JOIN draft_input i',
  '22023','Retired copied taxable rate requires replacement');
SELECT pg_temp.assert_ok((SELECT total_minor=1180000 FROM public.quotation_versions),'Retired rate does not change saved amounts');
RESET ROLE;
UPDATE public.gst_rate_options SET selectable=true WHERE rate=18;

-- A disabled membership cannot call definer commands even with an old JWT.
UPDATE public.business_memberships SET disabled_at=clock_timestamp()
WHERE user_id='e7000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.save_quotation_draft(f.quote_id,1,i.snapshot,i.lines) FROM draft_fixture f CROSS JOIN draft_input i',
  '42501','Disabled owner cannot save');
SELECT pg_temp.assert_ok((SELECT public.get_quotation_draft(quote_id) IS NULL FROM draft_fixture),'Disabled owner cannot read under RLS');
RESET ROLE;
UPDATE public.business_memberships SET disabled_at=NULL
WHERE user_id='e7000000-0000-0000-0000-000000000001';
UPDATE public.quotation_versions SET state='shared',shared_by='e7000000-0000-0000-0000-000000000001',shared_at=clock_timestamp()
WHERE quotation_id=(SELECT quote_id FROM draft_fixture);
INSERT INTO public.quotation_public_links(business_id,quotation_id,version_id,token_hash,creation_request_key,created_by)
SELECT q.business_id,q.id,v.id,decode(repeat('ab',32),'hex'),gen_random_uuid(),q.created_by
FROM public.quotations q JOIN public.quotation_versions v ON v.business_id=q.business_id AND v.id=q.current_version_id
WHERE q.id=(SELECT quote_id FROM draft_fixture);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.save_quotation_draft(f.quote_id,1,i.snapshot,i.lines) FROM draft_fixture f CROSS JOIN draft_input i',
  '23514','Frozen shared version rejects draft edits');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error(
  'SELECT public.get_quotation_draft(quote_id) FROM draft_fixture',
  '42501','Guest cannot execute private quotation read');
SELECT pg_temp.expect_error(
  'SELECT public.create_quotation_draft(gen_random_uuid(),customer_id) FROM draft_fixture',
  '42501','Guest cannot create a quotation');
RESET ROLE;

SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
