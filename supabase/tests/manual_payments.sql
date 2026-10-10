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

INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-000000000001','payment-owner@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claims','{"sub":"ea000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
CREATE TEMP TABLE payment_fixture(
  business_id uuid, customer_id uuid,
  quote_a uuid, version_a uuid, invoice_a uuid,
  quote_b uuid, version_b uuid, invoice_b uuid,
  quote_zero uuid, version_zero uuid, invoice_zero uuid,
  partial_local timestamp without time zone,
  partial_result jsonb, correction_result jsonb, final_result jsonb, reversal_result jsonb,
  wrong_result jsonb, reversed_wrong jsonb, replacement_result jsonb
);
GRANT SELECT,INSERT,UPDATE ON payment_fixture TO authenticated;
CREATE TEMP TABLE payment_input(snapshot jsonb,normal_lines jsonb,zero_lines jsonb);
GRANT SELECT,INSERT ON payment_input TO authenticated;
INSERT INTO payment_input VALUES (
  '{
    "seller_display_name":"Payment Seller",
    "seller_contact_email":"seller@example.invalid",
    "seller_contact_phone":"9999999999",
    "seller_postal_address":"Seller address",
    "seller_state_code":"29",
    "seller_gst_registered":false,
    "buyer_display_name":"Payment Buyer",
    "buyer_contact_name":"Buyer contact",
    "buyer_email":"buyer@example.invalid",
    "buyer_phone":"8888888888",
    "buyer_billing_address":"Buyer address",
    "buyer_state_code":"29",
    "buyer_gstin_applicable":false,
    "document_time_zone":"Asia/Kolkata",
    "place_of_supply_applicable":false,
    "place_of_supply_state_code":null,
    "place_of_supply_text":null,
    "reverse_charge_applies":false,
    "gst_treatment_override":null,
    "seller_bank_name":null,
    "seller_bank_account_name":null,
    "seller_bank_account_number":null,
    "seller_bank_ifsc":null,
    "seller_upi_id":null,
    "payment_instructions":"Pay by UPI.",
    "terms":"Approved payment terms."
  }'::jsonb,
  '[{"description":"Payment service","unit_label":"service","quantity":"1","unit_price_minor":"10000","gst_category":"no_gst"}]'::jsonb,
  '[{"description":"No charge service","unit_label":"service","quantity":"1","unit_price_minor":"0","gst_category":"no_gst"}]'::jsonb
);

SET LOCAL ROLE authenticated;
INSERT INTO payment_fixture(business_id)
SELECT public.bootstrap_business('Payment Seller','seller@example.invalid','9999999999','Seller address','29',false,NULL);
UPDATE payment_fixture SET customer_id=public.create_customer(
  'Payment Buyer','Buyer contact','buyer@example.invalid','8888888888','Buyer address','29',false,NULL
);
UPDATE payment_fixture SET quote_a=public.create_quotation_draft(
  'ea111111-1111-4111-8111-111111111111',customer_id
);
UPDATE payment_fixture SET version_a=(SELECT current_version_id FROM public.quotations WHERE id=quote_a);
UPDATE payment_fixture SET quote_b=public.create_quotation_draft(
  'ea222222-2222-4222-8222-222222222222',customer_id
);
UPDATE payment_fixture SET version_b=(SELECT current_version_id FROM public.quotations WHERE id=quote_b);
UPDATE payment_fixture SET quote_zero=public.create_quotation_draft(
  'ea333333-3333-4333-8333-333333333333',customer_id
);
UPDATE payment_fixture SET version_zero=(SELECT current_version_id FROM public.quotations WHERE id=quote_zero);
SELECT public.save_quotation_draft(quote_a,0,input.snapshot,input.normal_lines)
FROM payment_fixture CROSS JOIN payment_input input;
SELECT public.save_quotation_draft(quote_b,0,input.snapshot,input.normal_lines)
FROM payment_fixture CROSS JOIN payment_input input;
SELECT public.save_quotation_draft(quote_zero,0,input.snapshot,input.zero_lines)
FROM payment_fixture CROSS JOIN payment_input input;
SELECT public.configure_invoice_number_period(
  'PAYMENT-TEST',DATE '2000-01-01',DATE '2100-01-01','PAY','{number}',4::smallint,1::bigint
);
SELECT public.share_quotation_draft(quote_a,version_a,
  'ea444444-4444-4444-8444-444444444444',repeat('c',64),NULL) FROM payment_fixture;
SELECT public.share_quotation_draft(quote_b,version_b,
  'ea555555-5555-4555-8555-555555555555',repeat('d',64),NULL) FROM payment_fixture;
SELECT public.share_quotation_draft(quote_zero,version_zero,
  'ea666666-6666-4666-8666-666666666666',repeat('e',64),NULL) FROM payment_fixture;
SET CONSTRAINTS public.quotation_integrity IMMEDIATE;
SET CONSTRAINTS public.quotation_integrity DEFERRED;
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.respond_to_public_quotation(repeat('c',64),'approved','Approved as quoted','Buyer');
SELECT public.respond_to_public_quotation(repeat('d',64),'approved','Approved as quoted','Buyer');
SELECT public.respond_to_public_quotation(repeat('e',64),'approved','Approved as quoted','Buyer');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT (public.convert_approved_quotation(quote_a,CURRENT_DATE+10,true)->>'created')::boolean FROM payment_fixture;
SELECT (public.convert_approved_quotation(quote_b,CURRENT_DATE+10,true)->>'created')::boolean FROM payment_fixture;
SELECT (public.convert_approved_quotation(quote_zero,CURRENT_DATE+10,true)->>'created')::boolean FROM payment_fixture;
UPDATE payment_fixture SET
  invoice_a=(SELECT id FROM public.invoices WHERE quotation_id=quote_a),
  invoice_b=(SELECT id FROM public.invoices WHERE quotation_id=quote_b),
  invoice_zero=(SELECT id FROM public.invoices WHERE quotation_id=quote_zero),
  partial_local=((SELECT issued_at FROM public.invoices WHERE quotation_id=quote_a)
    AT TIME ZONE 'Asia/Kolkata');

UPDATE payment_fixture SET partial_result=public.record_invoice_payment(
  invoice_a,'ea777777-7777-4777-8777-777777777777',3000,partial_local,'UPI','part-1',NULL
);
SELECT pg_temp.assert_ok(
  (SELECT (partial_result->>'created')::boolean
      AND (SELECT count(*)=1 FROM public.payments WHERE request_key='ea777777-7777-4777-8777-777777777777')
      AND (SELECT count(*)=1 FROM public.receipts WHERE payment_id=(partial_result->>'payment_id')::uuid)
   FROM payment_fixture),
  'Partial payment and exactly one matching receipt commit together'
);
SELECT pg_temp.assert_ok(
  (SELECT (retry->>'created')::boolean=false
      AND retry->>'payment_id'=partial_result->>'payment_id'
      AND retry->>'receipt_id'=partial_result->>'receipt_id'
   FROM payment_fixture CROSS JOIN LATERAL (
     SELECT public.record_invoice_payment(invoice_a,'ea777777-7777-4777-8777-777777777777',
       3000,partial_local,'UPI','part-1',NULL) AS retry
   ) result),
  'Identical request-key retry returns the original payment/receipt pair'
);
SAVEPOINT payment_pair_rollback;
SELECT public.record_invoice_payment(
  invoice_a,'ea717171-7171-4171-8171-717171717171',500,partial_local,'Cash','rollback-test',NULL
) FROM payment_fixture;
ROLLBACK TO SAVEPOINT payment_pair_rollback;
SELECT pg_temp.assert_ok(
  (SELECT NOT EXISTS (SELECT 1 FROM public.payments WHERE request_key='ea717171-7171-4171-8171-717171717171')
      AND NOT EXISTS (SELECT 1 FROM public.receipts r JOIN public.payments p
        ON p.business_id=r.business_id AND p.id=r.payment_id
        WHERE p.request_key='ea717171-7171-4171-8171-717171717171')
   FROM payment_fixture),
  'Rolling back a payment command leaves neither payment nor receipt'
);
RELEASE SAVEPOINT payment_pair_rollback;
SELECT pg_temp.expect_error(
  'SELECT public.record_invoice_payment(invoice_a,''ea777777-7777-4777-8777-777777777777'',3100,partial_local,''UPI'',''part-1'',NULL) FROM payment_fixture',
  '23505','Request-key payload conflict is rejected'
);
SELECT pg_temp.expect_error(
  'SELECT public.record_invoice_payment(invoice_a,''ea888888-8888-4888-8888-888888888888'',100,((clock_timestamp()+interval ''1 day'') AT TIME ZONE ''Asia/Kolkata''),''Cash'',NULL,NULL) FROM payment_fixture',
  '23514','Future received time is rejected'
);
SELECT pg_temp.expect_error(
  'SELECT public.record_invoice_payment(invoice_a,''ea999999-9999-4999-8999-999999999999'',100,((issued_at AT TIME ZONE document_time_zone)-interval ''1 minute''),''Cash'',NULL,NULL) FROM payment_fixture JOIN public.invoices ON invoices.id=invoice_a',
  '23514','Pre-issue received time is rejected'
);

UPDATE payment_fixture SET wrong_result=public.record_invoice_payment(
  invoice_b,'ea101010-1010-4010-8010-101010101010',1000,
  ((SELECT issued_at FROM public.invoices WHERE id=invoice_b) AT TIME ZONE 'Asia/Kolkata'),
  'Bank transfer','wrong-invoice',NULL
);
UPDATE payment_fixture SET reversed_wrong=public.reverse_invoice_payment(
  (wrong_result->>'payment_id')::uuid,'Recorded against the wrong invoice'
);
SELECT pg_temp.assert_ok(
  (SELECT (get_invoice_payment_summary(invoice_b)->>'paid_minor')='0'
      AND (get_invoice_payment_summary(invoice_b)->>'outstanding_minor')='10000'
      AND (get_invoice_payment_summary(invoice_b)->>'payment_status')='unpaid'
   FROM payment_fixture),
  'Reversal on the wrong invoice restores that invoice balance'
);
SELECT pg_temp.expect_error(
  'SELECT public.record_invoice_payment(invoice_a,''ea111010-1010-4010-8010-101010101010'',1000,partial_local,''UPI'',NULL,(wrong_result->>''payment_id'')::uuid) FROM payment_fixture',
  'P0002','Payment from another invoice cannot be used as a replacement predecessor'
);
UPDATE payment_fixture SET correction_result=public.record_invoice_payment(
  invoice_a,'ea121212-1212-4121-8121-121212121212',1000,partial_local,'UPI','correct-invoice',NULL
);
SELECT pg_temp.assert_ok(
  (SELECT ((correction_result->>'created')::boolean)
      AND (SELECT replaces_payment_id IS NULL FROM public.payments WHERE id=(correction_result->>'payment_id')::uuid)
      AND (SELECT replaces_receipt_id IS NULL FROM public.receipts WHERE id=(correction_result->>'receipt_id')::uuid)
   FROM payment_fixture),
  'Correct-invoice payment is recorded independently without a predecessor link'
);

SELECT pg_temp.expect_error(
  'SELECT public.record_invoice_payment(invoice_a,''ea131313-1313-4131-8131-131313131313'',6001,partial_local,''UPI'',NULL,NULL) FROM payment_fixture',
  '23514','Overpayment above current outstanding is rejected'
);
UPDATE payment_fixture SET final_result=public.record_invoice_payment(
  invoice_a,'ea141414-1414-4141-8141-141414141414',6000,partial_local,'Bank transfer','final',NULL
);
SELECT pg_temp.assert_ok(
  (SELECT (summary->>'paid_minor')='10000'
      AND (summary->>'outstanding_minor')='0'
      AND (summary->>'payment_status')='paid'
   FROM payment_fixture CROSS JOIN LATERAL (SELECT public.get_invoice_payment_summary(invoice_a) summary) s),
  'Partial plus final payment has an exact zero balance'
);

SELECT pg_temp.expect_error(
  'SELECT public.record_invoice_payment(invoice_zero,''ea151515-1515-4151-8151-151515151515'',1,(issued_at AT TIME ZONE document_time_zone),''Cash'',NULL,NULL) FROM payment_fixture JOIN public.invoices ON invoices.id=invoice_zero',
  '23514','Positive payment is rejected on a zero-total invoice'
);
SELECT pg_temp.assert_ok(
  (SELECT (summary->>'paid_minor')='0' AND (summary->>'outstanding_minor')='0'
      AND (summary->>'payment_status')='paid' AND (summary->>'overdue')::boolean=false
   FROM payment_fixture CROSS JOIN LATERAL (SELECT public.get_invoice_payment_summary(invoice_zero) summary) s),
  'Zero-total invoice is paid with zero paid and outstanding amounts'
);

UPDATE payment_fixture SET reversal_result=public.reverse_invoice_payment(
  (partial_result->>'payment_id')::uuid,'Wrong payment details'
);
SELECT pg_temp.assert_ok(
  (SELECT (retry->>'created')::boolean=false AND retry->>'reversal_id'=reversal_result->>'reversal_id'
   FROM payment_fixture CROSS JOIN LATERAL (
     SELECT public.reverse_invoice_payment(
       (partial_result->>'payment_id')::uuid,'Wrong payment details'
     ) AS retry
   ) result),
  'Identical reversal retry returns the original reversal'
);
SELECT pg_temp.expect_error(
  'SELECT public.reverse_invoice_payment((partial_result->>''payment_id'')::uuid,''Different reason'') FROM payment_fixture',
  '23505','Conflicting reversal reason is rejected'
);
SELECT pg_temp.assert_ok(
  (SELECT (retry->>'created')::boolean=false
      AND retry->>'payment_id'=partial_result->>'payment_id'
      AND retry->>'receipt_id'=partial_result->>'receipt_id'
      AND (retry->>'reversed')::boolean
   FROM payment_fixture CROSS JOIN LATERAL (
     SELECT public.record_invoice_payment(invoice_a,'ea777777-7777-4777-8777-777777777777',
       3000,partial_local,'UPI','part-1',NULL) AS retry
   ) result),
  'Payment retry after reversal still returns its original pair and reversed state'
);
SELECT pg_temp.assert_ok(
  (SELECT (summary->>'paid_minor')='7000' AND (summary->>'outstanding_minor')='3000'
      AND (summary->>'payment_status')='part_paid'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(summary->'payments') p
        WHERE p->'reversal'->>'reason'='Wrong payment details')
   FROM payment_fixture CROSS JOIN LATERAL (SELECT public.get_invoice_payment_summary(invoice_a) summary) s),
  'Reversal remains in history and is excluded from the effective balance'
);

UPDATE payment_fixture SET replacement_result=public.record_invoice_payment(
  invoice_a,'ea161616-1616-4161-8161-161616161616',3000,partial_local,'UPI','replacement',
  (partial_result->>'payment_id')::uuid
);
SELECT pg_temp.assert_ok(
  (SELECT (replacement_result->>'created')::boolean
      AND (SELECT replaces_payment_id=(partial_result->>'payment_id')::uuid
        FROM public.payments WHERE id=(replacement_result->>'payment_id')::uuid)
      AND (SELECT replaces_receipt_id=(partial_result->>'receipt_id')::uuid
        FROM public.receipts WHERE id=(replacement_result->>'receipt_id')::uuid)
   FROM payment_fixture),
  'Replacement payment and receipt point to the exact reversed predecessor pair'
);
SELECT pg_temp.assert_ok(
  (SELECT (retry->>'created')::boolean=false
      AND retry->>'payment_id'=replacement_result->>'payment_id'
      AND retry->>'receipt_id'=replacement_result->>'receipt_id'
   FROM payment_fixture CROSS JOIN LATERAL (
     SELECT public.record_invoice_payment(invoice_a,'ea161616-1616-4161-8161-161616161616',
       3000,partial_local,'UPI','replacement',(partial_result->>'payment_id')::uuid) AS retry
   ) result),
  'Replacement retry returns the existing replacement pair'
);
SELECT pg_temp.expect_error(
  'SELECT public.record_invoice_payment(invoice_a,''ea171717-1717-4171-8171-171717171717'',3000,partial_local,''UPI'',''duplicate-replacement'',(partial_result->>''payment_id'')::uuid) FROM payment_fixture',
  '23505','A reversed payment cannot receive a second replacement'
);
SELECT pg_temp.assert_ok(
  (SELECT (summary->>'paid_minor')='10000' AND (summary->>'outstanding_minor')='0'
      AND (summary->>'payment_status')='paid'
   FROM payment_fixture CROSS JOIN LATERAL (SELECT public.get_invoice_payment_summary(invoice_a) summary) s),
  'Replacement restores the effective full balance without changing the original rows'
);
SELECT pg_temp.assert_ok(
  (SELECT count(*)=4 AND count(DISTINCT r.reference)=4
      AND count(*) FILTER (WHERE r.payment_id IN (
        (f.partial_result->>'payment_id')::uuid,(f.correction_result->>'payment_id')::uuid,
        (f.final_result->>'payment_id')::uuid,(f.replacement_result->>'payment_id')::uuid
      ))=4
   FROM payment_fixture f JOIN public.receipts r ON r.invoice_id=f.invoice_a),
  'Each committed payment retains one unique receipt reference'
);
SELECT pg_temp.expect_error(
  'INSERT INTO public.payments(business_id,invoice_id,amount_minor,currency_code,currency_exponent,received_at,method,request_key,created_by) SELECT business_id,invoice_a,1,''INR'',2,clock_timestamp(),''Cash'',gen_random_uuid(),auth.uid() FROM payment_fixture',
  '42501','Authenticated direct payment writes remain denied'
);
RESET ROLE;

INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-000000000002','other-payment-owner@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claims','{"sub":"ea000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Other Payment Seller','other@example.invalid','7777777777','Other address','27',false,NULL);
SELECT pg_temp.assert_ok(
  (SELECT count(*)=0 FROM public.invoices WHERE id=invoice_a),
  'Another business cannot read the invoice under forced RLS'
) FROM payment_fixture;
SELECT pg_temp.expect_error(
  'SELECT public.get_invoice_payment_summary(invoice_a) FROM payment_fixture',
  'P0002','Another owner cannot read payment history'
);
SELECT pg_temp.expect_error(
  'SELECT public.reverse_invoice_payment((partial_result->>''payment_id'')::uuid,''Foreign reversal'') FROM payment_fixture',
  'P0002','Another owner cannot reverse a foreign payment'
);
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
