-- Database foundation verification. Run only against disposable LOCAL development data.
-- psql -X -v ON_ERROR_STOP=1 -f supabase/tests/foundation.sql <local connection>
-- All fixtures and helper functions are rolled back. No application seed data.
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
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
  END;
  PERFORM pg_temp.assert_ok(actual = expected, label || ' (SQLSTATE ' || coalesce(actual,'no error') || ')');
END
$test$;

-- Exact field inventory: protects the approved schema from drift.
CREATE TEMP TABLE expected_columns(table_name text, column_name text, data_type text, not_null boolean, default_expr text);
INSERT INTO expected_columns VALUES
('businesses','id','uuid',true,'gen_random_uuid()'),
('businesses','display_name','text',true,NULL),
('businesses','public_catalog_slug','text',true,'(''catalog-''::text || (gen_random_uuid())::text)'),
('businesses','contact_email','text',false,NULL),
('businesses','contact_phone','text',false,NULL),
('businesses','postal_address','text',false,NULL),
('businesses','country_code','text',true,'''IN'''),
('businesses','currency_code','text',true,'''INR'''),
('businesses','currency_exponent','smallint',true,'2'),
('businesses','state_code','text',false,NULL),
('businesses','gst_registered','boolean',false,NULL),
('businesses','gstin','text',false,NULL),
('businesses','logo_asset_key','text',false,NULL),
('businesses','logo_sha256','bytea',false,NULL),
('businesses','signature_asset_key','text',false,NULL),
('businesses','signature_sha256','bytea',false,NULL),
('businesses','bank_name','text',false,NULL),
('businesses','bank_account_name','text',false,NULL),
('businesses','bank_account_number','text',false,NULL),
('businesses','bank_ifsc','text',false,NULL),
('businesses','upi_id','text',false,NULL),
('businesses','payment_instructions','text',false,NULL),
('businesses','default_terms','text',false,NULL),
('businesses','time_zone','text',true,'''Asia/Kolkata'''),
('businesses','created_by','uuid',true,NULL),
('businesses','created_at','timestamptz',true,'clock_timestamp()'),
('businesses','updated_at','timestamptz',true,'clock_timestamp()'),
('business_memberships','business_id','uuid',true,NULL),
('business_memberships','user_id','uuid',true,NULL),
('business_memberships','role','text',true,'''owner'''),
('business_memberships','disabled_at','timestamptz',false,NULL),
('business_memberships','created_at','timestamptz',true,'clock_timestamp()'),
('customers','id','uuid',true,'gen_random_uuid()'),
('customers','business_id','uuid',true,NULL),
('customers','display_name','text',true,NULL),
('customers','contact_name','text',false,NULL),
('customers','email','text',false,NULL),
('customers','phone','text',false,NULL),
('customers','billing_address','text',false,NULL),
('customers','state_code','text',false,NULL),
('customers','gstin_applicable','boolean',false,NULL),
('customers','gstin','text',false,NULL),
('customers','private_note','text',false,NULL),
('customers','archived_at','timestamptz',false,NULL),
('customers','archived_by','uuid',false,NULL),
('customers','created_by','uuid',true,NULL),
('customers','created_at','timestamptz',true,'clock_timestamp()'),
('customers','updated_at','timestamptz',true,'clock_timestamp()'),
('catalog_items','id','uuid',true,'gen_random_uuid()'),
('catalog_items','business_id','uuid',true,NULL),
('catalog_items','kind','text',true,NULL),
('catalog_items','is_published','boolean',true,'false'),
('catalog_items','name','text',true,NULL),
('catalog_items','description','text',false,NULL),
('catalog_items','unit_label','text',false,NULL),
('catalog_items','default_unit_price_minor','bigint',false,NULL),
('catalog_items','default_gst_category','text',true,NULL),
('catalog_items','default_gst_rate','numeric',false,NULL),
('catalog_items','hsn_sac','text',false,NULL),
('catalog_items','archived_at','timestamptz',false,NULL),
('catalog_items','archived_by','uuid',false,NULL),
('catalog_items','created_by','uuid',true,NULL),
('catalog_items','created_at','timestamptz',true,'clock_timestamp()'),
('catalog_items','updated_at','timestamptz',true,'clock_timestamp()'),
('quotations','id','uuid',true,'gen_random_uuid()'),
('quotations','business_id','uuid',true,NULL),
('quotations','customer_id','uuid',true,NULL),
('quotations','reference','text',true,NULL),
('quotations','current_version_id','uuid',true,NULL),
('quotations','created_by','uuid',true,NULL),
('quotations','created_at','timestamptz',true,'clock_timestamp()'),
('quotations','updated_at','timestamptz',true,'clock_timestamp()'),
('quotation_versions','id','uuid',true,'gen_random_uuid()'),
('quotation_versions','business_id','uuid',true,NULL),
('quotation_versions','quotation_id','uuid',true,NULL),
('quotation_versions','version_number','integer',true,NULL),
('quotation_versions','previous_version_id','uuid',false,NULL),
('quotation_versions','state','text',true,'''draft'''),
('quotation_versions','edit_sequence','integer',true,'0'),
('quotation_versions','valid_until','date',false,NULL),
('quotation_versions','response_deadline_at','timestamptz',false,NULL),
('quotation_versions','created_by','uuid',true,NULL),
('quotation_versions','created_at','timestamptz',true,'clock_timestamp()'),
('quotation_versions','edited_at','timestamptz',true,'clock_timestamp()'),
('quotation_versions','shared_by','uuid',false,NULL),
('quotation_versions','shared_at','timestamptz',false,NULL),
('quotation_versions','superseded_by','uuid',false,NULL),
('quotation_versions','superseded_at','timestamptz',false,NULL),
('quotation_versions','seller_display_name','text',false,NULL),
('quotation_versions','seller_contact_email','text',false,NULL),
('quotation_versions','seller_contact_phone','text',false,NULL),
('quotation_versions','seller_postal_address','text',false,NULL),
('quotation_versions','seller_country_code','text',false,NULL),
('quotation_versions','seller_state_code','text',false,NULL),
('quotation_versions','seller_gst_registered','boolean',false,NULL),
('quotation_versions','seller_gstin','text',false,NULL),
('quotation_versions','seller_logo_asset_key','text',false,NULL),
('quotation_versions','seller_logo_sha256','bytea',false,NULL),
('quotation_versions','seller_signature_asset_key','text',false,NULL),
('quotation_versions','seller_signature_sha256','bytea',false,NULL),
('quotation_versions','buyer_display_name','text',false,NULL),
('quotation_versions','buyer_contact_name','text',false,NULL),
('quotation_versions','buyer_email','text',false,NULL),
('quotation_versions','buyer_phone','text',false,NULL),
('quotation_versions','buyer_billing_address','text',false,NULL),
('quotation_versions','buyer_state_code','text',false,NULL),
('quotation_versions','buyer_gstin_applicable','boolean',false,NULL),
('quotation_versions','buyer_gstin','text',false,NULL),
('quotation_versions','currency_code','text',false,NULL),
('quotation_versions','currency_exponent','smallint',false,NULL),
('quotation_versions','quantity_scale','smallint',false,NULL),
('quotation_versions','calculation_rule_code','text',false,NULL),
('quotation_versions','price_tax_mode','text',false,NULL),
('quotation_versions','gst_auto_treatment','text',false,NULL),
('quotation_versions','gst_treatment_override','text',false,NULL),
('quotation_versions','gst_treatment','text',false,NULL),
('quotation_versions','document_time_zone','text',false,NULL),
('quotation_versions','place_of_supply_applicable','boolean',false,NULL),
('quotation_versions','place_of_supply_state_code','text',false,NULL),
('quotation_versions','place_of_supply_text','text',false,NULL),
('quotation_versions','reverse_charge_applies','boolean',false,NULL),
('quotation_versions','subtotal_minor','bigint',false,NULL),
('quotation_versions','taxable_subtotal_minor','bigint',false,NULL),
('quotation_versions','cgst_total_minor','bigint',false,NULL),
('quotation_versions','sgst_total_minor','bigint',false,NULL),
('quotation_versions','igst_total_minor','bigint',false,NULL),
('quotation_versions','gst_total_minor','bigint',false,NULL),
('quotation_versions','total_minor','bigint',false,NULL),
('quotation_versions','seller_bank_name','text',false,NULL),
('quotation_versions','seller_bank_account_name','text',false,NULL),
('quotation_versions','seller_bank_account_number','text',false,NULL),
('quotation_versions','seller_bank_ifsc','text',false,NULL),
('quotation_versions','seller_upi_id','text',false,NULL),
('quotation_versions','payment_instructions','text',false,NULL),
('quotation_versions','terms','text',false,NULL),
('quotation_items','id','uuid',true,'gen_random_uuid()'),
('quotation_items','business_id','uuid',true,NULL),
('quotation_items','version_id','uuid',true,NULL),
('quotation_items','source_catalog_item_id','uuid',false,NULL),
('quotation_items','position','integer',true,NULL),
('quotation_items','description','text',true,NULL),
('quotation_items','unit_label','text',true,NULL),
('quotation_items','hsn_sac','text',false,NULL),
('quotation_items','quantity','numeric(18,6)',true,NULL),
('quotation_items','unit_price_minor','bigint',true,NULL),
('quotation_items','line_subtotal_minor','bigint',true,NULL),
('quotation_items','gst_category','text',true,NULL),
('quotation_items','gst_treatment','text',true,NULL),
('quotation_items','gst_rate','numeric',false,NULL),
('quotation_items','taxable_amount_minor','bigint',true,NULL),
('quotation_items','cgst_rate','numeric',false,NULL),
('quotation_items','cgst_amount_minor','bigint',true,NULL),
('quotation_items','sgst_rate','numeric',false,NULL),
('quotation_items','sgst_amount_minor','bigint',true,NULL),
('quotation_items','igst_rate','numeric',false,NULL),
('quotation_items','igst_amount_minor','bigint',true,NULL),
('quotation_items','line_total_minor','bigint',true,NULL),
('quotation_public_links','id','uuid',true,'gen_random_uuid()'),
('quotation_public_links','business_id','uuid',true,NULL),
('quotation_public_links','quotation_id','uuid',true,NULL),
('quotation_public_links','version_id','uuid',true,NULL),
('quotation_public_links','token_hash','bytea',true,NULL),
('quotation_public_links','creation_request_key','uuid',true,NULL),
('quotation_public_links','access_expires_at','timestamptz',false,NULL),
('quotation_public_links','created_by','uuid',true,NULL),
('quotation_public_links','created_at','timestamptz',true,'clock_timestamp()'),
('quotation_public_links','revoked_by','uuid',false,NULL),
('quotation_public_links','revoked_at','timestamptz',false,NULL),
('quotation_public_links','revocation_reason','text',false,NULL),
('quotation_responses','id','uuid',true,'gen_random_uuid()'),
('quotation_responses','business_id','uuid',true,NULL),
('quotation_responses','quotation_id','uuid',true,NULL),
('quotation_responses','version_id','uuid',true,NULL),
('quotation_responses','public_link_id','uuid',true,NULL),
('quotation_responses','kind','text',true,NULL),
('quotation_responses','customer_note','text',false,NULL),
('quotation_responses','respondent_name','text',false,NULL),
('quotation_responses','responded_at','timestamptz',true,'clock_timestamp()'),
('invoices','id','uuid',true,'gen_random_uuid()'),
('invoices','business_id','uuid',true,NULL),
('invoices','quotation_id','uuid',true,NULL),
('invoices','customer_id','uuid',true,NULL),
('invoices','source_version_id','uuid',true,NULL),
('invoices','approved_response_id','uuid',true,NULL),
('invoices','numbering_period','text',true,NULL),
('invoices','sequence_number','bigint',true,NULL),
('invoices','reference','text',true,NULL),
('invoices','issued_at','timestamptz',true,NULL),
('invoices','invoice_date','date',true,NULL),
('invoices','due_on','date',false,NULL),
('invoices','created_by','uuid',true,NULL),
('invoices','seller_display_name','text',true,NULL),
('invoices','seller_contact_email','text',false,NULL),
('invoices','seller_contact_phone','text',false,NULL),
('invoices','seller_postal_address','text',true,NULL),
('invoices','seller_country_code','text',true,NULL),
('invoices','seller_state_code','text',true,NULL),
('invoices','seller_gst_registered','boolean',true,NULL),
('invoices','seller_gstin','text',false,NULL),
('invoices','seller_logo_asset_key','text',false,NULL),
('invoices','seller_logo_sha256','bytea',false,NULL),
('invoices','seller_signature_asset_key','text',false,NULL),
('invoices','seller_signature_sha256','bytea',false,NULL),
('invoices','buyer_display_name','text',true,NULL),
('invoices','buyer_contact_name','text',false,NULL),
('invoices','buyer_email','text',false,NULL),
('invoices','buyer_phone','text',false,NULL),
('invoices','buyer_billing_address','text',true,NULL),
('invoices','buyer_state_code','text',true,NULL),
('invoices','buyer_gstin_applicable','boolean',true,NULL),
('invoices','buyer_gstin','text',false,NULL),
('invoices','currency_code','text',true,NULL),
('invoices','currency_exponent','smallint',true,NULL),
('invoices','quantity_scale','smallint',true,NULL),
('invoices','calculation_rule_code','text',true,NULL),
('invoices','price_tax_mode','text',true,NULL),
('invoices','gst_auto_treatment','text',true,NULL),
('invoices','gst_treatment_override','text',false,NULL),
('invoices','gst_treatment','text',true,NULL),
('invoices','document_time_zone','text',true,NULL),
('invoices','place_of_supply_applicable','boolean',true,NULL),
('invoices','place_of_supply_state_code','text',false,NULL),
('invoices','place_of_supply_text','text',false,NULL),
('invoices','reverse_charge_applies','boolean',true,NULL),
('invoices','subtotal_minor','bigint',true,NULL),
('invoices','taxable_subtotal_minor','bigint',true,NULL),
('invoices','cgst_total_minor','bigint',true,NULL),
('invoices','sgst_total_minor','bigint',true,NULL),
('invoices','igst_total_minor','bigint',true,NULL),
('invoices','gst_total_minor','bigint',true,NULL),
('invoices','total_minor','bigint',true,NULL),
('invoices','seller_bank_name','text',false,NULL),
('invoices','seller_bank_account_name','text',false,NULL),
('invoices','seller_bank_account_number','text',false,NULL),
('invoices','seller_bank_ifsc','text',false,NULL),
('invoices','seller_upi_id','text',false,NULL),
('invoices','payment_instructions','text',false,NULL),
('invoices','terms','text',false,NULL),
('invoice_items','id','uuid',true,'gen_random_uuid()'),
('invoice_items','business_id','uuid',true,NULL),
('invoice_items','invoice_id','uuid',true,NULL),
('invoice_items','source_version_id','uuid',true,NULL),
('invoice_items','source_quotation_item_id','uuid',true,NULL),
('invoice_items','position','integer',true,NULL),
('invoice_items','description','text',true,NULL),
('invoice_items','unit_label','text',true,NULL),
('invoice_items','hsn_sac','text',false,NULL),
('invoice_items','quantity','numeric(18,6)',true,NULL),
('invoice_items','unit_price_minor','bigint',true,NULL),
('invoice_items','line_subtotal_minor','bigint',true,NULL),
('invoice_items','gst_category','text',true,NULL),
('invoice_items','gst_treatment','text',true,NULL),
('invoice_items','gst_rate','numeric',false,NULL),
('invoice_items','taxable_amount_minor','bigint',true,NULL),
('invoice_items','cgst_rate','numeric',false,NULL),
('invoice_items','cgst_amount_minor','bigint',true,NULL),
('invoice_items','sgst_rate','numeric',false,NULL),
('invoice_items','sgst_amount_minor','bigint',true,NULL),
('invoice_items','igst_rate','numeric',false,NULL),
('invoice_items','igst_amount_minor','bigint',true,NULL),
('invoice_items','line_total_minor','bigint',true,NULL),
('payments','id','uuid',true,'gen_random_uuid()'),
('payments','business_id','uuid',true,NULL),
('payments','invoice_id','uuid',true,NULL),
('payments','amount_minor','bigint',true,NULL),
('payments','currency_code','text',true,NULL),
('payments','currency_exponent','smallint',true,NULL),
('payments','received_at','timestamptz',true,NULL),
('payments','method','text',true,NULL),
('payments','external_reference','text',false,NULL),
('payments','request_key','uuid',true,NULL),
('payments','replaces_payment_id','uuid',false,NULL),
('payments','created_by','uuid',true,NULL),
('payments','recorded_at','timestamptz',true,'clock_timestamp()'),
('payment_reversals','id','uuid',true,'gen_random_uuid()'),
('payment_reversals','business_id','uuid',true,NULL),
('payment_reversals','invoice_id','uuid',true,NULL),
('payment_reversals','payment_id','uuid',true,NULL),
('payment_reversals','reason','text',true,NULL),
('payment_reversals','reversed_by','uuid',true,NULL),
('payment_reversals','reversed_at','timestamptz',true,'clock_timestamp()'),
('receipts','id','uuid',true,'gen_random_uuid()'),
('receipts','business_id','uuid',true,NULL),
('receipts','invoice_id','uuid',true,NULL),
('receipts','payment_id','uuid',true,NULL),
('receipts','reference','text',true,NULL),
('receipts','amount_minor','bigint',true,NULL),
('receipts','currency_code','text',true,NULL),
('receipts','currency_exponent','smallint',true,NULL),
('receipts','replaces_receipt_id','uuid',false,NULL),
('receipts','issued_by','uuid',true,NULL),
('receipts','issued_at','timestamptz',true,'clock_timestamp()'),
('invoice_public_links','id','uuid',true,'gen_random_uuid()'),
('invoice_public_links','business_id','uuid',true,NULL),
('invoice_public_links','invoice_id','uuid',true,NULL),
('invoice_public_links','token_hash','bytea',true,NULL),
('invoice_public_links','creation_request_key','uuid',true,NULL),
('invoice_public_links','access_expires_at','timestamptz',false,NULL),
('invoice_public_links','created_by','uuid',true,NULL),
('invoice_public_links','created_at','timestamptz',true,'clock_timestamp()'),
('invoice_public_links','revoked_by','uuid',false,NULL),
('invoice_public_links','revoked_at','timestamptz',false,NULL),
('invoice_public_links','revocation_reason','text',false,NULL),
('invoice_number_sequences','business_id','uuid',true,NULL),
('invoice_number_sequences','period_key','text',true,NULL),
('invoice_number_sequences','starts_on','date',true,NULL),
('invoice_number_sequences','ends_before','date',true,NULL),
('invoice_number_sequences','prefix','text',true,''''''),
('invoice_number_sequences','format_template','text',true,NULL),
('invoice_number_sequences','minimum_digits','smallint',true,'1'),
('invoice_number_sequences','starting_number','bigint',true,NULL),
('invoice_number_sequences','last_issued_number','bigint',false,NULL),
('invoice_number_sequences','created_by','uuid',true,NULL),
('invoice_number_sequences','created_at','timestamptz',true,'clock_timestamp()'),
('invoice_number_sequences','updated_at','timestamptz',true,'clock_timestamp()'),
('gst_rate_options','rate','numeric',true,NULL),
('gst_rate_options','selectable','boolean',true,'true');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM expected_columns e LEFT JOIN pg_namespace ns ON ns.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=ns.oid AND c.relname=e.table_name
 LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND NOT a.attisdropped
 WHERE a.attname IS NULL OR format_type(a.atttypid,a.atttypmod)<>CASE WHEN e.data_type='timestamptz' THEN 'timestamp with time zone' ELSE e.data_type END OR a.attnotnull<>e.not_null
), 'Every approved field, type and nullability exists');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM expected_columns e
 JOIN pg_attribute a ON a.attrelid=('public.'||e.table_name)::regclass AND a.attname=e.column_name
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE pg_get_expr(d.adbin,d.adrelid) IS DISTINCT FROM
   CASE WHEN e.table_name='businesses' AND e.column_name='public_catalog_slug' THEN e.default_expr
     WHEN e.data_type='text' AND e.default_expr IS NOT NULL THEN e.default_expr||'::text' ELSE e.default_expr END
), 'Every approved default, including absence of a default, matches');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND c.relname IN (SELECT table_name FROM expected_columns)
 AND a.attnum>0 AND NOT a.attisdropped
 AND NOT EXISTS(SELECT FROM expected_columns e WHERE e.table_name=c.relname AND e.column_name=a.attname)
), 'No unspecified application columns');
SELECT pg_temp.assert_ok((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (SELECT table_name FROM expected_columns) AND c.relkind='r')=17, '17 application tables');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM information_schema.columns WHERE table_schema='public' AND column_name LIKE '%\_minor' ESCAPE '\' AND data_type<>'bigint'
), 'Every monetary amount is bigint integer paise');
SELECT pg_temp.assert_ok((SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public' AND t.relname IN (SELECT table_name FROM expected_columns) AND c.contype='f')=55, 'All 55 approved foreign keys');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public' AND t.relname IN (SELECT table_name FROM expected_columns) AND c.contype='f'
 AND (c.confdeltype<>'a' OR c.confupdtype<>'a')
), 'Foreign keys use NO ACTION, no history-erasing cascades');
SELECT pg_temp.assert_ok((SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public' AND t.relname IN (SELECT table_name FROM expected_columns) AND c.contype='f' AND c.condeferrable AND c.condeferred)=2, 'Exactly the two approved FK cycles are initially deferred');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM pg_constraint c WHERE c.contype='f' AND c.confrelid='public.gst_rate_options'::regclass
), 'Historical rates have no FK to selectable configuration');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (SELECT table_name FROM expected_columns)
 AND NOT(c.relrowsecurity AND c.relforcerowsecurity)
), 'ENABLE and FORCE RLS on every application table');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM pg_roles WHERE rolname IN ('webameen_executor','webameen_quote_broker','webameen_invoice_broker','webameen_catalog_reader')
 AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)
), 'Internal execution roles cannot log in or bypass RLS');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM pg_auth_members am JOIN pg_roles parent ON parent.oid=am.roleid JOIN pg_roles child ON child.oid=am.member
 WHERE parent.rolname IN ('webameen_executor','webameen_quote_broker','webameen_invoice_broker','webameen_catalog_reader')
 AND child.rolname IN ('authenticated','anon','authenticator','service_role')
), 'No runtime login inherits internal execution identities');
SELECT pg_temp.assert_ok(NOT EXISTS(
 SELECT FROM expected_columns e WHERE e.table_name IN ('quotation_versions','invoices','quotation_items','invoice_items')
 AND e.column_name IN ('seller_display_name','seller_contact_email','seller_contact_phone','seller_postal_address','seller_country_code','seller_state_code','seller_gst_registered','seller_gstin','seller_logo_asset_key','seller_logo_sha256','seller_signature_asset_key','seller_signature_sha256','buyer_display_name','buyer_contact_name','buyer_email','buyer_phone','buyer_billing_address','buyer_state_code','buyer_gstin_applicable','buyer_gstin','currency_code','currency_exponent','quantity_scale','calculation_rule_code','price_tax_mode','gst_auto_treatment','gst_treatment_override','gst_treatment','document_time_zone','place_of_supply_applicable','place_of_supply_state_code','place_of_supply_text','reverse_charge_applies','subtotal_minor','taxable_subtotal_minor','cgst_total_minor','sgst_total_minor','igst_total_minor','gst_total_minor','total_minor','seller_bank_name','seller_bank_account_name','seller_bank_account_number','seller_bank_ifsc','seller_upi_id','payment_instructions','terms','description','unit_label','hsn_sac','quantity','unit_price_minor','line_subtotal_minor','gst_category','gst_rate','taxable_amount_minor','cgst_rate','cgst_amount_minor','sgst_rate','sgst_amount_minor','igst_rate','igst_amount_minor','line_total_minor')
 AND EXISTS (SELECT FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=('public.'||e.table_name)::regclass AND a.attname=e.column_name)
), 'Snapshot content columns have no defaults');
SELECT pg_temp.assert_ok(private.validate_quantity(1.234)=1.234, 'Three decimal quantity accepted');
SELECT pg_temp.expect_error('SELECT private.validate_quantity(1.2345)', '23514', 'Fourth decimal rejected before coercion');
SELECT pg_temp.expect_error('SELECT private.validate_quantity(1.23400001)', '23514', 'Hidden excess precision rejected before numeric(18,6) coercion');
SELECT pg_temp.expect_error('SELECT private.validate_quantity(''NaN'')', '23514', 'NaN quantity rejected');
SELECT pg_temp.expect_error('INSERT INTO public.gst_rate_options(rate) VALUES (101)', '23514', 'Technical rate upper bound');
SELECT pg_temp.expect_error('INSERT INTO public.gst_rate_options(rate) VALUES (''NaN'')', '23514', 'NaN rate rejected');
INSERT INTO public.gst_rate_options(rate) VALUES (7.125);
SELECT pg_temp.assert_ok(EXISTS(SELECT FROM public.gst_rate_options WHERE rate=7.125), 'Non-enumerated exact decimal rate accepted without migration');

-- Provider identities are test fixtures only; no auth schema changes.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000001','foundation-a@example.invalid',clock_timestamp()),
 ('10000000-0000-0000-0000-000000000002','foundation-b@example.invalid',clock_timestamp());
INSERT INTO public.businesses(id,display_name,created_by) VALUES
 ('20000000-0000-0000-0000-000000000001','Business A','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','Business B','10000000-0000-0000-0000-000000000002');
INSERT INTO public.business_memberships(business_id,user_id) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
INSERT INTO public.customers(id,business_id,display_name,state_code,gstin,created_by) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Customer A','29','27ABCDE1234F1Z5','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Customer B','27',NULL,'10000000-0000-0000-0000-000000000002');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.assert_ok(EXISTS(SELECT FROM public.customers WHERE state_code='29' AND gstin LIKE '27%'), 'GSTIN prefix mismatch is not a database rejection');

CREATE TEMP TABLE fixture_ids(label text PRIMARY KEY, value uuid);
CREATE FUNCTION pg_temp.make_approved_quote(b uuid, actor uuid, customer uuid) RETURNS uuid
LANGUAGE plpgsql AS $fixture$
DECLARE q uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.quotations(id,business_id,customer_id,reference,current_version_id,created_by)
 VALUES(q,b,customer,'Q-'||q,v,actor);
 INSERT INTO public.quotation_versions(id,business_id,quotation_id,version_number,created_by,
  seller_display_name,seller_postal_address,seller_country_code,seller_state_code,seller_gst_registered,seller_gstin,
  seller_logo_asset_key,seller_logo_sha256,seller_signature_asset_key,seller_signature_sha256,
  buyer_display_name,buyer_billing_address,buyer_state_code,buyer_gstin_applicable,
  currency_code,currency_exponent,quantity_scale,calculation_rule_code,price_tax_mode,
  gst_auto_treatment,gst_treatment,document_time_zone,place_of_supply_applicable,place_of_supply_state_code,
  reverse_charge_applies,subtotal_minor,taxable_subtotal_minor,cgst_total_minor,sgst_total_minor,igst_total_minor,gst_total_minor,total_minor,
  seller_bank_name,seller_bank_account_name,seller_bank_account_number,seller_bank_ifsc,seller_upi_id,payment_instructions,terms)
 VALUES(v,b,q,1,actor,'Frozen Seller','Frozen Seller Address','IN','27',true,'27ABCDE1234F1Z5',
  b||'/logo-v1',decode(repeat('11',32),'hex'),b||'/signature-v1',decode(repeat('22',32),'hex'),
  'Frozen Buyer','Frozen Buyer Address','27',false,
  'INR',2,3,'in-gst-exclusive-line-paise-half-up-v1','exclusive','cgst_sgst','cgst_sgst','Asia/Kolkata',true,'27',
  true,10000,10000,356,356,0,712,10712,
  'Frozen Bank','Frozen Account Name','001234','IFSC TEXT','frozen@upi','Frozen Instructions','Frozen Terms');
 INSERT INTO public.quotation_items(business_id,version_id,position,description,unit_label,hsn_sac,quantity,
  unit_price_minor,line_subtotal_minor,gst_category,gst_treatment,gst_rate,taxable_amount_minor,
  cgst_rate,cgst_amount_minor,sgst_rate,sgst_amount_minor,igst_rate,igst_amount_minor,line_total_minor)
 VALUES(b,v,1,'Frozen Line','custom package','0012',1,10000,10000,'taxable','cgst_sgst',7.125,10000,3.5625,356,3.5625,356,NULL,0,10712);
 UPDATE public.quotation_versions SET seller_contact_email='frozen-seller@example.invalid',
  seller_contact_phone='111111',buyer_contact_name='Frozen Contact',buyer_email='frozen-buyer@example.invalid',
  buyer_phone=NULL,buyer_gstin_applicable=true,buyer_gstin='27FGHIJ5678K1Z2',
  gst_treatment_override='cgst_sgst',place_of_supply_text='Frozen Supply Location',
  valid_until=current_date+1,response_deadline_at=((current_date+2)::timestamp AT TIME ZONE 'Asia/Kolkata') WHERE id=v;
 UPDATE public.quotation_versions SET state='shared',shared_by=actor,shared_at=clock_timestamp() WHERE id=v;
 INSERT INTO public.quotation_public_links(id,business_id,quotation_id,version_id,token_hash,creation_request_key,created_by)
 VALUES(token,b,q,v,decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex'),gen_random_uuid(),actor);
 INSERT INTO public.quotation_responses(business_id,quotation_id,version_id,public_link_id,kind)
 VALUES(b,q,v,token,'approved');
 UPDATE public.quotation_versions SET state='approved' WHERE id=v;
 RETURN q;
END
$fixture$;
CREATE FUNCTION pg_temp.issue_invoice(q uuid) RETURNS uuid LANGUAGE plpgsql AS $fixture$
DECLARE source public.quotation_versions; parent public.quotations; p public.invoice_number_sequences;
        invoice_id uuid:=gen_random_uuid(); issue_time timestamptz; response_id uuid; number bigint;
BEGIN
 SELECT * INTO parent FROM public.quotations WHERE id=q;
 SELECT * INTO source FROM public.quotation_versions WHERE id=parent.current_version_id;
 SELECT id INTO response_id FROM public.quotation_responses WHERE version_id=source.id;
 SELECT * INTO p FROM public.invoice_number_sequences WHERE business_id=parent.business_id AND period_key='test-period' FOR UPDATE;
 number:=coalesce(p.last_issued_number+1,p.starting_number);
 UPDATE public.invoice_number_sequences SET last_issued_number=number,updated_at=clock_timestamp()
 WHERE business_id=p.business_id AND period_key=p.period_key;
 issue_time:=clock_timestamp();
 INSERT INTO public.invoices(id,business_id,quotation_id,customer_id,source_version_id,approved_response_id,
 numbering_period,sequence_number,reference,issued_at,invoice_date,created_by,seller_display_name,seller_contact_email,seller_contact_phone,seller_postal_address,seller_country_code,seller_state_code,seller_gst_registered,seller_gstin,seller_logo_asset_key,seller_logo_sha256,seller_signature_asset_key,seller_signature_sha256,buyer_display_name,buyer_contact_name,buyer_email,buyer_phone,buyer_billing_address,buyer_state_code,buyer_gstin_applicable,buyer_gstin,currency_code,currency_exponent,quantity_scale,calculation_rule_code,price_tax_mode,gst_auto_treatment,gst_treatment_override,gst_treatment,document_time_zone,place_of_supply_applicable,place_of_supply_state_code,place_of_supply_text,reverse_charge_applies,subtotal_minor,taxable_subtotal_minor,cgst_total_minor,sgst_total_minor,igst_total_minor,gst_total_minor,total_minor,seller_bank_name,seller_bank_account_name,seller_bank_account_number,seller_bank_ifsc,seller_upi_id,payment_instructions,terms)
 VALUES(invoice_id,parent.business_id,q,parent.customer_id,source.id,response_id,p.period_key,number,
 'INV-'||lpad(number::text,greatest(p.minimum_digits,length(number::text)),'0'),issue_time,
 (issue_time AT TIME ZONE source.document_time_zone)::date,parent.created_by,source.seller_display_name,source.seller_contact_email,source.seller_contact_phone,source.seller_postal_address,source.seller_country_code,source.seller_state_code,source.seller_gst_registered,source.seller_gstin,source.seller_logo_asset_key,source.seller_logo_sha256,source.seller_signature_asset_key,source.seller_signature_sha256,source.buyer_display_name,source.buyer_contact_name,source.buyer_email,source.buyer_phone,source.buyer_billing_address,source.buyer_state_code,source.buyer_gstin_applicable,source.buyer_gstin,source.currency_code,source.currency_exponent,source.quantity_scale,source.calculation_rule_code,source.price_tax_mode,source.gst_auto_treatment,source.gst_treatment_override,source.gst_treatment,source.document_time_zone,source.place_of_supply_applicable,source.place_of_supply_state_code,source.place_of_supply_text,source.reverse_charge_applies,source.subtotal_minor,source.taxable_subtotal_minor,source.cgst_total_minor,source.sgst_total_minor,source.igst_total_minor,source.gst_total_minor,source.total_minor,source.seller_bank_name,source.seller_bank_account_name,source.seller_bank_account_number,source.seller_bank_ifsc,source.seller_upi_id,source.payment_instructions,source.terms);
 INSERT INTO public.invoice_items(business_id,invoice_id,source_version_id,source_quotation_item_id,position,description,unit_label,hsn_sac,quantity,unit_price_minor,line_subtotal_minor,gst_category,gst_treatment,gst_rate,taxable_amount_minor,cgst_rate,cgst_amount_minor,sgst_rate,sgst_amount_minor,igst_rate,igst_amount_minor,line_total_minor)
 SELECT business_id,invoice_id,version_id,id,position,description,unit_label,hsn_sac,quantity,unit_price_minor,line_subtotal_minor,gst_category,gst_treatment,gst_rate,taxable_amount_minor,cgst_rate,cgst_amount_minor,sgst_rate,sgst_amount_minor,igst_rate,igst_amount_minor,line_total_minor FROM public.quotation_items
 WHERE business_id=parent.business_id AND version_id=source.id;
 RETURN invoice_id;
END
$fixture$;
INSERT INTO public.invoice_number_sequences(business_id,period_key,starts_on,ends_before,prefix,format_template,minimum_digits,starting_number,created_by)
SELECT id,'test-period',(current_date-10),(current_date+365),'INV','{prefix}-{number}',4,100,created_by FROM public.businesses;
INSERT INTO fixture_ids VALUES
 ('q1',pg_temp.make_approved_quote('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')),
 ('q2',pg_temp.make_approved_quote('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')),
 ('qb',pg_temp.make_approved_quote('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002'));
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
UPDATE public.gst_rate_options SET selectable=false WHERE rate=7.125;
DELETE FROM public.gst_rate_options WHERE rate=7.125;
UPDATE public.businesses SET display_name='Changed Master Name';
UPDATE public.customers SET display_name='Changed Customer Name';
INSERT INTO fixture_ids VALUES
 ('i1',pg_temp.issue_invoice((SELECT value FROM fixture_ids WHERE label='q1'))),
 ('i2',pg_temp.issue_invoice((SELECT value FROM fixture_ids WHERE label='q2'))),
 ('ib',pg_temp.issue_invoice((SELECT value FROM fixture_ids WHERE label='qb')));
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.invoices)=3, 'Approved quotes convert after rate removal');
SELECT pg_temp.assert_ok((SELECT array_agg(sequence_number ORDER BY sequence_number) FROM public.invoices
 WHERE business_id='20000000-0000-0000-0000-000000000001')=ARRAY[100,101]::bigint[], 'Invoice sequence advances within business and period');
SELECT pg_temp.assert_ok((SELECT reference FROM public.invoices WHERE id=(SELECT value FROM fixture_ids WHERE label='i1'))='INV-0100', 'Configured prefix and padding preserved');
SELECT pg_temp.assert_ok(NOT EXISTS(SELECT FROM public.invoices i JOIN public.quotation_versions q ON q.id=i.source_version_id
 WHERE ROW(i.seller_display_name,i.seller_contact_email,i.seller_contact_phone,i.seller_postal_address,i.seller_country_code,i.seller_state_code,i.seller_gst_registered,i.seller_gstin,i.seller_logo_asset_key,i.seller_logo_sha256,i.seller_signature_asset_key,i.seller_signature_sha256,i.buyer_display_name,i.buyer_contact_name,i.buyer_email,i.buyer_phone,i.buyer_billing_address,i.buyer_state_code,i.buyer_gstin_applicable,i.buyer_gstin,i.currency_code,i.currency_exponent,i.quantity_scale,i.calculation_rule_code,i.price_tax_mode,i.gst_auto_treatment,i.gst_treatment_override,i.gst_treatment,i.document_time_zone,i.place_of_supply_applicable,i.place_of_supply_state_code,i.place_of_supply_text,i.reverse_charge_applies,i.subtotal_minor,i.taxable_subtotal_minor,i.cgst_total_minor,i.sgst_total_minor,i.igst_total_minor,i.gst_total_minor,i.total_minor,i.seller_bank_name,i.seller_bank_account_name,i.seller_bank_account_number,i.seller_bank_ifsc,i.seller_upi_id,i.payment_instructions,i.terms) IS DISTINCT FROM ROW(q.seller_display_name,q.seller_contact_email,q.seller_contact_phone,q.seller_postal_address,q.seller_country_code,q.seller_state_code,q.seller_gst_registered,q.seller_gstin,q.seller_logo_asset_key,q.seller_logo_sha256,q.seller_signature_asset_key,q.seller_signature_sha256,q.buyer_display_name,q.buyer_contact_name,q.buyer_email,q.buyer_phone,q.buyer_billing_address,q.buyer_state_code,q.buyer_gstin_applicable,q.buyer_gstin,q.currency_code,q.currency_exponent,q.quantity_scale,q.calculation_rule_code,q.price_tax_mode,q.gst_auto_treatment,q.gst_treatment_override,q.gst_treatment,q.document_time_zone,q.place_of_supply_applicable,q.place_of_supply_state_code,q.place_of_supply_text,q.reverse_charge_applies,q.subtotal_minor,q.taxable_subtotal_minor,q.cgst_total_minor,q.sgst_total_minor,q.igst_total_minor,q.gst_total_minor,q.total_minor,q.seller_bank_name,q.seller_bank_account_name,q.seller_bank_account_number,q.seller_bank_ifsc,q.seller_upi_id,q.payment_instructions,q.terms)), 'Every approved document-content field copied exactly');
SELECT pg_temp.assert_ok(NOT EXISTS(SELECT FROM public.invoice_items i JOIN public.quotation_items q ON q.id=i.source_quotation_item_id
 WHERE i.position<>q.position OR ROW(i.description,i.unit_label,i.hsn_sac,i.quantity,i.unit_price_minor,i.line_subtotal_minor,i.gst_category,i.gst_treatment,i.gst_rate,i.taxable_amount_minor,i.cgst_rate,i.cgst_amount_minor,i.sgst_rate,i.sgst_amount_minor,i.igst_rate,i.igst_amount_minor,i.line_total_minor) IS DISTINCT FROM ROW(q.description,q.unit_label,q.hsn_sac,q.quantity,q.unit_price_minor,q.line_subtotal_minor,q.gst_category,q.gst_treatment,q.gst_rate,q.taxable_amount_minor,q.cgst_rate,q.cgst_amount_minor,q.sgst_rate,q.sgst_amount_minor,q.igst_rate,q.igst_amount_minor,q.line_total_minor)), 'Every source line ID, position and content field copied exactly');
SELECT pg_temp.assert_ok(NOT EXISTS(SELECT FROM public.invoices WHERE seller_display_name<>'Frozen Seller' OR buyer_display_name<>'Frozen Buyer'), 'Master edits do not rewrite snapshots');
SELECT pg_temp.expect_error('UPDATE public.invoices SET seller_display_name=''Changed''','23514','Issued invoices immutable');
SELECT pg_temp.expect_error('UPDATE public.quotation_items SET description=''Changed''','23514','Shared items immutable');
SELECT pg_temp.expect_error('UPDATE public.quotation_versions SET seller_display_name=''Changed''','23514','Shared document content immutable');
SELECT pg_temp.expect_error('UPDATE public.invoice_number_sequences SET prefix=''Other''','23514','Used period configuration immutable');
SELECT pg_temp.expect_error('UPDATE public.invoice_number_sequences SET last_issued_number=last_issued_number+2','23514','Number allocation cannot skip');
SELECT pg_temp.expect_error('UPDATE public.invoice_number_sequences SET last_issued_number=NULL','23514','Number allocation cannot rewind');


CREATE FUNCTION pg_temp.record_payment(i uuid, amount bigint, predecessor uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $fixture$
DECLARE inv public.invoices; p uuid:=gen_random_uuid(); previous_receipt uuid;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id=i;
 IF predecessor IS NOT NULL THEN SELECT id INTO previous_receipt FROM public.receipts WHERE payment_id=predecessor; END IF;
 INSERT INTO public.payments(id,business_id,invoice_id,amount_minor,currency_code,currency_exponent,received_at,method,request_key,replaces_payment_id,created_by)
 VALUES(p,inv.business_id,i,amount,'INR',2,clock_timestamp(),'test transfer',gen_random_uuid(),predecessor,inv.created_by);
 INSERT INTO public.receipts(business_id,invoice_id,payment_id,reference,amount_minor,currency_code,currency_exponent,replaces_receipt_id,issued_by)
 VALUES(inv.business_id,i,p,'RCP-'||p,amount,'INR',2,previous_receipt,inv.created_by);
 RETURN p;
END
$fixture$;
INSERT INTO fixture_ids VALUES ('p1',pg_temp.record_payment((SELECT value FROM fixture_ids WHERE label='i1'),1000));
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.expect_error(
 format('SELECT pg_temp.record_payment(%L::uuid,999999)',(SELECT value FROM fixture_ids WHERE label='i1')),
 '23514','Overpayment rejected');
SELECT pg_temp.expect_error(
 format('SELECT pg_temp.record_payment(%L::uuid,0)',(SELECT value FROM fixture_ids WHERE label='i1')),
 '23514','Zero payment rejected');
SELECT pg_temp.expect_error('UPDATE public.payments SET amount_minor=999','23514','Confirmed payment cannot be edited');
INSERT INTO public.payment_reversals(business_id,invoice_id,payment_id,reason,reversed_by)
 SELECT business_id,invoice_id,id,'Recorded on wrong invoice',created_by FROM public.payments
 WHERE id=(SELECT value FROM fixture_ids WHERE label='p1');
SELECT pg_temp.expect_error(
 'INSERT INTO public.payment_reversals(business_id,invoice_id,payment_id,reason,reversed_by)
  SELECT business_id,invoice_id,id,''Duplicate reversal'',created_by FROM public.payments',
 '23505','A payment can be reversed only once');
SELECT pg_temp.expect_error(format('SELECT pg_temp.record_payment(%L::uuid,1000,%L::uuid)',
 (SELECT value FROM fixture_ids WHERE label='i2'),(SELECT value FROM fixture_ids WHERE label='p1')),
 '23514','Cross-invoice replaces_payment_id rejected');
-- Independent ordinary recording, no link to the original invoice's payment/receipt.
INSERT INTO fixture_ids VALUES ('p2',pg_temp.record_payment((SELECT value FROM fixture_ids WHERE label='i2'),1000));
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.assert_ok((SELECT replaces_payment_id IS NULL FROM public.payments
 WHERE id=(SELECT value FROM fixture_ids WHERE label='p2')), 'Wrong-invoice correction uses an independent new payment');
SELECT pg_temp.assert_ok((SELECT replaces_receipt_id IS NULL FROM public.receipts
 WHERE payment_id=(SELECT value FROM fixture_ids WHERE label='p2')), 'New ordinary receipt has no cross-invoice predecessor');
SELECT pg_temp.assert_ok((SELECT p.invoice_id<>r.invoice_id FROM public.payments p CROSS JOIN public.payment_reversals r
 WHERE p.id=(SELECT value FROM fixture_ids WHERE label='p2') AND r.payment_id=(SELECT value FROM fixture_ids WHERE label='p1')),
 'Corrected payment may target another invoice in the same business');
INSERT INTO fixture_ids VALUES ('p3',pg_temp.record_payment((SELECT value FROM fixture_ids WHERE label='i1'),500,(SELECT value FROM fixture_ids WHERE label='p1')));
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.assert_ok((SELECT replaces_payment_id=(SELECT value FROM fixture_ids WHERE label='p1')
 FROM public.payments WHERE id=(SELECT value FROM fixture_ids WHERE label='p3')), 'Same-invoice replacement remains supported');
SELECT pg_temp.expect_error('DELETE FROM public.payment_reversals','23514','Reversal history immutable');
SELECT pg_temp.expect_error('DELETE FROM public.receipts','23514','Receipt history immutable');

-- Check commit-time invariants inside an exception subtransaction, then roll it back.
CREATE FUNCTION pg_temp.expect_commit_error(statement text, label text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE actual text;
BEGIN
 BEGIN
   EXECUTE statement;
   SET CONSTRAINTS ALL IMMEDIATE;
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
 END;
 PERFORM pg_temp.assert_ok(actual='23514', label || ' (SQLSTATE ' || coalesce(actual,'no error') || ')');
END
$test$;
SELECT pg_temp.expect_commit_error(
 'INSERT INTO public.payments(business_id,invoice_id,amount_minor,currency_code,currency_exponent,received_at,method,request_key,created_by)
  SELECT business_id,id,1,''INR'',2,clock_timestamp(),''test'',gen_random_uuid(),created_by FROM public.invoices LIMIT 1',
 'Payment without its receipt cannot commit');
SELECT pg_temp.expect_commit_error(
 'UPDATE public.invoice_number_sequences SET last_issued_number=last_issued_number+1',
 'Cursor advance without its invoice cannot commit');
SELECT pg_temp.expect_error(
 'INSERT INTO public.business_memberships(business_id,user_id)
  VALUES(''20000000-0000-0000-0000-000000000001'',''10000000-0000-0000-0000-000000000002'')',
 '23505','One retained owner per business');
SELECT pg_temp.expect_error(
 'INSERT INTO public.customers(business_id,display_name,created_by)
  VALUES(''20000000-0000-0000-0000-000000000001'',''Foreign actor'',''10000000-0000-0000-0000-000000000002'')',
 '23503','Composite actor FK rejects another business owner');
SELECT pg_temp.expect_error(
 'INSERT INTO public.quotations(business_id,customer_id,reference,current_version_id,created_by)
  VALUES(''20000000-0000-0000-0000-000000000001'',''30000000-0000-0000-0000-000000000002'',''Q-wrong-customer'',gen_random_uuid(),''10000000-0000-0000-0000-000000000001'')',
 '23503','Cross-business customer FK rejected');
SELECT pg_temp.expect_error(
 'INSERT INTO public.invoice_public_links(business_id,invoice_id,token_hash,creation_request_key,created_by)
  SELECT ''20000000-0000-0000-0000-000000000002'',id,decode(repeat(''33'',32),''hex''),gen_random_uuid(),''10000000-0000-0000-0000-000000000002''
  FROM public.invoices WHERE business_id=''20000000-0000-0000-0000-000000000001'' LIMIT 1',
 '23503','Cross-business invoice token FK rejected');

-- Verify every approved unique key/index, including partial uniqueness.
SELECT pg_temp.assert_ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN (
 'u_c1','u_k1','u_q1','u_q2','u_q3','u_v1','u_v2','u_v3','u_v4','u_v5','u_l1','u_l2',
 'u_t1','u_t2','u_t3','u_t4','u_r1','u_r2','u_i1','u_i2','u_i3','u_i4','u_i5',
 'u_n1','u_n2','u_p1','u_p2','u_p3','u_x1','u_e1','u_e2','u_e3','u_e4','u_j1','u_j2','u_j3'
 ))=36,'All 36 named unique keys/indexes exist');
SELECT pg_temp.assert_ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN(
 'x_c1','x_k1','x_q1','x_q2','x_r1','x_i1','x_i2','x_i3','x_n1','x_p1','x_j1'))=11,'Exactly the 11 specified supporting indexes exist');
SELECT pg_temp.assert_ok((SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='S')=0,'Invoice numbering uses a transactional row, not PostgreSQL SEQUENCE');
SELECT pg_temp.assert_ok((SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.invoices'::regclass AND conname='u_i4')='UNIQUE (business_id, numbering_period, reference)',
 'Invoice reference uniqueness is scoped to business and period');
SELECT pg_temp.assert_ok((SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.invoices'::regclass AND conname='u_i5')='UNIQUE (business_id, numbering_period, sequence_number)',
 'Invoice allocation uniqueness is scoped to business and period');
SET CONSTRAINTS ALL IMMEDIATE;

-- JWT claims below are test-only impersonation by the local administrative test connection.
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=1,'Owner sees only their business');
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.customers)=1,'Owner sees only their customers');
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.invoices)=2,'Owner sees only their invoices');
SELECT pg_temp.assert_ok(NOT EXISTS(SELECT FROM public.businesses WHERE id='20000000-0000-0000-0000-000000000002'),'Guessed other-business ID reveals no record');
SELECT pg_temp.expect_error('INSERT INTO public.customers(business_id,display_name,created_by) VALUES(gen_random_uuid(),''Attack'',gen_random_uuid())','42501','Authenticated raw INSERT denied');
SELECT pg_temp.expect_error('UPDATE public.customers SET display_name=''Attack''','42501','Authenticated raw UPDATE denied');
SELECT pg_temp.expect_error('DELETE FROM public.customers','42501','Authenticated raw DELETE denied');
SELECT pg_temp.expect_error('TRUNCATE public.customers','42501','Authenticated TRUNCATE denied');
SELECT pg_temp.expect_error('SET ROLE webameen_executor','42501','Authenticated cannot assume executor');
RESET ROLE;
-- The migration operator can impersonate internal identities for this test.
-- Membership is temporary, never assigned to any runtime identity, and rolled back.
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE webameen_executor;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=1,'Non-bypass executor reads only the JWT owner business');
UPDATE public.customers SET display_name='Foreign edit'
 WHERE business_id='20000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_ok(NOT EXISTS(SELECT FROM public.customers
 WHERE business_id='20000000-0000-0000-0000-000000000002'),'Executor cannot read another tenant');
RESET ROLE;
SELECT pg_temp.assert_ok((SELECT display_name='Changed Customer Name' FROM public.customers
 WHERE id='30000000-0000-0000-0000-000000000002'), 'Executor cannot modify another tenant');
UPDATE public.business_memberships SET disabled_at=clock_timestamp() WHERE user_id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.business_memberships)=1,'Disabled owner can see their own membership for diagnostics');
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=0,'Disabled owner cannot read tenant records');
RESET ROLE;
SET LOCAL ROLE webameen_executor;
SELECT pg_temp.assert_ok((SELECT count(*) FROM public.businesses)=0,'Executor also denies disabled owner tenant access');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error('SELECT * FROM public.invoices','42501','Service role has no general application-table access');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM public.invoices','42501','Anonymous base-table invoice access denied');
SELECT pg_temp.expect_error('SELECT * FROM public.gst_rate_options','42501','Anonymous configuration access denied');
RESET ROLE;
-- Test-only administrative impersonation; these grants roll back with fixtures.
GRANT webameen_invoice_broker, webameen_quote_broker TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE webameen_invoice_broker;
SELECT pg_temp.expect_error('SELECT * FROM public.payments','42501','Invoice broker cannot read payments');
RESET ROLE;
SET LOCAL ROLE webameen_quote_broker;
SELECT pg_temp.expect_error('SELECT * FROM public.invoices','42501','Quote broker cannot read invoices');
RESET ROLE;
SELECT pg_temp.assert_ok(true,'Foundation checks complete; rolling back all test fixtures');
ROLLBACK;
