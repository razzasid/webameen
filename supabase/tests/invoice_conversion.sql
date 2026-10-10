-- Local Supabase only; all fixtures and workflow changes are rolled back.
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
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('e9000000-0000-0000-0000-000000000001','invoice-owner@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claims','{"sub":"e9000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

CREATE TEMP TABLE invoice_fixture(
  business_id uuid, customer_id uuid, quotation_id uuid, version_id uuid,
  second_quote_id uuid, second_version_id uuid,
  unapproved_quote_id uuid, unapproved_version_id uuid, invoice_id uuid,
  invoice_link_id uuid
);
GRANT SELECT,INSERT,UPDATE ON invoice_fixture TO authenticated;
SET LOCAL ROLE authenticated;
INSERT INTO invoice_fixture(business_id)
SELECT public.bootstrap_business('Seller before issue','seller@example.invalid','9999999999','Seller address','29',false,NULL);
UPDATE invoice_fixture SET customer_id=public.create_customer(
  'Buyer before issue','Buyer contact','buyer@example.invalid','8888888888','Buyer address','29',false,NULL
);
UPDATE invoice_fixture SET quotation_id=public.create_quotation_draft(
  'e9111111-1111-4111-8111-111111111111',customer_id
);
UPDATE invoice_fixture SET version_id=(SELECT current_version_id FROM public.quotations WHERE id=quotation_id);
CREATE TEMP TABLE invoice_input(snapshot jsonb,lines jsonb);
GRANT SELECT,INSERT ON invoice_input TO authenticated;
INSERT INTO invoice_input VALUES (
  '{
    "seller_display_name":"Approved Seller",
    "seller_contact_email":"frozen-seller@example.invalid",
    "seller_contact_phone":"7777777777",
    "seller_postal_address":"Frozen seller address",
    "seller_state_code":"29",
    "seller_gst_registered":false,
    "buyer_display_name":"Approved Buyer",
    "buyer_contact_name":"Frozen contact",
    "buyer_email":"frozen-buyer@example.invalid",
    "buyer_phone":"6666666666",
    "buyer_billing_address":"Frozen buyer address",
    "buyer_state_code":"29",
    "buyer_gstin_applicable":false,
    "document_time_zone":"Asia/Kolkata",
    "place_of_supply_applicable":true,
    "place_of_supply_state_code":"29",
    "place_of_supply_text":"Karnataka",
    "reverse_charge_applies":true,
    "gst_treatment_override":"igst",
    "seller_bank_name":"Frozen Bank",
    "seller_bank_account_name":"Frozen Holder",
    "seller_bank_account_number":"00123456",
    "seller_bank_ifsc":"ABCD0000123",
    "seller_upi_id":"frozen@example",
    "payment_instructions":"Pay using the frozen details.",
    "terms":"Frozen approved terms."
  }'::jsonb,
  '[{"description":"Distinctive service","unit_label":"day","quantity":"1.125","unit_price_minor":"10000","gst_category":"taxable","gst_rate":"18"}]'::jsonb
);
SELECT pg_temp.assert_ok(
  (SELECT (public.save_quotation_draft(f.quotation_id,0,i.snapshot,i.lines)->>'total_minor')='13275'
   FROM invoice_fixture f CROSS JOIN invoice_input i),
  'Owner saves the distinctive GST quotation snapshot');
SELECT pg_temp.assert_ok(
  (SELECT (public.share_quotation_draft(f.quotation_id,f.version_id,
      'e9222222-2222-4222-8222-222222222222',repeat('c',64),NULL)->>'created')::boolean
   FROM invoice_fixture f),
  'Approved-source fixture is shared');
UPDATE invoice_fixture SET second_quote_id=public.create_quotation_draft(
  'e9333333-3333-4333-8333-333333333333',customer_id
);
UPDATE invoice_fixture SET second_version_id=(SELECT current_version_id FROM public.quotations WHERE id=second_quote_id);
SELECT pg_temp.assert_ok(
  (SELECT (public.save_quotation_draft(f.second_quote_id,0,i.snapshot,i.lines)->>'total_minor')='13275'
   FROM invoice_fixture f CROSS JOIN invoice_input i),
  'Second approved-source fixture saves an independent quotation');
SELECT pg_temp.assert_ok(
  (SELECT (public.share_quotation_draft(f.second_quote_id,f.second_version_id,
      'e9444444-4444-4444-8444-444444444444',repeat('d',64),NULL)->>'created')::boolean
   FROM invoice_fixture f),
  'Second approved-source fixture is shared');
SELECT public.configure_invoice_number_period(
  'FY-TEST',DATE '2000-01-01',DATE '2100-01-01','WAM',
  '{prefix}/{period}/{number}',4::smallint,100::bigint
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(
  (public.respond_to_public_quotation(repeat('c',64),'approved','Approved as quoted','Buyer')->>'status')='recorded',
  'Customer approval is recorded through the accountless response broker'
);
SELECT pg_temp.assert_ok(
  (public.respond_to_public_quotation(repeat('d',64),'approved','Approved as quoted','Buyer')->>'status')='recorded',
  'A second customer approval is recorded for allocation coverage'
);
RESET ROLE;

-- Live customer, business and GST-rate changes after approval must not refresh
-- the immutable source values or block conversion of its historical tax rate.
UPDATE public.businesses SET display_name='Seller changed after approval'
WHERE id=(SELECT business_id FROM invoice_fixture);
UPDATE public.customers SET display_name='Buyer changed after approval'
WHERE id=(SELECT customer_id FROM invoice_fixture);
UPDATE public.gst_rate_options SET selectable=false WHERE rate=18;

SET LOCAL ROLE authenticated;
UPDATE invoice_fixture SET unapproved_quote_id=public.create_quotation_draft(
  'e9555555-5555-4555-8555-555555555555',customer_id
);
UPDATE invoice_fixture SET unapproved_version_id=(SELECT current_version_id FROM public.quotations WHERE id=unapproved_quote_id);
SET CONSTRAINTS public.quotation_integrity IMMEDIATE;
SET CONSTRAINTS public.quotation_integrity DEFERRED;
SELECT pg_temp.expect_error(
  'SELECT public.convert_approved_quotation(unapproved_quote_id,NULL,true) FROM invoice_fixture',
  '23514','Unapproved quotation cannot be invoiced'
);
SELECT pg_temp.assert_ok(
  (SELECT last_issued_number IS NULL FROM public.invoice_number_sequences WHERE period_key='FY-TEST'),
  'Rejected conversion does not advance the number cursor'
);
SELECT pg_temp.expect_error(
  'SELECT public.convert_approved_quotation(quotation_id,CURRENT_DATE-1,true) FROM invoice_fixture',
  '22023','Due date before issue date is rejected'
);
SELECT pg_temp.assert_ok(
  (SELECT last_issued_number IS NULL FROM public.invoice_number_sequences WHERE period_key='FY-TEST'),
  'Invalid due date leaves the number cursor unchanged'
);
SELECT pg_temp.assert_ok(
  (SELECT (public.convert_approved_quotation(quotation_id,(CURRENT_DATE+10),true)->>'created')::boolean
   FROM invoice_fixture),
  'Current approved quotation converts to one invoice'
);
UPDATE invoice_fixture SET invoice_id=(
  SELECT id FROM public.invoices WHERE quotation_id=invoice_fixture.quotation_id
);
SELECT pg_temp.assert_ok(
  (SELECT reference='WAM/FY-TEST/0100' AND sequence_number=100 AND numbering_period='FY-TEST'
      AND invoice_date=(issued_at AT TIME ZONE document_time_zone)::date
      AND due_on >= invoice_date
      AND issued_at >= (SELECT shared_at FROM public.quotation_versions WHERE id=source_version_id)
   FROM public.invoices WHERE id=(SELECT invoice_id FROM invoice_fixture)),
  'Invoice uses the owner format, first number, post-approval issue time and frozen local date'
);
SELECT pg_temp.assert_ok(
  (SELECT
     (to_jsonb(i) - ARRAY['id','business_id','quotation_id','customer_id','source_version_id','approved_response_id','numbering_period','sequence_number','reference','issued_at','invoice_date','due_on','created_by'])
     =
     (to_jsonb(v) - ARRAY['id','business_id','quotation_id','version_number','previous_version_id','state','edit_sequence','valid_until','response_deadline_at','created_by','created_at','edited_at','shared_by','shared_at','superseded_by','superseded_at'])
   FROM public.invoices i
   JOIN invoice_fixture f ON f.invoice_id=i.id
   JOIN public.quotation_versions v ON v.business_id=i.business_id AND v.id=i.source_version_id),
  'Every invoice content column equals its approved source, including null and remittance values'
);
SELECT pg_temp.assert_ok(
  (SELECT count(*)=1
      AND bool_and(
        (to_jsonb(ii) - ARRAY['id','business_id','invoice_id','source_version_id','source_quotation_item_id'])
        =
        (to_jsonb(qi) - ARRAY['id','business_id','version_id','source_catalog_item_id'])
      )
   FROM public.invoice_items ii
   JOIN invoice_fixture f ON f.invoice_id=ii.invoice_id
   JOIN public.quotation_items qi ON qi.business_id=ii.business_id
     AND qi.version_id=ii.source_version_id AND qi.id=ii.source_quotation_item_id),
  'Invoice line source identity and every stored line value match exactly'
);
SELECT pg_temp.assert_ok(
  (SELECT (public.convert_approved_quotation(quotation_id,NULL,true)->>'created')::boolean=false
   FROM invoice_fixture),
  'Same quotation retry returns its existing invoice without another number'
);
SELECT pg_temp.assert_ok(
  (SELECT last_issued_number=100 FROM public.invoice_number_sequences WHERE period_key='FY-TEST')
  AND (SELECT count(*)=1 FROM public.invoices WHERE quotation_id=(SELECT quotation_id FROM invoice_fixture)),
  'Idempotent retry leaves one invoice and an unchanged cursor'
);
SELECT pg_temp.assert_ok(
  (SELECT (public.convert_approved_quotation(second_quote_id,NULL,true)->>'created')::boolean
   FROM invoice_fixture),
  'A second approved quotation converts independently'
);
SELECT pg_temp.assert_ok(
  (SELECT sequence_number=101 AND reference='WAM/FY-TEST/0101'
   FROM public.invoices WHERE quotation_id=(SELECT second_quote_id FROM invoice_fixture))
  AND (SELECT last_issued_number=101 FROM public.invoice_number_sequences WHERE period_key='FY-TEST'),
  'A second approved quotation allocates the next unique number'
);
SELECT pg_temp.expect_error(
  'SELECT public.configure_invoice_number_period(''FY-TEST'',DATE ''2000-01-01'',DATE ''2100-01-01'',''CHANGED'',''{prefix}/{period}/{number}'',4::smallint,100::bigint)',
  '23514','Used numbering settings cannot change'
);
SELECT pg_temp.expect_error(
  'SELECT public.configure_invoice_number_period(''OVERLAP'',DATE ''2020-01-01'',DATE ''2021-01-01'',''X'',''{number}'',1::smallint,1::bigint)',
  '23514','Overlapping numbering period rejected'
);
SELECT pg_temp.expect_error(
  'INSERT INTO public.invoices(business_id) SELECT business_id FROM invoice_fixture',
  '42501','Authenticated raw invoice writes remain denied'
);
UPDATE invoice_fixture SET invoice_link_id=(
  public.create_invoice_link(invoice_id,
    'ea111111-1111-4111-8111-111111111111',repeat('a',64),NULL)->>'link_id'
)::uuid;
SELECT pg_temp.assert_ok(
  (SELECT public.create_invoice_link(invoice_id,
      'ea111111-1111-4111-8111-111111111111',repeat('b',64),NULL)->>'created'='false'
   FROM invoice_fixture),
  'Same-key invoice link retry returns the original result without replacing its secret'
);
SELECT pg_temp.expect_error(
  'SELECT public.create_invoice_link(invoice_id,''ea222222-2222-4222-8222-222222222222'',repeat(''c'',64),NULL) FROM invoice_fixture',
  '23514','A second create cannot replace an active invoice link'
);
SELECT pg_temp.assert_ok(
  NOT has_column_privilege('authenticated','public.invoice_public_links','token_hash','SELECT')
    AND NOT has_function_privilege('anon','public.read_public_invoice(text)','EXECUTE')
    AND has_function_privilege('service_role','public.read_public_invoice(text)','EXECUTE')
    AND NOT has_table_privilege('service_role','public.invoices','SELECT')
    AND (SELECT relrowsecurity AND relforcerowsecurity
         FROM pg_class WHERE oid='public.invoice_public_links'::regclass),
  'Only the server broker can call public invoice reads; raw hashes and invoice rows remain private'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(
  (public.read_public_invoice(repeat('a',64))->>'reference')='WAM/FY-TEST/0100'
  AND public.read_public_invoice(repeat('a',64)) #>> '{seller,display_name}'='Approved Seller'
  AND public.read_public_invoice(repeat('a',64)) #>> '{buyer,display_name}'='Approved Buyer'
  AND public.read_public_invoice(repeat('a',64)) #>> '{lines,0,description}'='Distinctive service'
  AND public.read_public_invoice(repeat('a',64)) #>> '{lines,0,quantity}'='1.125000'
  AND public.read_public_invoice(repeat('a',64)) #>> '{totals,total_minor}'='13275'
  AND NOT (public.read_public_invoice(repeat('a',64)) ? 'business_id')
  AND NOT (public.read_public_invoice(repeat('a',64)) ? 'payments')
  AND public.read_public_invoice('invalid') IS NULL,
  'Valid token returns only the frozen invoice snapshot and invalid tokens are unavailable'
);
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e9000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT (public.rotate_invoice_link(invoice_id,
    'ea333333-3333-4333-8333-333333333333',repeat('b',64),NULL)->>'created')::boolean
   FROM invoice_fixture),
  'Explicit rotation creates a new one-time secret'
);
SELECT pg_temp.assert_ok(
  (SELECT public.rotate_invoice_link(invoice_id,
    'ea333333-3333-4333-8333-333333333333',repeat('f',64),NULL)->>'created'='false'
   FROM invoice_fixture),
  'Same-key rotation retry cannot rotate a newer active link'
);
UPDATE invoice_fixture SET invoice_link_id=(
  SELECT id FROM public.invoice_public_links
  WHERE invoice_id=invoice_fixture.invoice_id AND revoked_at IS NULL
);
SELECT pg_temp.assert_ok(
  (SELECT public.revoke_invoice_link(invoice_id,invoice_link_id)->>'revocation_reason'='owner_revoked'
   FROM invoice_fixture),
  'Owner can revoke the current invoice link'
);
SELECT pg_temp.assert_ok(
  (SELECT (public.create_invoice_link(invoice_id,
    'ea444444-4444-4444-8444-444444444444',repeat('c',64),clock_timestamp()+interval '2 seconds')->>'created')::boolean
   FROM invoice_fixture),
  'Owner can create a link with an explicit future access cutoff'
);
SELECT pg_catalog.pg_sleep(2.2);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(
  public.read_public_invoice(repeat('a',64)) IS NULL
    AND public.read_public_invoice(repeat('b',64)) IS NULL
    AND public.read_public_invoice(repeat('c',64)) IS NULL,
  'Rotation, revocation and expiry block subsequent customer reads'
);
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e9000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.revoke_invoice_link(invoice_id,
  (SELECT id FROM public.invoice_public_links WHERE invoice_id=invoice_fixture.invoice_id
    AND creation_request_key='ea444444-4444-4444-8444-444444444444'))
FROM invoice_fixture;
SELECT public.create_invoice_link(invoice_id,
  'ea555555-5555-4555-8555-555555555555',repeat('d',64),NULL)
FROM invoice_fixture;
RESET ROLE;
UPDATE public.business_memberships SET disabled_at=clock_timestamp()
WHERE user_id='e9000000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(
  public.read_public_invoice(repeat('d',64)) IS NULL,
  'Disabling the invoice owner blocks future customer reads'
);
RESET ROLE;
UPDATE public.business_memberships SET disabled_at=NULL
WHERE user_id='e9000000-0000-0000-0000-000000000001';

-- A second owner cannot read or issue the first owner's invoice/quotation. Its
-- own approved quotes also exercise missing-period and bigint-exhaustion paths.
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('e9000000-0000-0000-0000-000000000002','other-invoice-owner@example.invalid',clock_timestamp());
-- The first owner disabled rate 18 to prove historical conversion survives
-- rate retirement. Restore the fixture option for Business B's new drafts.
UPDATE public.gst_rate_options SET selectable=true WHERE rate=18;
SELECT set_config('request.jwt.claims','{"sub":"e9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
CREATE TEMP TABLE invoice_owner_b(
  business_id uuid, customer_id uuid, missing_quote_id uuid,
  max_first_quote_id uuid, max_second_quote_id uuid
);
GRANT SELECT,INSERT,UPDATE ON invoice_owner_b TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok(
  (SELECT count(*)=0 FROM public.invoice_public_links
    WHERE invoice_id=(SELECT invoice_id FROM invoice_fixture)),
  'Another business owner cannot read the first owner invoice link metadata'
);
INSERT INTO invoice_owner_b(business_id)
SELECT public.bootstrap_business('Other seller','other@example.invalid','5555555555','Other address','27',false,NULL);
UPDATE invoice_owner_b SET customer_id=public.create_customer(
  'Other buyer',NULL,NULL,NULL,'Other buyer address','27',false,NULL
);
UPDATE invoice_owner_b SET missing_quote_id=public.create_quotation_draft(
  'e9666666-6666-4666-8666-666666666666',customer_id
);
SELECT public.save_quotation_draft(missing_quote_id,0,i.snapshot,i.lines)
FROM invoice_owner_b CROSS JOIN invoice_input i;
SELECT public.share_quotation_draft(missing_quote_id,
  (SELECT current_version_id FROM public.quotations WHERE id=missing_quote_id),
  'e9999999-9999-4999-8999-999999999991',repeat('e',64),NULL)
FROM invoice_owner_b;
SET CONSTRAINTS public.quotation_integrity IMMEDIATE;
SET CONSTRAINTS public.quotation_integrity DEFERRED;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.respond_to_public_quotation(repeat('e',64),'approved','Approved','Buyer');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.convert_approved_quotation(missing_quote_id,NULL,true) FROM invoice_owner_b',
  '22023','Approved quotation without an applicable numbering period is rejected'
);
SELECT pg_temp.assert_ok(
  (SELECT count(*)=0 FROM public.invoices WHERE quotation_id=(SELECT missing_quote_id FROM invoice_owner_b)),
  'Missing period does not create an invoice'
);
UPDATE invoice_owner_b SET max_first_quote_id=public.create_quotation_draft(
  'e9777777-7777-4777-8777-777777777777',customer_id
);
SELECT public.save_quotation_draft(max_first_quote_id,0,i.snapshot,i.lines)
FROM invoice_owner_b CROSS JOIN invoice_input i;
SELECT public.share_quotation_draft(max_first_quote_id,
  (SELECT current_version_id FROM public.quotations WHERE id=max_first_quote_id),
  'e9999999-9999-4999-8999-999999999992',repeat('f',64),NULL)
FROM invoice_owner_b;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.respond_to_public_quotation(repeat('f',64),'approved','Approved','Buyer');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.configure_invoice_number_period(
  'MAX-TEST',DATE '2000-01-01',DATE '2100-01-01','MAX','{number}',1::smallint,9223372036854775807::bigint
);
SELECT pg_temp.assert_ok(
  (SELECT (public.convert_approved_quotation(max_first_quote_id,NULL,true)->>'created')::boolean
   FROM invoice_owner_b),
  'The largest valid bigint can be issued once'
);
UPDATE invoice_owner_b SET max_second_quote_id=public.create_quotation_draft(
  'e9888888-8888-4888-8888-888888888888',customer_id
);
SELECT public.save_quotation_draft(max_second_quote_id,0,i.snapshot,i.lines)
FROM invoice_owner_b CROSS JOIN invoice_input i;
SELECT public.share_quotation_draft(max_second_quote_id,
  (SELECT current_version_id FROM public.quotations WHERE id=max_second_quote_id),
  'e9999999-9999-4999-8999-999999999993',repeat('a',64),NULL)
FROM invoice_owner_b;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.respond_to_public_quotation(repeat('a',64),'approved','Approved','Buyer');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  'SELECT public.convert_approved_quotation(max_second_quote_id,NULL,true) FROM invoice_owner_b',
  '22003','Number allocation rejects bigint overflow'
);
SELECT pg_temp.assert_ok(
  (SELECT last_issued_number=9223372036854775807 FROM public.invoice_number_sequences WHERE period_key='MAX-TEST')
  AND (SELECT count(*)=0 FROM public.invoices WHERE quotation_id=(SELECT max_second_quote_id FROM invoice_owner_b)),
  'Overflow rollback leaves the cursor and second quote unchanged'
);
SELECT pg_temp.assert_ok(
  (SELECT count(*)=0 FROM public.invoices WHERE id=(SELECT invoice_id FROM invoice_fixture)),
  'Other owner cannot read the invoice under forced RLS'
);
SELECT pg_temp.expect_error(
  'SELECT public.convert_approved_quotation(quotation_id,NULL,true) FROM invoice_fixture',
  'P0002','Other owner cannot issue a foreign quotation'
);
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
