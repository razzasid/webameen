-- Direct Invoicing comprehensive verification.
-- Local Supabase only; all fixtures and changes are rolled back.
BEGIN;

CREATE FUNCTION pg_temp.assert_ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $t$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $t$;

CREATE FUNCTION pg_temp.expect_error(statement text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $t$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE; END;
  PERFORM pg_temp.assert_ok(actual = expected, label || ' (SQLSTATE ' || coalesce(actual, 'none') || ')');
END $t$;

-- Ensure standard 18% and 12% GST rates are selectable
INSERT INTO public.gst_rate_options(rate, selectable) VALUES (18, true), (12, true)
ON CONFLICT (rate) DO UPDATE SET selectable = true;

-- Setup test user
INSERT INTO auth.users(id, email, email_confirmed_at)
VALUES ('d1000000-0000-0000-0000-000000000001', 'direct-inv-owner@example.invalid', clock_timestamp())
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

CREATE TEMP TABLE direct_fixture(
  business_id uuid,
  customer_ka_id uuid,
  customer_mh_id uuid,
  catalog_item_id uuid,
  period_key text
);
GRANT SELECT, INSERT, UPDATE ON direct_fixture TO authenticated;

SET LOCAL ROLE authenticated;

-- Bootstrap seller business (Karnataka - 29, GST registered)
INSERT INTO direct_fixture(business_id)
SELECT public.bootstrap_business('Acme Corp Direct', 'seller-direct@example.invalid', '9876543210', 'Indiranagar Bangalore', '29', true, '29AAAAA0000A1Z5');

-- Configure invoice numbering period
SELECT public.configure_invoice_number_period(
  'FY-2026-DIR',
  '2026-04-01'::date,
  '2027-03-31'::date,
  'INV-DIR',
  '{prefix}/{number}',
  4::smallint,
  1::bigint
);
UPDATE direct_fixture SET period_key = 'FY-2026-DIR';

-- Create intra-state customer (Karnataka - 29)
UPDATE direct_fixture SET customer_ka_id = public.create_customer(
  'KA Buyer Pvt Ltd', 'John Doe', 'ka-buyer@example.invalid', '9123456780', 'MG Road Bangalore', '29', true, '29BBBBB1111B1Z2'
);

-- Create inter-state customer (Maharashtra - 27)
UPDATE direct_fixture SET customer_mh_id = public.create_customer(
  'MH Tech Services', 'Jane Smith', 'mh-buyer@example.invalid', '9123456781', 'Nariman Point Mumbai', '27', true, '27CCCCC2222C1Z3'
);

-- Create catalog item
UPDATE direct_fixture SET catalog_item_id = public.create_catalog_item(
  'service', 'Cloud Consulting', 'Hourly consulting service', 'hour', 500000::bigint, 'taxable', 18::numeric, '998311'
);

-- 1. Preview direct invoice (should not create rows or advance sequence)
DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
  v_preview jsonb;
  v_snapshot jsonb;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;

  v_snapshot := jsonb_build_object(
    'document_time_zone', 'Asia/Kolkata',
    'reverse_charge_applies', false,
    'place_of_supply_applicable', true,
    'place_of_supply_state_code', '29',
    'place_of_supply_text', 'Karnataka'
  );

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'source_catalog_item_id', v_fix.catalog_item_id,
      'description', 'Cloud Consulting Session',
      'unit_label', 'hour',
      'hsn_sac', '998311',
      'quantity', '2.000',
      'unit_price_minor', '500000',
      'gst_category', 'taxable',
      'gst_rate', '18'
    )
  );

  v_preview := public.preview_direct_invoice(v_fix.customer_ka_id, v_snapshot, v_lines);

  PERFORM pg_temp.assert_ok((v_preview->>'subtotal_minor')::bigint = 1000000, 'Preview subtotal is ₹10,000 (1000000 paise)');
  PERFORM pg_temp.assert_ok((v_preview->>'cgst_total_minor')::bigint = 90000, 'Preview CGST is ₹900 (90000 paise)');
  PERFORM pg_temp.assert_ok((v_preview->>'sgst_total_minor')::bigint = 90000, 'Preview SGST is ₹900 (90000 paise)');
  PERFORM pg_temp.assert_ok((v_preview->>'igst_total_minor')::bigint = 0, 'Preview IGST is 0 for intra-state');
  PERFORM pg_temp.assert_ok((v_preview->>'total_minor')::bigint = 1180000, 'Preview total is ₹11,800 (1180000 paise)');

  -- Verify no invoice was created
  PERFORM pg_temp.assert_ok((SELECT count(*) FROM public.invoices WHERE business_id = v_fix.business_id) = 0, 'Preview does not persist invoice rows');
END $test$;

-- 2. Create direct intra-state invoice with catalog item and manual item
CREATE TEMP TABLE direct_created_result(invoice_id uuid, reference text, sequence_number bigint);
GRANT SELECT, INSERT ON direct_created_result TO authenticated;

DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
  v_res jsonb;
  v_snapshot jsonb;
  v_lines jsonb;
  v_req_key uuid := 'd1111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;

  v_snapshot := jsonb_build_object(
    'document_time_zone', 'Asia/Kolkata',
    'reverse_charge_applies', false,
    'place_of_supply_applicable', true,
    'place_of_supply_state_code', '29',
    'place_of_supply_text', 'Karnataka',
    'terms', 'Payment due within 15 days.',
    'payment_instructions', 'UPI to acme@upi'
  );

  -- Line 1: catalog item (Cloud Consulting 18%), Line 2: custom manual item (Server Setup, 12%)
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'source_catalog_item_id', v_fix.catalog_item_id,
      'description', 'Cloud Consulting Session',
      'unit_label', 'hour',
      'hsn_sac', '998311',
      'quantity', '1.000',
      'unit_price_minor', '500000',
      'gst_category', 'taxable',
      'gst_rate', '18'
    ),
    jsonb_build_object(
      'source_catalog_item_id', NULL,
      'description', 'Custom Server Setup',
      'unit_label', 'server',
      'hsn_sac', '998313',
      'quantity', '1.000',
      'unit_price_minor', '200000',
      'gst_category', 'taxable',
      'gst_rate', '12'
    )
  );

  v_res := public.create_direct_invoice(
    v_req_key,
    v_fix.customer_ka_id,
    (CURRENT_DATE + 15),
    v_snapshot,
    v_lines
  );

  PERFORM pg_temp.assert_ok((v_res->>'created')::boolean = true, 'Direct invoice created successfully');

  INSERT INTO direct_created_result
  SELECT id, reference, sequence_number FROM public.invoices WHERE id = (v_res->>'invoice_id')::uuid;

  PERFORM pg_temp.assert_ok((SELECT reference FROM direct_created_result) = 'INV-DIR/0001', 'Direct invoice reference allocated as INV-DIR/0001');
END $test$;

-- 3. Verify invoice row integrity and snapshots
DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
  v_res direct_created_result%ROWTYPE;
  v_inv public.invoices%ROWTYPE;
  v_items_count int;
  v_cat_count int;
  v_manual_count int;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;
  SELECT * INTO v_res FROM direct_created_result;
  SELECT * INTO v_inv FROM public.invoices WHERE id = v_res.invoice_id;

  PERFORM pg_temp.assert_ok(v_inv.origin = 'direct', 'Invoice origin is direct');
  PERFORM pg_temp.assert_ok(v_inv.quotation_id IS NULL, 'Direct invoice has quotation_id NULL');
  PERFORM pg_temp.assert_ok(v_inv.source_version_id IS NULL, 'Direct invoice has source_version_id NULL');
  PERFORM pg_temp.assert_ok(v_inv.approved_response_id IS NULL, 'Direct invoice has approved_response_id NULL');
  PERFORM pg_temp.assert_ok(v_inv.customer_id = v_fix.customer_ka_id, 'Direct invoice links directly to customer');
  PERFORM pg_temp.assert_ok(v_inv.sequence_number = 1, 'Sequence number is 1');
  PERFORM pg_temp.assert_ok(v_inv.invoice_date = CURRENT_DATE, 'Invoice date preserved');
  PERFORM pg_temp.assert_ok(v_inv.due_on = (CURRENT_DATE + 15), 'Due date preserved');
  PERFORM pg_temp.assert_ok(v_inv.gst_treatment = 'cgst_sgst', 'GST treatment is cgst_sgst for Karnataka customer');

  -- Subtotal: 500,000 + 200,000 = 700,000
  -- Line 1 (18% on 500,000): CGST 45,000, SGST 45,000
  -- Line 2 (12% on 200,000): CGST 12,000, SGST 12,000
  -- Total CGST = 57,000, Total SGST = 57,000, Total GST = 114,000, Grand Total = 814,000
  PERFORM pg_temp.assert_ok(v_inv.subtotal_minor = 700000, 'Subtotal is ₹7,000 (700000 paise)');
  PERFORM pg_temp.assert_ok(v_inv.cgst_total_minor = 57000, 'CGST is ₹570 (57000 paise)');
  PERFORM pg_temp.assert_ok(v_inv.sgst_total_minor = 57000, 'SGST is ₹570 (57000 paise)');
  PERFORM pg_temp.assert_ok(v_inv.igst_total_minor = 0, 'IGST is 0');
  PERFORM pg_temp.assert_ok(v_inv.total_minor = 814000, 'Total is ₹8,140 (814000 paise)');

  -- Verify seller snapshot frozen
  PERFORM pg_temp.assert_ok(v_inv.seller_display_name = 'Acme Corp Direct', 'Seller snapshot preserved');
  PERFORM pg_temp.assert_ok(v_inv.buyer_display_name = 'KA Buyer Pvt Ltd', 'Buyer snapshot preserved');

  -- Verify line items
  SELECT count(*) INTO v_items_count FROM public.invoice_items WHERE invoice_id = v_res.invoice_id;
  PERFORM pg_temp.assert_ok(v_items_count = 2, '2 line items stored');

  SELECT count(*) INTO v_cat_count FROM public.invoice_items WHERE invoice_id = v_res.invoice_id AND source_catalog_item_id = v_fix.catalog_item_id;
  PERFORM pg_temp.assert_ok(v_cat_count = 1, '1 line item references catalog item');

  SELECT count(*) INTO v_manual_count FROM public.invoice_items WHERE invoice_id = v_res.invoice_id AND source_catalog_item_id IS NULL;
  PERFORM pg_temp.assert_ok(v_manual_count = 1, '1 line item is custom manual line');
END $test$;

-- 4. Test idempotency: resubmission with the exact same request_key
DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
  v_res_first direct_created_result%ROWTYPE;
  v_res_second jsonb;
  v_snapshot jsonb;
  v_lines jsonb;
  v_req_key uuid := 'd1111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;
  SELECT * INTO v_res_first FROM direct_created_result;

  v_snapshot := jsonb_build_object('document_time_zone', 'Asia/Kolkata');
  v_lines := jsonb_build_array(jsonb_build_object(
    'source_catalog_item_id', v_fix.catalog_item_id,
    'description', 'Ignored in retry',
    'quantity', '1',
    'unit_price_minor', '1000'
  ));

  v_res_second := public.create_direct_invoice(
    v_req_key,
    v_fix.customer_ka_id,
    (CURRENT_DATE + 15),
    v_snapshot,
    v_lines
  );

  PERFORM pg_temp.assert_ok((v_res_second->>'created')::boolean = false, 'Retry indicates existing invoice (created=false)');
  PERFORM pg_temp.assert_ok((v_res_second->>'invoice_id')::uuid = v_res_first.invoice_id, 'Retry returns original invoice ID');

  -- Verify total invoice count is still 1
  PERFORM pg_temp.assert_ok((SELECT count(*) FROM public.invoices WHERE business_id = v_fix.business_id) = 1, 'Idempotent retry does not create another invoice');
  -- Verify sequence number cursor did not advance
  PERFORM pg_temp.assert_ok((SELECT last_issued_number FROM public.invoice_number_sequences WHERE business_id = v_fix.business_id AND period_key = v_fix.period_key) = 1, 'Number cursor is still 1');
END $test$;

-- 5. Test inter-state invoice (Maharashtra customer -> IGST)
DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
  v_res jsonb;
  v_snapshot jsonb;
  v_lines jsonb;
  v_req_key uuid := 'd2222222-2222-4222-8222-222222222222'::uuid;
  v_inv public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;

  v_snapshot := jsonb_build_object(
    'document_time_zone', 'Asia/Kolkata',
    'place_of_supply_applicable', true,
    'place_of_supply_state_code', '27',
    'place_of_supply_text', 'Maharashtra'
  );

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'source_catalog_item_id', v_fix.catalog_item_id,
      'description', 'Inter-state Service',
      'unit_label', 'hour',
      'hsn_sac', '998311',
      'quantity', '1.000',
      'unit_price_minor', '1000000',
      'gst_category', 'taxable',
      'gst_rate', '18'
    )
  );

  v_res := public.create_direct_invoice(
    v_req_key,
    v_fix.customer_mh_id,
    (CURRENT_DATE + 20),
    v_snapshot,
    v_lines
  );

  PERFORM pg_temp.assert_ok((v_res->>'created')::boolean = true, 'Inter-state invoice created');

  SELECT * INTO v_inv FROM public.invoices WHERE id = (v_res->>'invoice_id')::uuid;

  PERFORM pg_temp.assert_ok(v_inv.reference = 'INV-DIR/0002', 'Next sequence reference INV-DIR/0002 allocated sequentially');

  PERFORM pg_temp.assert_ok(v_inv.gst_treatment = 'igst', 'Inter-state auto treatment is IGST');
  PERFORM pg_temp.assert_ok(v_inv.cgst_total_minor = 0, 'CGST is 0 for IGST treatment');
  PERFORM pg_temp.assert_ok(v_inv.sgst_total_minor = 0, 'SGST is 0 for IGST treatment');
  PERFORM pg_temp.assert_ok(v_inv.igst_total_minor = 180000, 'IGST is ₹1,800 (180000 paise)');
  PERFORM pg_temp.assert_ok(v_inv.total_minor = 1180000, 'Total is ₹11,800 (1180000 paise)');
END $test$;

-- 6. Due date validation: due date before invoice date must be rejected
DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;

  PERFORM pg_temp.expect_error(
    'SELECT public.create_direct_invoice('
    || '''d3333333-3333-4333-8333-333333333333''::uuid, '
    || '''' || v_fix.customer_ka_id || '''::uuid, '
    || '''2020-01-01''::date, '
    || '''{"document_time_zone":"Asia/Kolkata"}''::jsonb, '
    || '''[{"description":"Test","quantity":"1","unit_price_minor":"1000"}]''::jsonb)',
    '22023',
    'Due date before invoice date is rejected'
  );

  -- Ensure number cursor was not incremented
  PERFORM pg_temp.assert_ok((SELECT last_issued_number FROM public.invoice_number_sequences WHERE business_id = v_fix.business_id AND period_key = v_fix.period_key) = 2, 'Number cursor remains at 2 after rejected invoice');
END $test$;

-- 7. Payment compatibility: record payment against direct invoice
DO $test$
DECLARE
  v_res direct_created_result%ROWTYPE;
  v_pay_res jsonb;
  v_pay_key uuid := 'd4444444-4444-4444-8444-444444444444'::uuid;
  v_receipt_count int;
BEGIN
  SELECT * INTO v_res FROM direct_created_result;

  -- Record partial payment of ₹5,000 (500000 paise) against invoice 1 (total is 814,000 paise)
  v_pay_res := public.record_invoice_payment(
    v_res.invoice_id,
    v_pay_key,
    500000::bigint,
    (clock_timestamp() AT TIME ZONE 'Asia/Kolkata'),
    'bank_transfer',
    'UTR123456789',
    NULL
  );

  PERFORM pg_temp.assert_ok((v_pay_res->>'payment_id') IS NOT NULL, 'Payment recorded against direct invoice');
  PERFORM pg_temp.assert_ok((v_pay_res->>'receipt_reference') IS NOT NULL, 'Receipt issued for direct invoice payment');

  PERFORM pg_temp.assert_ok(
    (SELECT inv.total_minor - coalesce(sum(p.amount_minor), 0)
     FROM public.invoices inv
     LEFT JOIN public.payments p ON p.invoice_id = inv.id
     WHERE inv.id = v_res.invoice_id
     GROUP BY inv.total_minor) = 314000,
    'Remaining balance correct: ₹3,140 (314000 paise)'
  );

  SELECT count(*) INTO v_receipt_count FROM public.receipts WHERE invoice_id = v_res.invoice_id;
  PERFORM pg_temp.assert_ok(v_receipt_count = 1, '1 receipt committed for direct invoice');
END $test$;

-- 8. Cross-business isolation: another owner cannot read or mutate the direct invoice
RESET ROLE;
INSERT INTO auth.users(id, email, email_confirmed_at)
VALUES ('d9000000-0000-0000-0000-000000000009'::uuid, 'other-owner@example.invalid', clock_timestamp())
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claims', '{"sub":"d9000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_res direct_created_result%ROWTYPE;
  v_visible_count int;
BEGIN
  SELECT * INTO v_res FROM direct_created_result;

  PERFORM public.bootstrap_business('Competitor Business', 'other@example.invalid', '9999999990', 'Delhi', '07', false, NULL);

  -- Competitor tries to read direct invoices under RLS
  SELECT count(*) INTO v_visible_count FROM public.invoices WHERE id = v_res.invoice_id;
  PERFORM pg_temp.assert_ok(v_visible_count = 0, 'Competitor business cannot read direct invoice of first business');
END $test$;

-- 9. Existing quotation conversion still functions seamlessly alongside direct invoices
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
  v_quote_id uuid;
  v_conv_res jsonb;
  v_req_key uuid := 'd5555555-5555-4555-8555-555555555555'::uuid;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;

  -- Create quotation draft
  v_quote_id := public.create_quotation_draft(v_req_key, v_fix.customer_ka_id);

  -- Save quotation
  PERFORM public.save_quotation_draft(
    v_quote_id,
    0,
    jsonb_build_object(
      'seller_display_name', 'Acme Corp Direct',
      'seller_postal_address', 'Indiranagar Bangalore',
      'seller_state_code', '29',
      'seller_gst_registered', true,
      'seller_gstin', '29AAAAA0000A1Z5',
      'buyer_display_name', 'KA Buyer Pvt Ltd',
      'buyer_billing_address', 'MG Road Bangalore',
      'buyer_state_code', '29',
      'buyer_gstin_applicable', true,
      'buyer_gstin', '29BBBBB1111B1Z2',
      'document_time_zone', 'Asia/Kolkata',
      'place_of_supply_applicable', true,
      'place_of_supply_state_code', '29',
      'place_of_supply_text', 'Karnataka',
      'reverse_charge_applies', false,
      'terms', 'Standard terms'
    ),
    jsonb_build_array(jsonb_build_object(
      'source_catalog_item_id', v_fix.catalog_item_id,
      'description', 'Quotation Item',
      'unit_label', 'hour',
      'quantity', '1.000',
      'unit_price_minor', '100000',
      'gst_category', 'taxable',
      'gst_rate', '18'
    ))
  );

  -- Share quotation
  PERFORM public.share_quotation_draft(
    v_quote_id,
    (SELECT current_version_id FROM public.quotations WHERE id = v_quote_id),
    'd6666666-6666-4666-8666-666666666666'::uuid,
    repeat('f', 64),
    NULL
  );
END $test$;

-- Customer approves quotation via broker
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_ok(
  (public.respond_to_public_quotation(repeat('f', 64), 'approved', 'Approved directly', 'Buyer')->>'status') = 'recorded',
  'Quotation approved via response broker'
);

-- Back to owner
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_fix direct_fixture%ROWTYPE;
  v_quote_id uuid;
  v_conv_res jsonb;
BEGIN
  SELECT * INTO v_fix FROM direct_fixture;
  SELECT id INTO v_quote_id FROM public.quotations WHERE business_id = v_fix.business_id ORDER BY created_at DESC LIMIT 1;

  -- Convert approved quotation into invoice
  v_conv_res := public.convert_approved_quotation(v_quote_id, (CURRENT_DATE + 10), true);

  PERFORM pg_temp.assert_ok((v_conv_res->>'created')::boolean = true, 'Quotation converted into invoice successfully alongside direct invoices');
  PERFORM pg_temp.assert_ok((SELECT reference FROM public.invoices WHERE id = (v_conv_res->>'invoice_id')::uuid) = 'INV-DIR/0003', 'Quotation-converted invoice allocated next sequence INV-DIR/0003');
  PERFORM pg_temp.assert_ok((SELECT origin FROM public.invoices WHERE id = (v_conv_res->>'invoice_id')::uuid) = 'quotation_converted', 'Converted invoice has origin quotation_converted');
END $test$;

DO $$ BEGIN RAISE NOTICE 'All direct invoicing database tests completed successfully!'; END $$;
ROLLBACK;
