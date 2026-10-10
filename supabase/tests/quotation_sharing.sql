-- Local Supabase only; all fixtures and workflow changes are rolled back.
-- Response coverage exercises the broker with its approved column-level grants.
BEGIN;
CREATE FUNCTION pg_temp.assert_ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $t$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $t$;
CREATE FUNCTION pg_temp.expect_error(statement text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $t$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  PERFORM pg_temp.assert_ok(actual=expected,label);
END $t$;

INSERT INTO public.gst_rate_options(rate,selectable) VALUES (18,true)
ON CONFLICT(rate) DO UPDATE SET selectable=true;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('e8000000-0000-0000-0000-000000000001','share-owner@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claims','{"sub":"e8000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
CREATE TEMP TABLE share_fixture(business_id uuid,customer_id uuid,quotation_id uuid,version_id uuid,revision_id uuid);
GRANT SELECT,INSERT,UPDATE ON share_fixture TO authenticated;
SET LOCAL ROLE authenticated;
INSERT INTO share_fixture(business_id)
  SELECT public.bootstrap_business('Seller','seller@example.invalid','9999999999','Seller street','29',false,NULL);
UPDATE share_fixture SET customer_id=public.create_customer('Buyer',NULL,'buyer@example.invalid',NULL,'Buyer street','29',false,NULL);
UPDATE share_fixture SET quotation_id=public.create_quotation_draft('e8111111-1111-4111-8111-111111111111',customer_id);
UPDATE share_fixture SET version_id=(SELECT current_version_id FROM public.quotations WHERE id=quotation_id);
CREATE TEMP TABLE share_input(snapshot jsonb,lines jsonb);
GRANT SELECT,INSERT ON share_input TO authenticated;
INSERT INTO share_input VALUES (
  '{"seller_display_name":"Seller","seller_postal_address":"Seller street","seller_state_code":"29","seller_gst_registered":false,"buyer_display_name":"Buyer","buyer_billing_address":"Buyer street","buyer_state_code":"29","buyer_gstin_applicable":false,"document_time_zone":"Asia/Kolkata","place_of_supply_applicable":false,"reverse_charge_applies":false}'::jsonb,
  '[{"description":"Service","unit_label":"hour","quantity":"2","unit_price_minor":"10000","gst_category":"taxable","gst_rate":"18"}]'::jsonb
);
SELECT pg_temp.assert_ok(
  (SELECT (public.save_quotation_draft(f.quotation_id,0,i.snapshot,i.lines)->>'total_minor')='23600'
   FROM share_fixture f CROSS JOIN share_input i),
  'Owner saves a complete quotation draft before sharing');
SELECT pg_temp.assert_ok(
  (SELECT (public.share_quotation_draft(f.quotation_id,f.version_id,
      'e8222222-2222-4222-8222-222222222222',repeat('a',64),NULL)->>'created')::boolean
   FROM share_fixture f),
  'Share atomically freezes current draft and creates one bearer link');
RESET ROLE;

SELECT pg_temp.assert_ok(
  has_function_privilege('anon','public.read_public_quotation(text)','EXECUTE')=false
  AND has_function_privilege('authenticated','public.read_public_quotation(text)','EXECUTE')=false
  AND has_function_privilege('service_role','public.read_public_quotation(text)','EXECUTE'),
  'Only isolated service role can call the public quotation wrapper');
SELECT pg_temp.assert_ok(
  (SELECT rolcanlogin=false AND rolbypassrls=false FROM pg_roles WHERE rolname='webameen_quote_broker'),
  'Quote broker cannot log in or bypass RLS');
SELECT pg_temp.assert_ok(
  NOT has_table_privilege('webameen_quote_broker','public.customers','SELECT')
  AND NOT has_table_privilege('webameen_quote_broker','public.invoices','SELECT')
  AND NOT has_table_privilege('webameen_quote_broker','public.payments','SELECT'),
  'Quote broker cannot read unrelated customer, invoice or payment tables');
SELECT pg_temp.assert_ok(
  NOT has_table_privilege('webameen_quote_broker','public.quotation_versions','SELECT')
  AND has_column_privilege('webameen_quote_broker','public.quotation_versions','state','SELECT')
  AND NOT has_column_privilege('webameen_quote_broker','public.quotation_versions','created_by','SELECT'),
  'Quotation response trigger reads do not broaden broker column grants');
SELECT pg_temp.assert_ok(
  EXISTS (SELECT FROM pg_proc WHERE oid='private.guard_response()'::regprocedure
    AND NOT prosecdef AND proowner='webameen_executor'::regrole)
  AND EXISTS (SELECT FROM pg_proc WHERE oid='private.check_quotation_integrity()'::regprocedure
    AND NOT prosecdef AND proowner='webameen_executor'::regrole)
  AND EXISTS (SELECT FROM pg_proc WHERE oid='private.respond_to_public_quotation(text,text,text,text)'::regprocedure
    AND prosecdef AND proowner='webameen_quote_broker'::regrole),
  'Response triggers and isolated broker RPC retain their original execution roles');

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(
  (SELECT data->>'reference' IS NOT NULL AND data->>'state'='shared'
    AND data->>'revision_in_preparation'='false'
    AND data->'lines'->0->>'description'='Service'
    AND NOT data::text LIKE '%token_hash%'
    AND NOT data::text LIKE '%private_note%'
    AND NOT data::text LIKE '%source_catalog_item_id%'
   FROM public.read_public_quotation(repeat('a',64)) AS data),
  'Public token returns only the frozen allow-listed quotation projection');
SELECT pg_temp.assert_ok(public.read_public_quotation(repeat('b',64)) IS NULL,
  'Unknown token reveals no quotation');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e8000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT (public.rotate_quotation_link(f.quotation_id,f.version_id,
      'e8333333-3333-4333-8333-333333333333',repeat('c',64),NULL)->>'created')::boolean
   FROM share_fixture f),
  'Link rotation creates a replacement without changing the frozen version');
SELECT pg_temp.assert_ok(
  (SELECT public.create_quotation_revision(quotation_id,version_id) IS NOT NULL FROM share_fixture),
  'Approved quotation revision is created');
UPDATE share_fixture SET revision_id=(SELECT current_version_id FROM public.quotations WHERE id=quotation_id);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(public.read_public_quotation(repeat('a',64)) IS NULL,
  'Rotation revokes the old token');
SELECT pg_temp.assert_ok(
  (SELECT data->>'revision_in_preparation'='true' AND data->>'state'='superseded'
    FROM public.read_public_quotation(repeat('c',64)) AS data),
  'Earlier frozen version remains read-only while its revision is a draft');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e8000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT (public.share_quotation_draft(quotation_id,revision_id,
      'e8444444-4444-4444-8444-444444444444',repeat('d',64),NULL)->>'created')::boolean
   FROM share_fixture),
  'Sharing the revision freezes the new version and revokes older links');
SELECT pg_temp.assert_ok(
  (SELECT public.share_quotation_draft(quotation_id,revision_id,
      'e8444444-4444-4444-8444-444444444444',repeat('e',64),NULL)->>'created'='false'
   FROM share_fixture),
  'Same share key retry returns prior link status without exposing another secret');
SELECT pg_temp.assert_ok(
  (SELECT count(*)=1 FROM public.quotation_items WHERE version_id=(SELECT revision_id FROM share_fixture)),
  'Revision copies its frozen quotation line unchanged');
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(public.read_public_quotation(repeat('c',64)) IS NULL,
  'Superseded link is unavailable after the revision is shared');
SELECT pg_temp.assert_ok(
  (SELECT data->>'state'='shared' AND data->>'version_number'='2'
    FROM public.read_public_quotation(repeat('d',64)) AS data),
  'New link reads only the newly shared version');

RESET ROLE;

SELECT pg_temp.assert_ok(
  (public.respond_to_public_quotation(repeat('d',64),'approved',repeat('x',2001),NULL)->>'status')='invalid',
  'Public response rejects notes beyond the server-side limit');

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT (public.rotate_quotation_link(quotation_id,revision_id,
      'e8555555-5555-4555-8555-555555555555',repeat('f',64),
      clock_timestamp()+interval '3 seconds')->>'created')::boolean
   FROM share_fixture),
  'A time-limited replacement link can be issued');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(public.read_public_quotation(repeat('f',64)) IS NOT NULL,
  'Time-limited link works before its access cutoff');
SELECT pg_sleep(3.1);
SELECT pg_temp.assert_ok(public.read_public_quotation(repeat('f',64)) IS NULL,
  'Time-limited link cannot read the quotation after its cutoff');
SELECT pg_temp.assert_ok(
  (public.respond_to_public_quotation(repeat('f',64),'approved',NULL,NULL)->>'status')='unavailable',
  'Time-limited link cannot submit a response after its cutoff');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT (public.rotate_quotation_link(quotation_id,revision_id,
      'e8666666-6666-4666-8666-666666666666',repeat('9',64),NULL)->>'created')::boolean
   FROM share_fixture),
  'A new active link can replace an expired link');
RESET ROLE;

UPDATE public.business_memberships
SET disabled_at=clock_timestamp()
WHERE business_id=(SELECT business_id FROM share_fixture);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(public.read_public_quotation(repeat('9',64)) IS NULL,
  'Disabled business member cannot read its public quotation');
SELECT pg_temp.assert_ok(
  (public.respond_to_public_quotation(repeat('9',64),'approved',NULL,NULL)->>'status')='unavailable',
  'Disabled business member cannot submit a quotation response');
RESET ROLE;
UPDATE public.business_memberships
SET disabled_at=NULL
WHERE business_id=(SELECT business_id FROM share_fixture);

GRANT webameen_quote_broker TO postgres WITH SET TRUE;
SET LOCAL ROLE webameen_quote_broker;
SELECT pg_temp.expect_error(
  format($sql$
    INSERT INTO public.quotation_responses(
      business_id,quotation_id,version_id,public_link_id,kind,responded_at)
    SELECT l.business_id,l.quotation_id,l.version_id,l.id,'approved',l.created_at-interval '1 second'
    FROM public.quotation_public_links AS l WHERE l.token_hash=decode(%L,'hex')
  $sql$,repeat('9',64)),
  '23514','Response trigger still rejects a pre-link timestamp under the narrow broker grants');
RESET ROLE;
REVOKE webameen_quote_broker FROM postgres;

CREATE TEMP TABLE response_result(first_response jsonb,retry_response jsonb);
GRANT SELECT,INSERT ON response_result TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO response_result
SELECT public.respond_to_public_quotation(repeat('9',64),'approved','Approved as quoted','Buyer'),
       public.respond_to_public_quotation(repeat('9',64),'approved','Approved as quoted','Buyer');
SELECT pg_temp.assert_ok(
  (SELECT first_response->>'status'='recorded'
      AND retry_response->>'status'='recorded'
      AND first_response->>'kind'='approved'
      AND first_response->>'responded_at'=retry_response->>'responded_at'
    FROM response_result),
  'Customer approval succeeds through narrow broker grants and retries idempotently');
SELECT pg_temp.assert_ok(
  (public.respond_to_public_quotation(repeat('9',64),'change_requested','Different response','Buyer')->>'status')='already_responded',
  'A conflicting second customer response leaves the original evidence unchanged');
RESET ROLE;
SELECT pg_temp.assert_ok(
  (SELECT count(*)=1 FROM public.quotation_responses WHERE version_id=(SELECT revision_id FROM share_fixture))
  AND (SELECT state='approved' FROM public.quotation_versions WHERE id=(SELECT revision_id FROM share_fixture)),
  'A conflicting second customer response leaves one immutable approval and matching version state');
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(
  (SELECT data->>'state'='approved' AND data->'response'->>'kind'='approved'
    FROM public.read_public_quotation(repeat('9',64)) AS data),
  'Deferred quotation integrity accepts the retained approval and matching version state');
RESET ROLE;
ROLLBACK;
