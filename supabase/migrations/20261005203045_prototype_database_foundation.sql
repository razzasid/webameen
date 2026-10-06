-- Webameen database foundation. Source: docs/16-prototype-database-spec.md.
-- PostgreSQL 17 / Supabase. No seed data, public RPCs, application services or UI.
-- Provider-owned auth.users, auth.uid(), anon/authenticated/service_role must exist.
-- Multirow guards are database integrity enforcement, not workflow entry points.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'webameen_executor') THEN
    CREATE ROLE webameen_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'webameen_quote_broker') THEN
    CREATE ROLE webameen_quote_broker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'webameen_invoice_broker') THEN
    CREATE ROLE webameen_invoice_broker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT FROM pg_roles WHERE rolname IN ('webameen_executor', 'webameen_quote_broker', 'webameen_invoice_broker')
      AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)
  ) THEN
    RAISE EXCEPTION 'Existing Webameen execution role has incompatible privileges';
  END IF;
END
$roles$;

-- businesses
CREATE TABLE public.businesses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  contact_email text,
  contact_phone text,
  postal_address text,
  country_code text NOT NULL DEFAULT 'IN',
  currency_code text NOT NULL DEFAULT 'INR',
  currency_exponent smallint NOT NULL DEFAULT 2,
  state_code text,
  gst_registered boolean,
  gstin text,
  logo_asset_key text,
  logo_sha256 bytea,
  signature_asset_key text,
  signature_sha256 bytea,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,
  payment_instructions text,
  default_terms text,
  time_zone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT businesses_display_name_text_ck CHECK (display_name = btrim(display_name) AND display_name <> ''),
  CONSTRAINT businesses_contact_email_text_ck CHECK (contact_email = btrim(contact_email) AND contact_email <> ''),
  CONSTRAINT businesses_contact_phone_text_ck CHECK (contact_phone = btrim(contact_phone) AND contact_phone <> ''),
  CONSTRAINT businesses_postal_address_text_ck CHECK (postal_address = btrim(postal_address) AND postal_address <> ''),
  CONSTRAINT businesses_country_code_text_ck CHECK (country_code = btrim(country_code) AND country_code <> ''),
  CONSTRAINT businesses_country_code_value_ck CHECK (country_code = 'IN'),
  CONSTRAINT businesses_currency_code_text_ck CHECK (currency_code = btrim(currency_code) AND currency_code <> ''),
  CONSTRAINT businesses_currency_code_value_ck CHECK (currency_code = 'INR'),
  CONSTRAINT businesses_currency_exponent_value_ck CHECK (currency_exponent = 2),
  CONSTRAINT businesses_state_code_text_ck CHECK (state_code = btrim(state_code) AND state_code <> ''),
  CONSTRAINT businesses_state_code_shape_ck CHECK (state_code ~ '^[0-9]{2}$'),
  CONSTRAINT businesses_gstin_text_ck CHECK (gstin = btrim(gstin) AND gstin <> ''),
  CONSTRAINT businesses_gstin_shape_ck CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$'),
  CONSTRAINT businesses_logo_asset_key_text_ck CHECK (logo_asset_key = btrim(logo_asset_key) AND logo_asset_key <> ''),
  CONSTRAINT businesses_logo_sha256_pair_ck CHECK ((logo_sha256 IS NULL) = (logo_asset_key IS NULL) AND (logo_sha256 IS NULL OR octet_length(logo_sha256) = 32)),
  CONSTRAINT businesses_signature_asset_key_text_ck CHECK (signature_asset_key = btrim(signature_asset_key) AND signature_asset_key <> ''),
  CONSTRAINT businesses_signature_sha256_pair_ck CHECK ((signature_sha256 IS NULL) = (signature_asset_key IS NULL) AND (signature_sha256 IS NULL OR octet_length(signature_sha256) = 32)),
  CONSTRAINT businesses_bank_name_text_ck CHECK (bank_name = btrim(bank_name) AND bank_name <> ''),
  CONSTRAINT businesses_bank_account_name_text_ck CHECK (bank_account_name = btrim(bank_account_name) AND bank_account_name <> ''),
  CONSTRAINT businesses_bank_account_number_text_ck CHECK (bank_account_number = btrim(bank_account_number) AND bank_account_number <> ''),
  CONSTRAINT businesses_bank_ifsc_text_ck CHECK (bank_ifsc = btrim(bank_ifsc) AND bank_ifsc <> ''),
  CONSTRAINT businesses_upi_id_text_ck CHECK (upi_id = btrim(upi_id) AND upi_id <> ''),
  CONSTRAINT businesses_payment_instructions_text_ck CHECK (payment_instructions = btrim(payment_instructions) AND payment_instructions <> ''),
  CONSTRAINT businesses_default_terms_text_ck CHECK (default_terms = btrim(default_terms) AND default_terms <> ''),
  CONSTRAINT businesses_time_zone_text_ck CHECK (time_zone = btrim(time_zone) AND time_zone <> '')
);

-- business_memberships
CREATE TABLE public.business_memberships (
  business_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (business_id, user_id),
  CONSTRAINT membership_business UNIQUE (business_id),
  CONSTRAINT membership_user UNIQUE (user_id),
  CONSTRAINT business_memberships_role_text_ck CHECK (role = btrim(role) AND role <> ''),
  CONSTRAINT business_memberships_owner_role_ck CHECK (role = 'owner')
);

-- customers
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  display_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  billing_address text,
  state_code text,
  gstin_applicable boolean,
  gstin text,
  private_note text,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT u_c1 UNIQUE (business_id, id),
  CONSTRAINT customers_display_name_text_ck CHECK (display_name = btrim(display_name) AND display_name <> ''),
  CONSTRAINT customers_contact_name_text_ck CHECK (contact_name = btrim(contact_name) AND contact_name <> ''),
  CONSTRAINT customers_email_text_ck CHECK (email = btrim(email) AND email <> ''),
  CONSTRAINT customers_phone_text_ck CHECK (phone = btrim(phone) AND phone <> ''),
  CONSTRAINT customers_billing_address_text_ck CHECK (billing_address = btrim(billing_address) AND billing_address <> ''),
  CONSTRAINT customers_state_code_text_ck CHECK (state_code = btrim(state_code) AND state_code <> ''),
  CONSTRAINT customers_state_code_shape_ck CHECK (state_code ~ '^[0-9]{2}$'),
  CONSTRAINT customers_gstin_text_ck CHECK (gstin = btrim(gstin) AND gstin <> ''),
  CONSTRAINT customers_gstin_shape_ck CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$'),
  CONSTRAINT customers_private_note_text_ck CHECK (private_note = btrim(private_note) AND private_note <> ''),
  CONSTRAINT customers_archived_by_pair_ck CHECK ((archived_by IS NULL) = (archived_at IS NULL))
);

-- catalog_items
CREATE TABLE public.catalog_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  description text,
  unit_label text,
  default_unit_price_minor bigint,
  default_gst_category text NOT NULL,
  default_gst_rate numeric,
  hsn_sac text,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT u_k1 UNIQUE (business_id, id),
  CONSTRAINT catalog_items_kind_text_ck CHECK (kind = btrim(kind) AND kind <> ''),
  CONSTRAINT catalog_items_name_text_ck CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT catalog_items_description_text_ck CHECK (description = btrim(description) AND description <> ''),
  CONSTRAINT catalog_items_unit_label_text_ck CHECK (unit_label = btrim(unit_label) AND unit_label <> ''),
  CONSTRAINT catalog_items_default_unit_price_minor_amount_ck CHECK (default_unit_price_minor >= 0),
  CONSTRAINT catalog_items_default_gst_category_text_ck CHECK (default_gst_category = btrim(default_gst_category) AND default_gst_category <> ''),
  CONSTRAINT catalog_items_default_gst_rate_range_ck CHECK (default_gst_rate BETWEEN 0 AND 100),
  CONSTRAINT catalog_items_hsn_sac_text_ck CHECK (hsn_sac = btrim(hsn_sac) AND hsn_sac <> ''),
  CONSTRAINT catalog_items_archived_by_pair_ck CHECK ((archived_by IS NULL) = (archived_at IS NULL)),
  CONSTRAINT catalog_items_kind_ck CHECK (kind IN ('product', 'service')),
  CONSTRAINT catalog_items_gst_category_ck CHECK (default_gst_category IN ('taxable', 'exempt', 'no_gst')),
  CONSTRAINT catalog_items_rate_applicability_ck CHECK ((default_gst_category = 'taxable') = (default_gst_rate IS NOT NULL))
);

-- quotations
CREATE TABLE public.quotations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  reference text NOT NULL,
  current_version_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT u_q1 UNIQUE (business_id, id),
  CONSTRAINT u_q2 UNIQUE (business_id, id, customer_id),
  CONSTRAINT u_q3 UNIQUE (business_id, reference),
  CONSTRAINT quotations_reference_text_ck CHECK (reference = btrim(reference) AND reference <> '')
);

-- quotation_versions
CREATE TABLE public.quotation_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  quotation_id uuid NOT NULL,
  version_number integer NOT NULL,
  previous_version_id uuid,
  state text NOT NULL DEFAULT 'draft',
  edit_sequence integer NOT NULL DEFAULT 0,
  valid_until date,
  response_deadline_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  edited_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  shared_by uuid,
  shared_at timestamptz,
  superseded_by uuid,
  superseded_at timestamptz,
  seller_display_name text,
  seller_contact_email text,
  seller_contact_phone text,
  seller_postal_address text,
  seller_country_code text,
  seller_state_code text,
  seller_gst_registered boolean,
  seller_gstin text,
  seller_logo_asset_key text,
  seller_logo_sha256 bytea,
  seller_signature_asset_key text,
  seller_signature_sha256 bytea,
  buyer_display_name text,
  buyer_contact_name text,
  buyer_email text,
  buyer_phone text,
  buyer_billing_address text,
  buyer_state_code text,
  buyer_gstin_applicable boolean,
  buyer_gstin text,
  currency_code text,
  currency_exponent smallint,
  quantity_scale smallint,
  calculation_rule_code text,
  price_tax_mode text,
  gst_auto_treatment text,
  gst_treatment_override text,
  gst_treatment text,
  document_time_zone text,
  place_of_supply_applicable boolean,
  place_of_supply_state_code text,
  place_of_supply_text text,
  reverse_charge_applies boolean,
  subtotal_minor bigint,
  taxable_subtotal_minor bigint,
  cgst_total_minor bigint,
  sgst_total_minor bigint,
  igst_total_minor bigint,
  gst_total_minor bigint,
  total_minor bigint,
  seller_bank_name text,
  seller_bank_account_name text,
  seller_bank_account_number text,
  seller_bank_ifsc text,
  seller_upi_id text,
  payment_instructions text,
  terms text,
  PRIMARY KEY (id),
  CONSTRAINT u_v1 UNIQUE (business_id, id),
  CONSTRAINT u_v2 UNIQUE (business_id, quotation_id, id),
  CONSTRAINT u_v3 UNIQUE (business_id, quotation_id, version_number),
  CONSTRAINT u_v4 UNIQUE (business_id, quotation_id, previous_version_id),
  CONSTRAINT quotation_versions_state_text_ck CHECK (state = btrim(state) AND state <> ''),
  CONSTRAINT quotation_versions_seller_display_name_text_ck CHECK (seller_display_name = btrim(seller_display_name) AND seller_display_name <> ''),
  CONSTRAINT quotation_versions_seller_contact_email_text_ck CHECK (seller_contact_email = btrim(seller_contact_email) AND seller_contact_email <> ''),
  CONSTRAINT quotation_versions_seller_contact_phone_text_ck CHECK (seller_contact_phone = btrim(seller_contact_phone) AND seller_contact_phone <> ''),
  CONSTRAINT quotation_versions_seller_postal_address_text_ck CHECK (seller_postal_address = btrim(seller_postal_address) AND seller_postal_address <> ''),
  CONSTRAINT quotation_versions_seller_country_code_text_ck CHECK (seller_country_code = btrim(seller_country_code) AND seller_country_code <> ''),
  CONSTRAINT quotation_versions_seller_country_code_value_ck CHECK (seller_country_code = 'IN'),
  CONSTRAINT quotation_versions_seller_state_code_text_ck CHECK (seller_state_code = btrim(seller_state_code) AND seller_state_code <> ''),
  CONSTRAINT quotation_versions_seller_state_code_shape_ck CHECK (seller_state_code ~ '^[0-9]{2}$'),
  CONSTRAINT quotation_versions_seller_gstin_text_ck CHECK (seller_gstin = btrim(seller_gstin) AND seller_gstin <> ''),
  CONSTRAINT quotation_versions_seller_gstin_shape_ck CHECK (seller_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$'),
  CONSTRAINT quotation_versions_seller_logo_asset_key_text_ck CHECK (seller_logo_asset_key = btrim(seller_logo_asset_key) AND seller_logo_asset_key <> ''),
  CONSTRAINT quotation_versions_seller_logo_sha256_pair_ck CHECK ((seller_logo_sha256 IS NULL) = (seller_logo_asset_key IS NULL) AND (seller_logo_sha256 IS NULL OR octet_length(seller_logo_sha256) = 32)),
  CONSTRAINT quotation_versions_seller_signature_asset_key_text_ck CHECK (seller_signature_asset_key = btrim(seller_signature_asset_key) AND seller_signature_asset_key <> ''),
  CONSTRAINT quotation_versions_seller_signature_sha256_pair_ck CHECK ((seller_signature_sha256 IS NULL) = (seller_signature_asset_key IS NULL) AND (seller_signature_sha256 IS NULL OR octet_length(seller_signature_sha256) = 32)),
  CONSTRAINT quotation_versions_buyer_display_name_text_ck CHECK (buyer_display_name = btrim(buyer_display_name) AND buyer_display_name <> ''),
  CONSTRAINT quotation_versions_buyer_contact_name_text_ck CHECK (buyer_contact_name = btrim(buyer_contact_name) AND buyer_contact_name <> ''),
  CONSTRAINT quotation_versions_buyer_email_text_ck CHECK (buyer_email = btrim(buyer_email) AND buyer_email <> ''),
  CONSTRAINT quotation_versions_buyer_phone_text_ck CHECK (buyer_phone = btrim(buyer_phone) AND buyer_phone <> ''),
  CONSTRAINT quotation_versions_buyer_billing_address_text_ck CHECK (buyer_billing_address = btrim(buyer_billing_address) AND buyer_billing_address <> ''),
  CONSTRAINT quotation_versions_buyer_state_code_text_ck CHECK (buyer_state_code = btrim(buyer_state_code) AND buyer_state_code <> ''),
  CONSTRAINT quotation_versions_buyer_state_code_shape_ck CHECK (buyer_state_code ~ '^[0-9]{2}$'),
  CONSTRAINT quotation_versions_buyer_gstin_text_ck CHECK (buyer_gstin = btrim(buyer_gstin) AND buyer_gstin <> ''),
  CONSTRAINT quotation_versions_buyer_gstin_shape_ck CHECK (buyer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$'),
  CONSTRAINT quotation_versions_currency_code_text_ck CHECK (currency_code = btrim(currency_code) AND currency_code <> ''),
  CONSTRAINT quotation_versions_currency_code_value_ck CHECK (currency_code = 'INR'),
  CONSTRAINT quotation_versions_currency_exponent_value_ck CHECK (currency_exponent = 2),
  CONSTRAINT quotation_versions_quantity_scale_value_ck CHECK (quantity_scale = 3),
  CONSTRAINT quotation_versions_calculation_rule_code_text_ck CHECK (calculation_rule_code = btrim(calculation_rule_code) AND calculation_rule_code <> ''),
  CONSTRAINT quotation_versions_calculation_rule_code_value_ck CHECK (calculation_rule_code = 'in-gst-exclusive-line-paise-half-up-v1'),
  CONSTRAINT quotation_versions_price_tax_mode_text_ck CHECK (price_tax_mode = btrim(price_tax_mode) AND price_tax_mode <> ''),
  CONSTRAINT quotation_versions_price_tax_mode_value_ck CHECK (price_tax_mode = 'exclusive'),
  CONSTRAINT quotation_versions_gst_auto_treatment_text_ck CHECK (gst_auto_treatment = btrim(gst_auto_treatment) AND gst_auto_treatment <> ''),
  CONSTRAINT quotation_versions_gst_treatment_override_text_ck CHECK (gst_treatment_override = btrim(gst_treatment_override) AND gst_treatment_override <> ''),
  CONSTRAINT quotation_versions_gst_treatment_text_ck CHECK (gst_treatment = btrim(gst_treatment) AND gst_treatment <> ''),
  CONSTRAINT quotation_versions_document_time_zone_text_ck CHECK (document_time_zone = btrim(document_time_zone) AND document_time_zone <> ''),
  CONSTRAINT quotation_versions_place_of_supply_state_code_text_ck CHECK (place_of_supply_state_code = btrim(place_of_supply_state_code) AND place_of_supply_state_code <> ''),
  CONSTRAINT quotation_versions_place_of_supply_state_code_shape_ck CHECK (place_of_supply_state_code ~ '^[0-9]{2}$'),
  CONSTRAINT quotation_versions_place_of_supply_text_text_ck CHECK (place_of_supply_text = btrim(place_of_supply_text) AND place_of_supply_text <> ''),
  CONSTRAINT quotation_versions_subtotal_minor_amount_ck CHECK (subtotal_minor >= 0),
  CONSTRAINT quotation_versions_taxable_subtotal_minor_amount_ck CHECK (taxable_subtotal_minor >= 0),
  CONSTRAINT quotation_versions_cgst_total_minor_amount_ck CHECK (cgst_total_minor >= 0),
  CONSTRAINT quotation_versions_sgst_total_minor_amount_ck CHECK (sgst_total_minor >= 0),
  CONSTRAINT quotation_versions_igst_total_minor_amount_ck CHECK (igst_total_minor >= 0),
  CONSTRAINT quotation_versions_gst_total_minor_amount_ck CHECK (gst_total_minor >= 0),
  CONSTRAINT quotation_versions_total_minor_amount_ck CHECK (total_minor >= 0),
  CONSTRAINT quotation_versions_seller_bank_name_text_ck CHECK (seller_bank_name = btrim(seller_bank_name) AND seller_bank_name <> ''),
  CONSTRAINT quotation_versions_seller_bank_account_name_text_ck CHECK (seller_bank_account_name = btrim(seller_bank_account_name) AND seller_bank_account_name <> ''),
  CONSTRAINT quotation_versions_seller_bank_account_number_text_ck CHECK (seller_bank_account_number = btrim(seller_bank_account_number) AND seller_bank_account_number <> ''),
  CONSTRAINT quotation_versions_seller_bank_ifsc_text_ck CHECK (seller_bank_ifsc = btrim(seller_bank_ifsc) AND seller_bank_ifsc <> ''),
  CONSTRAINT quotation_versions_seller_upi_id_text_ck CHECK (seller_upi_id = btrim(seller_upi_id) AND seller_upi_id <> ''),
  CONSTRAINT quotation_versions_payment_instructions_text_ck CHECK (payment_instructions = btrim(payment_instructions) AND payment_instructions <> ''),
  CONSTRAINT quotation_versions_terms_text_ck CHECK (terms = btrim(terms) AND terms <> ''),
  CONSTRAINT quotation_versions_shared_by_pair_ck CHECK ((shared_by IS NULL) = (shared_at IS NULL)),
  CONSTRAINT quotation_versions_superseded_by_pair_ck CHECK ((superseded_by IS NULL) = (superseded_at IS NULL)),
  CONSTRAINT quotation_versions_state_ck CHECK (state IN ('draft', 'shared', 'approved', 'change_requested', 'superseded')),
  CONSTRAINT quotation_versions_version_number_ck CHECK (version_number > 0),
  CONSTRAINT quotation_versions_edit_sequence_ck CHECK (edit_sequence >= 0),
  CONSTRAINT quotation_versions_predecessor_ck CHECK ((version_number = 1) = (previous_version_id IS NULL) AND previous_version_id IS DISTINCT FROM id),
  CONSTRAINT quotation_versions_freeze_marker_ck CHECK ((state = 'draft') = (shared_at IS NULL)),
  CONSTRAINT quotation_versions_supersession_marker_ck CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT quotation_versions_shared_required_ck CHECK (shared_at IS NULL OR (seller_display_name IS NOT NULL AND seller_postal_address IS NOT NULL AND seller_country_code IS NOT NULL AND seller_state_code IS NOT NULL AND seller_gst_registered IS NOT NULL AND buyer_display_name IS NOT NULL AND buyer_billing_address IS NOT NULL AND buyer_state_code IS NOT NULL AND buyer_gstin_applicable IS NOT NULL AND currency_code IS NOT NULL AND currency_exponent IS NOT NULL AND quantity_scale IS NOT NULL AND calculation_rule_code IS NOT NULL AND price_tax_mode IS NOT NULL AND gst_auto_treatment IS NOT NULL AND gst_treatment IS NOT NULL AND document_time_zone IS NOT NULL AND place_of_supply_applicable IS NOT NULL AND reverse_charge_applies IS NOT NULL AND subtotal_minor IS NOT NULL AND taxable_subtotal_minor IS NOT NULL AND cgst_total_minor IS NOT NULL AND sgst_total_minor IS NOT NULL AND igst_total_minor IS NOT NULL AND gst_total_minor IS NOT NULL AND total_minor IS NOT NULL)),
  CONSTRAINT quotation_versions_deadline_pair_ck CHECK (shared_at IS NULL OR (valid_until IS NULL) = (response_deadline_at IS NULL)),
  CONSTRAINT quotation_versions_seller_gstin_required_ck CHECK (shared_at IS NULL OR seller_gst_registered IS NOT TRUE OR seller_gstin IS NOT NULL),
  CONSTRAINT quotation_versions_buyer_gstin_required_ck CHECK (shared_at IS NULL OR buyer_gstin_applicable IS NOT TRUE OR buyer_gstin IS NOT NULL),
  CONSTRAINT quotation_versions_supply_required_ck CHECK (shared_at IS NULL OR place_of_supply_applicable IS NOT TRUE OR place_of_supply_state_code IS NOT NULL),
  CONSTRAINT quotation_versions_supply_omitted_ck CHECK (place_of_supply_applicable IS DISTINCT FROM FALSE OR (place_of_supply_state_code IS NULL AND place_of_supply_text IS NULL)),
  CONSTRAINT quotation_versions_gst_auto_treatment_enum_ck CHECK (gst_auto_treatment IN ('cgst_sgst', 'igst')),
  CONSTRAINT quotation_versions_gst_treatment_override_enum_ck CHECK (gst_treatment_override IN ('cgst_sgst', 'igst')),
  CONSTRAINT quotation_versions_gst_treatment_enum_ck CHECK (gst_treatment IN ('cgst_sgst', 'igst')),
  CONSTRAINT quotation_versions_gst_sum_ck CHECK (gst_total_minor::numeric = cgst_total_minor::numeric + sgst_total_minor::numeric + igst_total_minor::numeric),
  CONSTRAINT quotation_versions_total_sum_ck CHECK (total_minor::numeric = subtotal_minor::numeric + gst_total_minor::numeric),
  CONSTRAINT quotation_versions_taxable_subtotal_ck CHECK (taxable_subtotal_minor <= subtotal_minor)
);

-- quotation_items
CREATE TABLE public.quotation_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  version_id uuid NOT NULL,
  source_catalog_item_id uuid,
  position integer NOT NULL,
  description text NOT NULL,
  unit_label text NOT NULL,
  hsn_sac text,
  quantity numeric(18,6) NOT NULL,
  unit_price_minor bigint NOT NULL,
  line_subtotal_minor bigint NOT NULL,
  gst_category text NOT NULL,
  gst_treatment text NOT NULL,
  gst_rate numeric,
  taxable_amount_minor bigint NOT NULL,
  cgst_rate numeric,
  cgst_amount_minor bigint NOT NULL,
  sgst_rate numeric,
  sgst_amount_minor bigint NOT NULL,
  igst_rate numeric,
  igst_amount_minor bigint NOT NULL,
  line_total_minor bigint NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT u_l1 UNIQUE (business_id, version_id, id),
  CONSTRAINT u_l2 UNIQUE (business_id, version_id, position),
  CONSTRAINT quotation_items_description_text_ck CHECK (description = btrim(description) AND description <> ''),
  CONSTRAINT quotation_items_unit_label_text_ck CHECK (unit_label = btrim(unit_label) AND unit_label <> ''),
  CONSTRAINT quotation_items_hsn_sac_text_ck CHECK (hsn_sac = btrim(hsn_sac) AND hsn_sac <> ''),
  CONSTRAINT quotation_items_unit_price_minor_amount_ck CHECK (unit_price_minor >= 0),
  CONSTRAINT quotation_items_line_subtotal_minor_amount_ck CHECK (line_subtotal_minor >= 0),
  CONSTRAINT quotation_items_gst_category_text_ck CHECK (gst_category = btrim(gst_category) AND gst_category <> ''),
  CONSTRAINT quotation_items_gst_treatment_text_ck CHECK (gst_treatment = btrim(gst_treatment) AND gst_treatment <> ''),
  CONSTRAINT quotation_items_gst_rate_range_ck CHECK (gst_rate BETWEEN 0 AND 100),
  CONSTRAINT quotation_items_taxable_amount_minor_amount_ck CHECK (taxable_amount_minor >= 0),
  CONSTRAINT quotation_items_cgst_rate_range_ck CHECK (cgst_rate BETWEEN 0 AND 100),
  CONSTRAINT quotation_items_cgst_amount_minor_amount_ck CHECK (cgst_amount_minor >= 0),
  CONSTRAINT quotation_items_sgst_rate_range_ck CHECK (sgst_rate BETWEEN 0 AND 100),
  CONSTRAINT quotation_items_sgst_amount_minor_amount_ck CHECK (sgst_amount_minor >= 0),
  CONSTRAINT quotation_items_igst_rate_range_ck CHECK (igst_rate BETWEEN 0 AND 100),
  CONSTRAINT quotation_items_igst_amount_minor_amount_ck CHECK (igst_amount_minor >= 0),
  CONSTRAINT quotation_items_line_total_minor_amount_ck CHECK (line_total_minor >= 0),
  CONSTRAINT quotation_items_position_ck CHECK (position > 0),
  CONSTRAINT quotation_items_quantity_ck CHECK (quantity > 0 AND quantity < 'Infinity'::numeric AND quantity = round(quantity, 3)),
  CONSTRAINT quotation_items_category_ck CHECK (gst_category IN ('taxable', 'exempt', 'no_gst')),
  CONSTRAINT quotation_items_route_ck CHECK (gst_treatment IN ('cgst_sgst', 'igst', 'none')),
  CONSTRAINT quotation_items_tax_applicability_ck CHECK ((
 (gst_category = 'taxable' AND gst_rate IS NOT NULL AND taxable_amount_minor = line_subtotal_minor AND (
   (gst_treatment = 'cgst_sgst' AND cgst_rate IS NOT NULL AND sgst_rate IS NOT NULL
    AND cgst_rate = gst_rate / 2 AND sgst_rate = gst_rate / 2 AND igst_rate IS NULL AND igst_amount_minor = 0)
   OR
   (gst_treatment = 'igst' AND igst_rate IS NOT NULL AND igst_rate = gst_rate
    AND cgst_rate IS NULL AND sgst_rate IS NULL AND cgst_amount_minor = 0 AND sgst_amount_minor = 0)))
 OR
 (gst_category IN ('exempt', 'no_gst') AND gst_treatment = 'none' AND gst_rate IS NULL
  AND cgst_rate IS NULL AND sgst_rate IS NULL AND igst_rate IS NULL
  AND taxable_amount_minor = 0 AND cgst_amount_minor = 0 AND sgst_amount_minor = 0 AND igst_amount_minor = 0)
) IS TRUE),
  CONSTRAINT quotation_items_line_total_ck CHECK (line_total_minor::numeric = line_subtotal_minor::numeric + cgst_amount_minor::numeric + sgst_amount_minor::numeric + igst_amount_minor::numeric)
);

-- quotation_public_links
CREATE TABLE public.quotation_public_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  quotation_id uuid NOT NULL,
  version_id uuid NOT NULL,
  token_hash bytea NOT NULL,
  creation_request_key uuid NOT NULL,
  access_expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by uuid,
  revoked_at timestamptz,
  revocation_reason text,
  PRIMARY KEY (id),
  CONSTRAINT u_t1 UNIQUE (business_id, quotation_id, version_id, id),
  CONSTRAINT u_t2 UNIQUE (token_hash),
  CONSTRAINT u_t4 UNIQUE (business_id, creation_request_key),
  CONSTRAINT quotation_public_links_token_hash_length_ck CHECK (octet_length(token_hash) = 32),
  CONSTRAINT quotation_public_links_revocation_reason_text_ck CHECK (revocation_reason = btrim(revocation_reason) AND revocation_reason <> ''),
  CONSTRAINT quotation_public_links_revocation_pair_ck CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)),
  CONSTRAINT quotation_public_links_reason_ck CHECK (revocation_reason IN ('revision_shared', 'owner_revoked', 'rotated')),
  CONSTRAINT quotation_public_links_access_cutoff_ck CHECK (access_expires_at IS NULL OR access_expires_at > created_at)
);

-- quotation_responses
CREATE TABLE public.quotation_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  quotation_id uuid NOT NULL,
  version_id uuid NOT NULL,
  public_link_id uuid NOT NULL,
  kind text NOT NULL,
  customer_note text,
  respondent_name text,
  responded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT u_r1 UNIQUE (business_id, version_id),
  CONSTRAINT u_r2 UNIQUE (business_id, version_id, id),
  CONSTRAINT quotation_responses_kind_text_ck CHECK (kind = btrim(kind) AND kind <> ''),
  CONSTRAINT quotation_responses_customer_note_text_ck CHECK (customer_note = btrim(customer_note) AND customer_note <> ''),
  CONSTRAINT quotation_responses_respondent_name_text_ck CHECK (respondent_name = btrim(respondent_name) AND respondent_name <> ''),
  CONSTRAINT quotation_responses_kind_ck CHECK (kind IN ('approved', 'change_requested'))
);

-- invoices
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  quotation_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  source_version_id uuid NOT NULL,
  approved_response_id uuid NOT NULL,
  numbering_period text NOT NULL,
  sequence_number bigint NOT NULL,
  reference text NOT NULL,
  issued_at timestamptz NOT NULL,
  invoice_date date NOT NULL,
  due_on date,
  created_by uuid NOT NULL,
  seller_display_name text NOT NULL,
  seller_contact_email text,
  seller_contact_phone text,
  seller_postal_address text NOT NULL,
  seller_country_code text NOT NULL,
  seller_state_code text NOT NULL,
  seller_gst_registered boolean NOT NULL,
  seller_gstin text,
  seller_logo_asset_key text,
  seller_logo_sha256 bytea,
  seller_signature_asset_key text,
  seller_signature_sha256 bytea,
  buyer_display_name text NOT NULL,
  buyer_contact_name text,
  buyer_email text,
  buyer_phone text,
  buyer_billing_address text NOT NULL,
  buyer_state_code text NOT NULL,
  buyer_gstin_applicable boolean NOT NULL,
  buyer_gstin text,
  currency_code text NOT NULL,
  currency_exponent smallint NOT NULL,
  quantity_scale smallint NOT NULL,
  calculation_rule_code text NOT NULL,
  price_tax_mode text NOT NULL,
  gst_auto_treatment text NOT NULL,
  gst_treatment_override text,
  gst_treatment text NOT NULL,
  document_time_zone text NOT NULL,
  place_of_supply_applicable boolean NOT NULL,
  place_of_supply_state_code text,
  place_of_supply_text text,
  reverse_charge_applies boolean NOT NULL,
  subtotal_minor bigint NOT NULL,
  taxable_subtotal_minor bigint NOT NULL,
  cgst_total_minor bigint NOT NULL,
  sgst_total_minor bigint NOT NULL,
  igst_total_minor bigint NOT NULL,
  gst_total_minor bigint NOT NULL,
  total_minor bigint NOT NULL,
  seller_bank_name text,
  seller_bank_account_name text,
  seller_bank_account_number text,
  seller_bank_ifsc text,
  seller_upi_id text,
  payment_instructions text,
  terms text,
  PRIMARY KEY (id),
  CONSTRAINT u_i1 UNIQUE (business_id, id),
  CONSTRAINT u_i2 UNIQUE (business_id, quotation_id),
  CONSTRAINT u_i3 UNIQUE (business_id, id, source_version_id),
  CONSTRAINT u_i4 UNIQUE (business_id, numbering_period, reference),
  CONSTRAINT u_i5 UNIQUE (business_id, numbering_period, sequence_number),
  CONSTRAINT invoices_numbering_period_text_ck CHECK (numbering_period = btrim(numbering_period) AND numbering_period <> ''),
  CONSTRAINT invoices_reference_text_ck CHECK (reference = btrim(reference) AND reference <> ''),
  CONSTRAINT invoices_seller_display_name_text_ck CHECK (seller_display_name = btrim(seller_display_name) AND seller_display_name <> ''),
  CONSTRAINT invoices_seller_contact_email_text_ck CHECK (seller_contact_email = btrim(seller_contact_email) AND seller_contact_email <> ''),
  CONSTRAINT invoices_seller_contact_phone_text_ck CHECK (seller_contact_phone = btrim(seller_contact_phone) AND seller_contact_phone <> ''),
  CONSTRAINT invoices_seller_postal_address_text_ck CHECK (seller_postal_address = btrim(seller_postal_address) AND seller_postal_address <> ''),
  CONSTRAINT invoices_seller_country_code_text_ck CHECK (seller_country_code = btrim(seller_country_code) AND seller_country_code <> ''),
  CONSTRAINT invoices_seller_country_code_value_ck CHECK (seller_country_code = 'IN'),
  CONSTRAINT invoices_seller_state_code_text_ck CHECK (seller_state_code = btrim(seller_state_code) AND seller_state_code <> ''),
  CONSTRAINT invoices_seller_state_code_shape_ck CHECK (seller_state_code ~ '^[0-9]{2}$'),
  CONSTRAINT invoices_seller_gstin_text_ck CHECK (seller_gstin = btrim(seller_gstin) AND seller_gstin <> ''),
  CONSTRAINT invoices_seller_gstin_shape_ck CHECK (seller_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$'),
  CONSTRAINT invoices_seller_logo_asset_key_text_ck CHECK (seller_logo_asset_key = btrim(seller_logo_asset_key) AND seller_logo_asset_key <> ''),
  CONSTRAINT invoices_seller_logo_sha256_pair_ck CHECK ((seller_logo_sha256 IS NULL) = (seller_logo_asset_key IS NULL) AND (seller_logo_sha256 IS NULL OR octet_length(seller_logo_sha256) = 32)),
  CONSTRAINT invoices_seller_signature_asset_key_text_ck CHECK (seller_signature_asset_key = btrim(seller_signature_asset_key) AND seller_signature_asset_key <> ''),
  CONSTRAINT invoices_seller_signature_sha256_pair_ck CHECK ((seller_signature_sha256 IS NULL) = (seller_signature_asset_key IS NULL) AND (seller_signature_sha256 IS NULL OR octet_length(seller_signature_sha256) = 32)),
  CONSTRAINT invoices_buyer_display_name_text_ck CHECK (buyer_display_name = btrim(buyer_display_name) AND buyer_display_name <> ''),
  CONSTRAINT invoices_buyer_contact_name_text_ck CHECK (buyer_contact_name = btrim(buyer_contact_name) AND buyer_contact_name <> ''),
  CONSTRAINT invoices_buyer_email_text_ck CHECK (buyer_email = btrim(buyer_email) AND buyer_email <> ''),
  CONSTRAINT invoices_buyer_phone_text_ck CHECK (buyer_phone = btrim(buyer_phone) AND buyer_phone <> ''),
  CONSTRAINT invoices_buyer_billing_address_text_ck CHECK (buyer_billing_address = btrim(buyer_billing_address) AND buyer_billing_address <> ''),
  CONSTRAINT invoices_buyer_state_code_text_ck CHECK (buyer_state_code = btrim(buyer_state_code) AND buyer_state_code <> ''),
  CONSTRAINT invoices_buyer_state_code_shape_ck CHECK (buyer_state_code ~ '^[0-9]{2}$'),
  CONSTRAINT invoices_buyer_gstin_text_ck CHECK (buyer_gstin = btrim(buyer_gstin) AND buyer_gstin <> ''),
  CONSTRAINT invoices_buyer_gstin_shape_ck CHECK (buyer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$'),
  CONSTRAINT invoices_currency_code_text_ck CHECK (currency_code = btrim(currency_code) AND currency_code <> ''),
  CONSTRAINT invoices_currency_code_value_ck CHECK (currency_code = 'INR'),
  CONSTRAINT invoices_currency_exponent_value_ck CHECK (currency_exponent = 2),
  CONSTRAINT invoices_quantity_scale_value_ck CHECK (quantity_scale = 3),
  CONSTRAINT invoices_calculation_rule_code_text_ck CHECK (calculation_rule_code = btrim(calculation_rule_code) AND calculation_rule_code <> ''),
  CONSTRAINT invoices_calculation_rule_code_value_ck CHECK (calculation_rule_code = 'in-gst-exclusive-line-paise-half-up-v1'),
  CONSTRAINT invoices_price_tax_mode_text_ck CHECK (price_tax_mode = btrim(price_tax_mode) AND price_tax_mode <> ''),
  CONSTRAINT invoices_price_tax_mode_value_ck CHECK (price_tax_mode = 'exclusive'),
  CONSTRAINT invoices_gst_auto_treatment_text_ck CHECK (gst_auto_treatment = btrim(gst_auto_treatment) AND gst_auto_treatment <> ''),
  CONSTRAINT invoices_gst_treatment_override_text_ck CHECK (gst_treatment_override = btrim(gst_treatment_override) AND gst_treatment_override <> ''),
  CONSTRAINT invoices_gst_treatment_text_ck CHECK (gst_treatment = btrim(gst_treatment) AND gst_treatment <> ''),
  CONSTRAINT invoices_document_time_zone_text_ck CHECK (document_time_zone = btrim(document_time_zone) AND document_time_zone <> ''),
  CONSTRAINT invoices_place_of_supply_state_code_text_ck CHECK (place_of_supply_state_code = btrim(place_of_supply_state_code) AND place_of_supply_state_code <> ''),
  CONSTRAINT invoices_place_of_supply_state_code_shape_ck CHECK (place_of_supply_state_code ~ '^[0-9]{2}$'),
  CONSTRAINT invoices_place_of_supply_text_text_ck CHECK (place_of_supply_text = btrim(place_of_supply_text) AND place_of_supply_text <> ''),
  CONSTRAINT invoices_subtotal_minor_amount_ck CHECK (subtotal_minor >= 0),
  CONSTRAINT invoices_taxable_subtotal_minor_amount_ck CHECK (taxable_subtotal_minor >= 0),
  CONSTRAINT invoices_cgst_total_minor_amount_ck CHECK (cgst_total_minor >= 0),
  CONSTRAINT invoices_sgst_total_minor_amount_ck CHECK (sgst_total_minor >= 0),
  CONSTRAINT invoices_igst_total_minor_amount_ck CHECK (igst_total_minor >= 0),
  CONSTRAINT invoices_gst_total_minor_amount_ck CHECK (gst_total_minor >= 0),
  CONSTRAINT invoices_total_minor_amount_ck CHECK (total_minor >= 0),
  CONSTRAINT invoices_seller_bank_name_text_ck CHECK (seller_bank_name = btrim(seller_bank_name) AND seller_bank_name <> ''),
  CONSTRAINT invoices_seller_bank_account_name_text_ck CHECK (seller_bank_account_name = btrim(seller_bank_account_name) AND seller_bank_account_name <> ''),
  CONSTRAINT invoices_seller_bank_account_number_text_ck CHECK (seller_bank_account_number = btrim(seller_bank_account_number) AND seller_bank_account_number <> ''),
  CONSTRAINT invoices_seller_bank_ifsc_text_ck CHECK (seller_bank_ifsc = btrim(seller_bank_ifsc) AND seller_bank_ifsc <> ''),
  CONSTRAINT invoices_seller_upi_id_text_ck CHECK (seller_upi_id = btrim(seller_upi_id) AND seller_upi_id <> ''),
  CONSTRAINT invoices_payment_instructions_text_ck CHECK (payment_instructions = btrim(payment_instructions) AND payment_instructions <> ''),
  CONSTRAINT invoices_terms_text_ck CHECK (terms = btrim(terms) AND terms <> ''),
  CONSTRAINT invoices_seller_gstin_required_ck CHECK (seller_gst_registered IS NOT TRUE OR seller_gstin IS NOT NULL),
  CONSTRAINT invoices_buyer_gstin_required_ck CHECK (buyer_gstin_applicable IS NOT TRUE OR buyer_gstin IS NOT NULL),
  CONSTRAINT invoices_supply_required_ck CHECK (place_of_supply_applicable IS NOT TRUE OR place_of_supply_state_code IS NOT NULL),
  CONSTRAINT invoices_supply_omitted_ck CHECK (place_of_supply_applicable IS DISTINCT FROM FALSE OR (place_of_supply_state_code IS NULL AND place_of_supply_text IS NULL)),
  CONSTRAINT invoices_gst_auto_treatment_enum_ck CHECK (gst_auto_treatment IN ('cgst_sgst', 'igst')),
  CONSTRAINT invoices_gst_treatment_override_enum_ck CHECK (gst_treatment_override IN ('cgst_sgst', 'igst')),
  CONSTRAINT invoices_gst_treatment_enum_ck CHECK (gst_treatment IN ('cgst_sgst', 'igst')),
  CONSTRAINT invoices_gst_sum_ck CHECK (gst_total_minor::numeric = cgst_total_minor::numeric + sgst_total_minor::numeric + igst_total_minor::numeric),
  CONSTRAINT invoices_total_sum_ck CHECK (total_minor::numeric = subtotal_minor::numeric + gst_total_minor::numeric),
  CONSTRAINT invoices_taxable_subtotal_ck CHECK (taxable_subtotal_minor <= subtotal_minor),
  CONSTRAINT invoices_sequence_positive_ck CHECK (sequence_number > 0),
  CONSTRAINT invoices_due_date_ck CHECK (due_on IS NULL OR due_on >= invoice_date)
);

-- invoice_items
CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  source_version_id uuid NOT NULL,
  source_quotation_item_id uuid NOT NULL,
  position integer NOT NULL,
  description text NOT NULL,
  unit_label text NOT NULL,
  hsn_sac text,
  quantity numeric(18,6) NOT NULL,
  unit_price_minor bigint NOT NULL,
  line_subtotal_minor bigint NOT NULL,
  gst_category text NOT NULL,
  gst_treatment text NOT NULL,
  gst_rate numeric,
  taxable_amount_minor bigint NOT NULL,
  cgst_rate numeric,
  cgst_amount_minor bigint NOT NULL,
  sgst_rate numeric,
  sgst_amount_minor bigint NOT NULL,
  igst_rate numeric,
  igst_amount_minor bigint NOT NULL,
  line_total_minor bigint NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT u_n1 UNIQUE (business_id, invoice_id, position),
  CONSTRAINT u_n2 UNIQUE (business_id, invoice_id, source_quotation_item_id),
  CONSTRAINT invoice_items_description_text_ck CHECK (description = btrim(description) AND description <> ''),
  CONSTRAINT invoice_items_unit_label_text_ck CHECK (unit_label = btrim(unit_label) AND unit_label <> ''),
  CONSTRAINT invoice_items_hsn_sac_text_ck CHECK (hsn_sac = btrim(hsn_sac) AND hsn_sac <> ''),
  CONSTRAINT invoice_items_unit_price_minor_amount_ck CHECK (unit_price_minor >= 0),
  CONSTRAINT invoice_items_line_subtotal_minor_amount_ck CHECK (line_subtotal_minor >= 0),
  CONSTRAINT invoice_items_gst_category_text_ck CHECK (gst_category = btrim(gst_category) AND gst_category <> ''),
  CONSTRAINT invoice_items_gst_treatment_text_ck CHECK (gst_treatment = btrim(gst_treatment) AND gst_treatment <> ''),
  CONSTRAINT invoice_items_gst_rate_range_ck CHECK (gst_rate BETWEEN 0 AND 100),
  CONSTRAINT invoice_items_taxable_amount_minor_amount_ck CHECK (taxable_amount_minor >= 0),
  CONSTRAINT invoice_items_cgst_rate_range_ck CHECK (cgst_rate BETWEEN 0 AND 100),
  CONSTRAINT invoice_items_cgst_amount_minor_amount_ck CHECK (cgst_amount_minor >= 0),
  CONSTRAINT invoice_items_sgst_rate_range_ck CHECK (sgst_rate BETWEEN 0 AND 100),
  CONSTRAINT invoice_items_sgst_amount_minor_amount_ck CHECK (sgst_amount_minor >= 0),
  CONSTRAINT invoice_items_igst_rate_range_ck CHECK (igst_rate BETWEEN 0 AND 100),
  CONSTRAINT invoice_items_igst_amount_minor_amount_ck CHECK (igst_amount_minor >= 0),
  CONSTRAINT invoice_items_line_total_minor_amount_ck CHECK (line_total_minor >= 0),
  CONSTRAINT invoice_items_position_ck CHECK (position > 0),
  CONSTRAINT invoice_items_quantity_ck CHECK (quantity > 0 AND quantity < 'Infinity'::numeric AND quantity = round(quantity, 3)),
  CONSTRAINT invoice_items_category_ck CHECK (gst_category IN ('taxable', 'exempt', 'no_gst')),
  CONSTRAINT invoice_items_route_ck CHECK (gst_treatment IN ('cgst_sgst', 'igst', 'none')),
  CONSTRAINT invoice_items_tax_applicability_ck CHECK ((
 (gst_category = 'taxable' AND gst_rate IS NOT NULL AND taxable_amount_minor = line_subtotal_minor AND (
   (gst_treatment = 'cgst_sgst' AND cgst_rate IS NOT NULL AND sgst_rate IS NOT NULL
    AND cgst_rate = gst_rate / 2 AND sgst_rate = gst_rate / 2 AND igst_rate IS NULL AND igst_amount_minor = 0)
   OR
   (gst_treatment = 'igst' AND igst_rate IS NOT NULL AND igst_rate = gst_rate
    AND cgst_rate IS NULL AND sgst_rate IS NULL AND cgst_amount_minor = 0 AND sgst_amount_minor = 0)))
 OR
 (gst_category IN ('exempt', 'no_gst') AND gst_treatment = 'none' AND gst_rate IS NULL
  AND cgst_rate IS NULL AND sgst_rate IS NULL AND igst_rate IS NULL
  AND taxable_amount_minor = 0 AND cgst_amount_minor = 0 AND sgst_amount_minor = 0 AND igst_amount_minor = 0)
) IS TRUE),
  CONSTRAINT invoice_items_line_total_ck CHECK (line_total_minor::numeric = line_subtotal_minor::numeric + cgst_amount_minor::numeric + sgst_amount_minor::numeric + igst_amount_minor::numeric)
);

-- payments
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code text NOT NULL,
  currency_exponent smallint NOT NULL,
  received_at timestamptz NOT NULL,
  method text NOT NULL,
  external_reference text,
  request_key uuid NOT NULL,
  replaces_payment_id uuid,
  created_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT u_p1 UNIQUE (business_id, invoice_id, id),
  CONSTRAINT u_p2 UNIQUE (business_id, request_key),
  CONSTRAINT u_p3 UNIQUE (business_id, replaces_payment_id),
  CONSTRAINT payments_amount_minor_amount_ck CHECK (amount_minor > 0),
  CONSTRAINT payments_currency_code_text_ck CHECK (currency_code = btrim(currency_code) AND currency_code <> ''),
  CONSTRAINT payments_currency_code_value_ck CHECK (currency_code = 'INR'),
  CONSTRAINT payments_currency_exponent_value_ck CHECK (currency_exponent = 2),
  CONSTRAINT payments_method_text_ck CHECK (method = btrim(method) AND method <> ''),
  CONSTRAINT payments_external_reference_text_ck CHECK (external_reference = btrim(external_reference) AND external_reference <> ''),
  CONSTRAINT payments_predecessor_not_self_ck CHECK (replaces_payment_id IS DISTINCT FROM id),
  CONSTRAINT payments_receipt_time_ck CHECK (received_at <= recorded_at)
);

-- payment_reversals
CREATE TABLE public.payment_reversals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  reason text NOT NULL,
  reversed_by uuid NOT NULL,
  reversed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT u_x1 UNIQUE (business_id, payment_id),
  CONSTRAINT payment_reversals_reason_text_ck CHECK (reason = btrim(reason) AND reason <> '')
);

-- receipts
CREATE TABLE public.receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  reference text NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code text NOT NULL,
  currency_exponent smallint NOT NULL,
  replaces_receipt_id uuid,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT u_e1 UNIQUE (business_id, payment_id),
  CONSTRAINT u_e2 UNIQUE (business_id, reference),
  CONSTRAINT u_e3 UNIQUE (business_id, invoice_id, id),
  CONSTRAINT u_e4 UNIQUE (business_id, replaces_receipt_id),
  CONSTRAINT receipts_reference_text_ck CHECK (reference = btrim(reference) AND reference <> ''),
  CONSTRAINT receipts_amount_minor_amount_ck CHECK (amount_minor > 0),
  CONSTRAINT receipts_currency_code_text_ck CHECK (currency_code = btrim(currency_code) AND currency_code <> ''),
  CONSTRAINT receipts_currency_code_value_ck CHECK (currency_code = 'INR'),
  CONSTRAINT receipts_currency_exponent_value_ck CHECK (currency_exponent = 2),
  CONSTRAINT receipts_predecessor_not_self_ck CHECK (replaces_receipt_id IS DISTINCT FROM id)
);

-- invoice_public_links
CREATE TABLE public.invoice_public_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  token_hash bytea NOT NULL,
  creation_request_key uuid NOT NULL,
  access_expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by uuid,
  revoked_at timestamptz,
  revocation_reason text,
  PRIMARY KEY (id),
  CONSTRAINT u_j1 UNIQUE (token_hash),
  CONSTRAINT u_j3 UNIQUE (business_id, creation_request_key),
  CONSTRAINT invoice_public_links_token_hash_length_ck CHECK (octet_length(token_hash) = 32),
  CONSTRAINT invoice_public_links_revocation_reason_text_ck CHECK (revocation_reason = btrim(revocation_reason) AND revocation_reason <> ''),
  CONSTRAINT invoice_public_links_revocation_pair_ck CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)),
  CONSTRAINT invoice_public_links_reason_ck CHECK (revocation_reason IN ('owner_revoked', 'rotated')),
  CONSTRAINT invoice_public_links_access_cutoff_ck CHECK (access_expires_at IS NULL OR access_expires_at > created_at)
);

-- invoice_number_sequences
CREATE TABLE public.invoice_number_sequences (
  business_id uuid NOT NULL,
  period_key text NOT NULL,
  starts_on date NOT NULL,
  ends_before date NOT NULL,
  prefix text NOT NULL DEFAULT '',
  format_template text NOT NULL,
  minimum_digits smallint NOT NULL DEFAULT 1,
  starting_number bigint NOT NULL,
  last_issued_number bigint,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (business_id, period_key),
  CONSTRAINT invoice_number_sequences_period_key_text_ck CHECK (period_key = btrim(period_key) AND period_key <> ''),
  CONSTRAINT invoice_number_sequences_prefix_text_ck CHECK (prefix = btrim(prefix)),
  CONSTRAINT invoice_number_sequences_format_template_text_ck CHECK (format_template = btrim(format_template) AND format_template <> ''),
  CONSTRAINT invoice_number_sequences_date_range_ck CHECK (ends_before > starts_on),
  CONSTRAINT invoice_number_sequences_padding_ck CHECK (minimum_digits BETWEEN 1 AND 19),
  CONSTRAINT invoice_number_sequences_start_positive_ck CHECK (starting_number > 0),
  CONSTRAINT invoice_number_sequences_cursor_ck CHECK (last_issued_number IS NULL OR last_issued_number >= starting_number),
  CONSTRAINT invoice_number_sequences_template_ck CHECK ((length(format_template) - length(replace(format_template, '{number}', ''))) = length('{number}')
 AND replace(replace(replace(format_template, '{number}', ''), '{prefix}', ''), '{period}', '') !~ '[{}]')
);

-- gst_rate_options
CREATE TABLE public.gst_rate_options (
  rate numeric NOT NULL,
  selectable boolean NOT NULL DEFAULT true,
  PRIMARY KEY (rate),
  CONSTRAINT gst_rate_options_rate_range_ck CHECK (rate BETWEEN 0 AND 100)
);

-- Composite relationships, including the two explicitly deferred cycles.
ALTER TABLE public.businesses ADD CONSTRAINT businesses_created_by_fk FOREIGN KEY (id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.business_memberships ADD CONSTRAINT business_memberships_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.business_memberships ADD CONSTRAINT business_memberships_user_fk FOREIGN KEY (user_id) REFERENCES auth.users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.customers ADD CONSTRAINT customers_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.customers ADD CONSTRAINT customers_archived_by_fk FOREIGN KEY (business_id, archived_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.customers ADD CONSTRAINT customers_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_archived_by_fk FOREIGN KEY (business_id, archived_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_customer_fk FOREIGN KEY (business_id, customer_id) REFERENCES public.customers (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_current_version_fk FOREIGN KEY (business_id, id, current_version_id) REFERENCES public.quotation_versions (business_id, quotation_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.quotation_versions ADD CONSTRAINT quotation_versions_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_versions ADD CONSTRAINT quotation_versions_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_versions ADD CONSTRAINT quotation_versions_shared_by_fk FOREIGN KEY (business_id, shared_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_versions ADD CONSTRAINT quotation_versions_superseded_by_fk FOREIGN KEY (business_id, superseded_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_versions ADD CONSTRAINT quotation_versions_quotation_fk FOREIGN KEY (business_id, quotation_id) REFERENCES public.quotations (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_versions ADD CONSTRAINT quotation_versions_predecessor_fk FOREIGN KEY (business_id, quotation_id, previous_version_id) REFERENCES public.quotation_versions (business_id, quotation_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_version_fk FOREIGN KEY (business_id, version_id) REFERENCES public.quotation_versions (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_catalog_fk FOREIGN KEY (business_id, source_catalog_item_id) REFERENCES public.catalog_items (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_public_links ADD CONSTRAINT quotation_public_links_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_public_links ADD CONSTRAINT quotation_public_links_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_public_links ADD CONSTRAINT quotation_public_links_revoked_by_fk FOREIGN KEY (business_id, revoked_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_public_links ADD CONSTRAINT quotation_public_links_version_fk FOREIGN KEY (business_id, quotation_id, version_id) REFERENCES public.quotation_versions (business_id, quotation_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_responses ADD CONSTRAINT quotation_responses_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_responses ADD CONSTRAINT quotation_responses_version_fk FOREIGN KEY (business_id, quotation_id, version_id) REFERENCES public.quotation_versions (business_id, quotation_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.quotation_responses ADD CONSTRAINT quotation_responses_public_link_fk FOREIGN KEY (business_id, quotation_id, version_id, public_link_id) REFERENCES public.quotation_public_links (business_id, quotation_id, version_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_quotation_customer_fk FOREIGN KEY (business_id, quotation_id, customer_id) REFERENCES public.quotations (business_id, id, customer_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_source_version_fk FOREIGN KEY (business_id, quotation_id, source_version_id) REFERENCES public.quotation_versions (business_id, quotation_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_approval_fk FOREIGN KEY (business_id, source_version_id, approved_response_id) REFERENCES public.quotation_responses (business_id, version_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_period_fk FOREIGN KEY (business_id, numbering_period) REFERENCES public.invoice_number_sequences (business_id, period_key) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_source_fk FOREIGN KEY (business_id, invoice_id, source_version_id) REFERENCES public.invoices (business_id, id, source_version_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_source_line_fk FOREIGN KEY (business_id, source_version_id, source_quotation_item_id) REFERENCES public.quotation_items (business_id, version_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.payments ADD CONSTRAINT payments_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.payments ADD CONSTRAINT payments_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_fk FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoices (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.payments ADD CONSTRAINT payments_replacement_fk FOREIGN KEY (business_id, invoice_id, replaces_payment_id) REFERENCES public.payments (business_id, invoice_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.payment_reversals ADD CONSTRAINT payment_reversals_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.payment_reversals ADD CONSTRAINT payment_reversals_reversed_by_fk FOREIGN KEY (business_id, reversed_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.payment_reversals ADD CONSTRAINT payment_reversals_payment_fk FOREIGN KEY (business_id, invoice_id, payment_id) REFERENCES public.payments (business_id, invoice_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_issued_by_fk FOREIGN KEY (business_id, issued_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_payment_fk FOREIGN KEY (business_id, invoice_id, payment_id) REFERENCES public.payments (business_id, invoice_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_replacement_fk FOREIGN KEY (business_id, invoice_id, replaces_receipt_id) REFERENCES public.receipts (business_id, invoice_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_public_links ADD CONSTRAINT invoice_public_links_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_public_links ADD CONSTRAINT invoice_public_links_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_public_links ADD CONSTRAINT invoice_public_links_revoked_by_fk FOREIGN KEY (business_id, revoked_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_public_links ADD CONSTRAINT invoice_public_links_invoice_fk FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoices (business_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_number_sequences ADD CONSTRAINT invoice_number_sequences_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.invoice_number_sequences ADD CONSTRAINT invoice_number_sequences_created_by_fk FOREIGN KEY (business_id, created_by) REFERENCES public.business_memberships (business_id, user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

-- Only the approved supporting indexes; UNIQUE/PK indexes are not duplicated.
CREATE UNIQUE INDEX u_v5 ON public.quotation_versions (business_id, quotation_id) WHERE state = 'draft';
CREATE UNIQUE INDEX u_t3 ON public.quotation_public_links (business_id, quotation_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX u_j2 ON public.invoice_public_links (business_id, invoice_id) WHERE revoked_at IS NULL;
CREATE INDEX x_c1 ON public.customers (business_id, display_name, id);
CREATE INDEX x_k1 ON public.catalog_items (business_id, name, id);
CREATE INDEX x_q1 ON public.quotations (business_id, updated_at DESC, id);
CREATE INDEX x_q2 ON public.quotations (business_id, customer_id, created_at DESC, id);
CREATE INDEX x_r1 ON public.quotation_responses (business_id, quotation_id, version_id, public_link_id);
CREATE INDEX x_i1 ON public.invoices (business_id, issued_at DESC, id);
CREATE INDEX x_i2 ON public.invoices (business_id, customer_id, issued_at DESC, id);
CREATE INDEX x_i3 ON public.invoices (business_id, quotation_id, source_version_id);
CREATE INDEX x_n1 ON public.invoice_items (business_id, source_version_id, source_quotation_item_id);
CREATE INDEX x_p1 ON public.payments (business_id, received_at DESC, id);
CREATE INDEX x_j1 ON public.invoice_public_links (business_id, invoice_id, created_at DESC, id);

-- Private invoker-only integrity functions. No callable workflow endpoints.
-- Future commands must acquire the documented locks before their writes.
CREATE FUNCTION private.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = TG_TABLE_NAME || ' is immutable';
END
$fn$;
CREATE FUNCTION private.guard_fixed_columns() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'businesses' THEN
      IF ROW(NEW.id, NEW.country_code, NEW.currency_code, NEW.currency_exponent, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.country_code, OLD.currency_code, OLD.currency_exponent, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'businesses: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'customers' THEN
      IF ROW(NEW.id, NEW.business_id, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'customers: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'catalog_items' THEN
      IF ROW(NEW.id, NEW.business_id, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'catalog_items: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'quotations' THEN
      IF ROW(NEW.id, NEW.business_id, NEW.customer_id, NEW.reference, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.customer_id, OLD.reference, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'quotations: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'quotation_versions' THEN
      IF ROW(NEW.id, NEW.business_id, NEW.quotation_id, NEW.version_number, NEW.previous_version_id, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.quotation_id, OLD.version_number, OLD.previous_version_id, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'quotation_versions: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'quotation_items' THEN
      IF ROW(NEW.id, NEW.business_id, NEW.version_id) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.version_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'quotation_items: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'quotation_public_links' THEN
      IF ROW(NEW.id, NEW.business_id, NEW.quotation_id, NEW.version_id, NEW.token_hash, NEW.creation_request_key, NEW.access_expires_at, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.quotation_id, OLD.version_id, OLD.token_hash, OLD.creation_request_key, OLD.access_expires_at, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'quotation_public_links: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'invoice_public_links' THEN
      IF ROW(NEW.id, NEW.business_id, NEW.invoice_id, NEW.token_hash, NEW.creation_request_key, NEW.access_expires_at, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.invoice_id, OLD.token_hash, OLD.creation_request_key, OLD.access_expires_at, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invoice_public_links: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'invoice_number_sequences' THEN
      IF ROW(NEW.business_id, NEW.period_key, NEW.created_by, NEW.created_at) IS DISTINCT FROM ROW(OLD.business_id, OLD.period_key, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invoice_number_sequences: fixed identity or creation fields cannot change';
      END IF;
    WHEN 'business_memberships' THEN
      IF ROW(NEW.business_id, NEW.user_id, NEW.role, NEW.created_at) IS DISTINCT FROM ROW(OLD.business_id, OLD.user_id, OLD.role, OLD.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'business_memberships: fixed identity or creation fields cannot change';
      END IF;
    ELSE RAISE EXCEPTION 'Unsupported fixed-column guard target';
  END CASE;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.quotation_versions FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.quotation_items FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.quotation_public_links FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.invoice_public_links FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.invoice_number_sequences FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER a_fixed_columns BEFORE UPDATE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION private.guard_fixed_columns();
CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.quotation_responses FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.payment_reversals FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.receipts FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER retain_history BEFORE DELETE ON public.businesses FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER retain_history BEFORE DELETE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER retain_history BEFORE DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER retain_history BEFORE DELETE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER retain_history BEFORE DELETE ON public.quotation_public_links FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER retain_history BEFORE DELETE ON public.invoice_public_links FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();
CREATE TRIGGER retain_history BEFORE DELETE ON public.invoice_number_sequences FOR EACH ROW EXECUTE FUNCTION private.reject_mutation();

CREATE FUNCTION private.guard_link_revocation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND
     ROW(NEW.revoked_at, NEW.revoked_by, NEW.revocation_reason)
     IS DISTINCT FROM ROW(OLD.revoked_at, OLD.revoked_by, OLD.revocation_reason) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Revocation cannot be edited or cleared';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER b_revocation BEFORE UPDATE ON public.quotation_public_links FOR EACH ROW EXECUTE FUNCTION private.guard_link_revocation();
CREATE TRIGGER b_revocation BEFORE UPDATE ON public.invoice_public_links FOR EACH ROW EXECUTE FUNCTION private.guard_link_revocation();

CREATE FUNCTION private.guard_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE predecessor public.quotation_versions;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.shared_at IS NOT NULL OR OLD.version_number <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only an initial never-shared draft can be purged';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A version must begin as a draft';
    END IF;
    IF NEW.previous_version_id IS NOT NULL THEN
      SELECT * INTO predecessor FROM public.quotation_versions
      WHERE business_id = NEW.business_id AND quotation_id = NEW.quotation_id AND id = NEW.previous_version_id;
      IF NOT FOUND OR predecessor.shared_at IS NULL OR NEW.version_number <> predecessor.version_number + 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Revision must follow the previous frozen version';
      END IF;
      IF EXISTS (SELECT FROM public.invoices WHERE business_id = NEW.business_id AND quotation_id = NEW.quotation_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An invoiced quotation cannot be revised';
      END IF;
    END IF;
  ELSE
    IF OLD.shared_at IS NOT NULL AND
       ROW(NEW.seller_display_name, NEW.seller_contact_email, NEW.seller_contact_phone, NEW.seller_postal_address, NEW.seller_country_code, NEW.seller_state_code, NEW.seller_gst_registered, NEW.seller_gstin, NEW.seller_logo_asset_key, NEW.seller_logo_sha256, NEW.seller_signature_asset_key, NEW.seller_signature_sha256, NEW.buyer_display_name, NEW.buyer_contact_name, NEW.buyer_email, NEW.buyer_phone, NEW.buyer_billing_address, NEW.buyer_state_code, NEW.buyer_gstin_applicable, NEW.buyer_gstin, NEW.currency_code, NEW.currency_exponent, NEW.quantity_scale, NEW.calculation_rule_code, NEW.price_tax_mode, NEW.gst_auto_treatment, NEW.gst_treatment_override, NEW.gst_treatment, NEW.document_time_zone, NEW.place_of_supply_applicable, NEW.place_of_supply_state_code, NEW.place_of_supply_text, NEW.reverse_charge_applies, NEW.subtotal_minor, NEW.taxable_subtotal_minor, NEW.cgst_total_minor, NEW.sgst_total_minor, NEW.igst_total_minor, NEW.gst_total_minor, NEW.total_minor, NEW.seller_bank_name, NEW.seller_bank_account_name, NEW.seller_bank_account_number, NEW.seller_bank_ifsc, NEW.seller_upi_id, NEW.payment_instructions, NEW.terms, NEW.valid_until, NEW.response_deadline_at, NEW.shared_by, NEW.shared_at, NEW.edit_sequence, NEW.edited_at)
       IS DISTINCT FROM
       ROW(OLD.seller_display_name, OLD.seller_contact_email, OLD.seller_contact_phone, OLD.seller_postal_address, OLD.seller_country_code, OLD.seller_state_code, OLD.seller_gst_registered, OLD.seller_gstin, OLD.seller_logo_asset_key, OLD.seller_logo_sha256, OLD.seller_signature_asset_key, OLD.seller_signature_sha256, OLD.buyer_display_name, OLD.buyer_contact_name, OLD.buyer_email, OLD.buyer_phone, OLD.buyer_billing_address, OLD.buyer_state_code, OLD.buyer_gstin_applicable, OLD.buyer_gstin, OLD.currency_code, OLD.currency_exponent, OLD.quantity_scale, OLD.calculation_rule_code, OLD.price_tax_mode, OLD.gst_auto_treatment, OLD.gst_treatment_override, OLD.gst_treatment, OLD.document_time_zone, OLD.place_of_supply_applicable, OLD.place_of_supply_state_code, OLD.place_of_supply_text, OLD.reverse_charge_applies, OLD.subtotal_minor, OLD.taxable_subtotal_minor, OLD.cgst_total_minor, OLD.sgst_total_minor, OLD.igst_total_minor, OLD.gst_total_minor, OLD.total_minor, OLD.seller_bank_name, OLD.seller_bank_account_name, OLD.seller_bank_account_number, OLD.seller_bank_ifsc, OLD.seller_upi_id, OLD.payment_instructions, OLD.terms, OLD.valid_until, OLD.response_deadline_at, OLD.shared_by, OLD.shared_at, OLD.edit_sequence, OLD.edited_at) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Frozen quotation content cannot change';
    END IF;
    IF NEW.state <> OLD.state AND NOT (
      (OLD.state = 'draft' AND NEW.state = 'shared') OR
      (OLD.state = 'shared' AND NEW.state IN ('approved','change_requested','superseded')) OR
      (OLD.state IN ('approved','change_requested') AND NEW.state = 'superseded')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid quotation state transition';
    END IF;
    IF OLD.superseded_at IS NOT NULL AND ROW(NEW.superseded_at,NEW.superseded_by) IS DISTINCT FROM ROW(OLD.superseded_at,OLD.superseded_by) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Supersession evidence is immutable';
    END IF;
  END IF;
  IF NEW.shared_at IS NOT NULL AND NEW.valid_until IS NOT NULL AND
     NEW.response_deadline_at IS DISTINCT FROM ((NEW.valid_until + 1)::timestamp AT TIME ZONE NEW.document_time_zone) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Response deadline must be next local midnight';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER b_version BEFORE INSERT OR UPDATE OR DELETE ON public.quotation_versions FOR EACH ROW EXECUTE FUNCTION private.guard_version();

CREATE FUNCTION private.guard_quotation_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE parent public.quotation_versions; b uuid; v uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN b := OLD.business_id; v := OLD.version_id;
  ELSE b := NEW.business_id; v := NEW.version_id; END IF;
  SELECT * INTO parent FROM public.quotation_versions WHERE business_id = b AND id = v;
  IF FOUND AND parent.shared_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Frozen quotation items cannot change';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF parent.currency_code IS NULL OR parent.quantity_scale IS NULL OR parent.calculation_rule_code IS NULL
     OR parent.gst_treatment IS NULL OR parent.seller_state_code IS NULL OR parent.buyer_state_code IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Draft calculation setup is incomplete';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER b_item BEFORE INSERT OR UPDATE OR DELETE ON public.quotation_items FOR EACH ROW EXECUTE FUNCTION private.guard_quotation_item();

CREATE FUNCTION private.guard_quotation_purge() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF EXISTS (SELECT FROM public.quotation_versions WHERE business_id=OLD.business_id AND quotation_id=OLD.id AND (shared_at IS NOT NULL OR version_number <> 1))
     OR EXISTS (SELECT FROM public.quotation_public_links WHERE business_id=OLD.business_id AND quotation_id=OLD.id)
     OR EXISTS (SELECT FROM public.quotation_responses WHERE business_id=OLD.business_id AND quotation_id=OLD.id)
     OR EXISTS (SELECT FROM public.invoices WHERE business_id=OLD.business_id AND quotation_id=OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Quotation has retained history';
  END IF;
  RETURN OLD;
END
$fn$;
CREATE TRIGGER purge_initial_draft BEFORE DELETE ON public.quotations FOR EACH ROW EXECUTE FUNCTION private.guard_quotation_purge();

-- The calculation contract is row-local; percentages remain arbitrary configured numeric values.
ALTER TABLE public.quotation_items
  ADD CONSTRAINT quotation_items_base_rounding_ck CHECK (line_subtotal_minor::numeric = floor(quantity * unit_price_minor + 0.5)),
  ADD CONSTRAINT quotation_items_cgst_rounding_ck CHECK (cgst_rate IS NULL OR cgst_amount_minor::numeric = floor(taxable_amount_minor * cgst_rate / 100 + 0.5)),
  ADD CONSTRAINT quotation_items_sgst_rounding_ck CHECK (sgst_rate IS NULL OR sgst_amount_minor::numeric = floor(taxable_amount_minor * sgst_rate / 100 + 0.5)),
  ADD CONSTRAINT quotation_items_igst_rounding_ck CHECK (igst_rate IS NULL OR igst_amount_minor::numeric = floor(taxable_amount_minor * igst_rate / 100 + 0.5));
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_base_rounding_ck CHECK (line_subtotal_minor::numeric = floor(quantity * unit_price_minor + 0.5)),
  ADD CONSTRAINT invoice_items_cgst_rounding_ck CHECK (cgst_rate IS NULL OR cgst_amount_minor::numeric = floor(taxable_amount_minor * cgst_rate / 100 + 0.5)),
  ADD CONSTRAINT invoice_items_sgst_rounding_ck CHECK (sgst_rate IS NULL OR sgst_amount_minor::numeric = floor(taxable_amount_minor * sgst_rate / 100 + 0.5)),
  ADD CONSTRAINT invoice_items_igst_rounding_ck CHECK (igst_rate IS NULL OR igst_amount_minor::numeric = floor(taxable_amount_minor * igst_rate / 100 + 0.5));

CREATE FUNCTION private.check_quotation_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE b uuid; q uuid; quote public.quotations; v public.quotation_versions;
        line_count bigint; totals record; response_kind text;
BEGIN
  IF TG_TABLE_NAME = 'quotations' THEN
    IF TG_OP = 'DELETE' THEN b := OLD.business_id; q := OLD.id; ELSE b := NEW.business_id; q := NEW.id; END IF;
  ELSIF TG_TABLE_NAME = 'quotation_items' THEN
    IF TG_OP = 'DELETE' THEN b := OLD.business_id;
      SELECT quotation_id INTO q FROM public.quotation_versions WHERE business_id=b AND id=OLD.version_id;
    ELSE b := NEW.business_id;
      SELECT quotation_id INTO q FROM public.quotation_versions WHERE business_id=b AND id=NEW.version_id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN b := OLD.business_id; q := OLD.quotation_id;
    ELSE b := NEW.business_id; q := NEW.quotation_id; END IF;
  END IF;
  SELECT * INTO quote FROM public.quotations WHERE business_id=b AND id=q;
  IF NOT FOUND THEN RETURN NULL; END IF; -- Permitted complete initial-draft purge.
  SELECT * INTO v FROM public.quotation_versions
  WHERE business_id=b AND quotation_id=q ORDER BY version_number DESC LIMIT 1;
  IF NOT FOUND OR quote.current_version_id <> v.id OR v.state='superseded' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Current quotation version must be the last nonsuperseded version';
  END IF;
  FOR v IN SELECT * FROM public.quotation_versions WHERE business_id=b AND quotation_id=q LOOP
    IF v.id <> quote.current_version_id AND v.state <> 'superseded' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Every preceding version must be superseded';
    END IF;
    SELECT kind INTO response_kind FROM public.quotation_responses WHERE business_id=b AND version_id=v.id;
    IF (v.state IN ('draft','shared') AND response_kind IS NOT NULL)
       OR (v.state IN ('approved','change_requested') AND response_kind IS DISTINCT FROM v.state) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Version state does not match retained response';
    END IF;
    SELECT count(*), sum(line_subtotal_minor) base, sum(taxable_amount_minor) taxable,
      sum(cgst_amount_minor) cgst, sum(sgst_amount_minor) sgst, sum(igst_amount_minor) igst,
      sum(line_total_minor) total
    INTO totals FROM public.quotation_items WHERE business_id=b AND version_id=v.id;
    line_count := totals.count;
    IF v.shared_at IS NOT NULL AND line_count=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='A frozen quotation requires at least one line';
    END IF;
    IF line_count>0 AND (
      ROW(v.subtotal_minor::numeric,v.taxable_subtotal_minor::numeric,v.cgst_total_minor::numeric,v.sgst_total_minor::numeric,v.igst_total_minor::numeric,v.gst_total_minor::numeric,v.total_minor::numeric)
      IS DISTINCT FROM ROW(totals.base,totals.taxable,totals.cgst,totals.sgst,totals.igst,totals.cgst+totals.sgst+totals.igst,totals.total)
      OR v.gst_auto_treatment IS DISTINCT FROM CASE WHEN v.seller_state_code=v.buyer_state_code THEN 'cgst_sgst' ELSE 'igst' END
      OR v.gst_treatment IS DISTINCT FROM coalesce(v.gst_treatment_override,v.gst_auto_treatment)
      OR EXISTS (SELECT FROM public.quotation_items WHERE business_id=b AND version_id=v.id AND gst_category='taxable' AND gst_treatment<>v.gst_treatment)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Quotation inputs, line routes or totals disagree';
    END IF;
    IF line_count=0 AND (
      coalesce(v.subtotal_minor,0)<>0 OR coalesce(v.taxable_subtotal_minor,0)<>0
      OR coalesce(v.cgst_total_minor,0)<>0 OR coalesce(v.sgst_total_minor,0)<>0
      OR coalesce(v.igst_total_minor,0)<>0 OR coalesce(v.gst_total_minor,0)<>0 OR coalesce(v.total_minor,0)<>0
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='An empty draft cannot have nonzero totals';
    END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER quotation_integrity AFTER INSERT OR UPDATE OR DELETE ON public.quotations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_quotation_integrity();
CREATE CONSTRAINT TRIGGER quotation_integrity AFTER INSERT OR UPDATE OR DELETE ON public.quotation_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_quotation_integrity();
CREATE CONSTRAINT TRIGGER quotation_integrity AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_quotation_integrity();
CREATE CONSTRAINT TRIGGER quotation_integrity AFTER INSERT OR UPDATE OR DELETE ON public.quotation_responses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_quotation_integrity();

CREATE FUNCTION private.guard_new_share() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF OLD.shared_at IS NULL AND NEW.shared_at IS NOT NULL THEN
    -- Commands take this before business/quotation locks. It is retained until commit.
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/gst-options',0));
    IF NEW.response_deadline_at IS NOT NULL AND NEW.response_deadline_at <= pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Cannot share a quotation past its response deadline';
    END IF;
    IF EXISTS (
      SELECT FROM public.quotation_items i WHERE i.business_id=NEW.business_id AND i.version_id=NEW.id
      AND i.gst_category='taxable' AND NOT EXISTS (
        SELECT FROM public.gst_rate_options r WHERE r.rate=i.gst_rate AND r.selectable
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Select a currently configured GST rate before sharing';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER c_share BEFORE UPDATE ON public.quotation_versions FOR EACH ROW EXECUTE FUNCTION private.guard_new_share();

CREATE FUNCTION private.check_share_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF OLD.shared_at IS NULL AND NEW.shared_at IS NOT NULL AND NOT EXISTS (
    SELECT FROM public.quotation_public_links WHERE business_id=NEW.business_id AND version_id=NEW.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Sharing must create its version-bound link in the same transaction';
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER share_link AFTER UPDATE ON public.quotation_versions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_share_link();

CREATE FUNCTION private.guard_quote_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT FROM public.quotation_versions v JOIN public.quotations q
      ON q.business_id=v.business_id AND q.id=v.quotation_id
    WHERE v.business_id=NEW.business_id AND v.quotation_id=NEW.quotation_id
      AND v.id=NEW.version_id AND v.shared_at IS NOT NULL AND q.current_version_id=v.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='New quotation links require the current frozen version';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER quote_link BEFORE INSERT ON public.quotation_public_links FOR EACH ROW EXECUTE FUNCTION private.guard_quote_link();

CREATE FUNCTION private.guard_response() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v public.quotation_versions; link public.quotation_public_links;
BEGIN
  SELECT * INTO v FROM public.quotation_versions WHERE business_id=NEW.business_id AND id=NEW.version_id;
  SELECT * INTO link FROM public.quotation_public_links WHERE business_id=NEW.business_id AND id=NEW.public_link_id;
  IF v.state IS DISTINCT FROM 'shared' OR link.id IS NULL OR link.revoked_at IS NOT NULL
     OR (link.access_expires_at IS NOT NULL AND pg_catalog.clock_timestamp() >= link.access_expires_at)
     OR (v.response_deadline_at IS NOT NULL AND pg_catalog.clock_timestamp() >= v.response_deadline_at)
     OR NEW.responded_at < v.shared_at
     OR NEW.responded_at < link.created_at
     OR NOT EXISTS (SELECT FROM public.quotations WHERE business_id=NEW.business_id AND id=NEW.quotation_id AND current_version_id=NEW.version_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Response requires an accessible current shared quotation before its deadline';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER response_eligibility BEFORE INSERT ON public.quotation_responses FOR EACH ROW EXECUTE FUNCTION private.guard_response();

CREATE FUNCTION private.guard_number_period() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE settings_changed boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.last_issued_number IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='A new numbering period must start unused';
    END IF;
    settings_changed := true;
  ELSE
    settings_changed := ROW(NEW.starts_on,NEW.ends_before,NEW.prefix,NEW.format_template,NEW.minimum_digits,NEW.starting_number)
      IS DISTINCT FROM ROW(OLD.starts_on,OLD.ends_before,OLD.prefix,OLD.format_template,OLD.minimum_digits,OLD.starting_number);
    IF OLD.last_issued_number IS NOT NULL AND settings_changed THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Used invoice numbering settings cannot change';
    END IF;
    IF NEW.last_issued_number IS DISTINCT FROM OLD.last_issued_number THEN
      IF settings_changed OR NEW.last_issued_number IS NULL
         OR NEW.last_issued_number::numeric <> (CASE WHEN OLD.last_issued_number IS NULL THEN OLD.starting_number::numeric ELSE OLD.last_issued_number::numeric+1 END) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invoice cursor must advance by exactly the next number without changing settings';
      END IF;
    END IF;
  END IF;
  IF settings_changed THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webameen/business/'||NEW.business_id::text,0));
    IF EXISTS (
      SELECT FROM public.invoice_number_sequences p WHERE p.business_id=NEW.business_id
      AND p.period_key<>NEW.period_key AND p.starts_on < NEW.ends_before AND NEW.starts_on < p.ends_before
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invoice numbering periods cannot overlap';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER b_number_period BEFORE INSERT OR UPDATE ON public.invoice_number_sequences FOR EACH ROW EXECUTE FUNCTION private.guard_number_period();

CREATE FUNCTION private.check_number_allocation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE b uuid; period text; cursor_value bigint; largest bigint; used_number bigint;
BEGIN
  b := NEW.business_id;
  IF TG_TABLE_NAME='invoices' THEN period := NEW.numbering_period; used_number := NEW.sequence_number;
  ELSE period := NEW.period_key; used_number := NEW.last_issued_number; END IF;
  SELECT last_issued_number INTO cursor_value FROM public.invoice_number_sequences WHERE business_id=b AND period_key=period;
  SELECT max(sequence_number) INTO largest FROM public.invoices WHERE business_id=b AND numbering_period=period;
  IF cursor_value IS DISTINCT FROM largest OR (used_number IS NOT NULL AND NOT EXISTS (
    SELECT FROM public.invoices WHERE business_id=b AND numbering_period=period AND sequence_number=used_number
  )) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Every cursor advance must commit its invoice; cursor must equal greatest issued number';
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER committed_allocation AFTER INSERT OR UPDATE ON public.invoice_number_sequences DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_number_allocation();
CREATE CONSTRAINT TRIGGER committed_allocation AFTER INSERT ON public.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_number_allocation();

CREATE FUNCTION private.guard_invoice_issue() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE period public.invoice_number_sequences; version public.quotation_versions; digits text; expected_reference text;
BEGIN
  -- Conversion acquires business -> quotation -> period and advances the cursor
  -- before this insert. No sequence object, reservation RPC or nextval is used.
  SELECT * INTO period FROM public.invoice_number_sequences
  WHERE business_id=NEW.business_id AND period_key=NEW.numbering_period FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF; -- The period FK reports the missing parent.
  SELECT * INTO version FROM public.quotation_versions WHERE business_id=NEW.business_id AND id=NEW.source_version_id;
  IF version.state IS DISTINCT FROM 'approved' OR NOT EXISTS (
    SELECT FROM public.quotations WHERE business_id=NEW.business_id AND id=NEW.quotation_id AND current_version_id=NEW.source_version_id
  ) OR NOT EXISTS (
    SELECT FROM public.quotation_responses WHERE business_id=NEW.business_id AND id=NEW.approved_response_id AND version_id=NEW.source_version_id AND kind='approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invoice requires current approved quotation and exact approval';
  END IF;
  IF NEW.sequence_number IS DISTINCT FROM period.last_issued_number
     OR NEW.sequence_number < period.starting_number THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invoice number must match its transactional allocation';
  END IF;
  digits := NEW.sequence_number::text;
  digits := lpad(digits, greatest(period.minimum_digits,length(digits)), '0');
  -- Tokenize only the original template; braces inside literal values are not expanded.
  SELECT string_agg(
    CASE pieces.part[1] WHEN '{number}' THEN digits WHEN '{prefix}' THEN period.prefix
      WHEN '{period}' THEN period.period_key ELSE pieces.part[1] END, '' ORDER BY pieces.ordinal
  ) INTO expected_reference
  FROM regexp_matches(period.format_template, '([{]prefix[}]|[{]period[}]|[{]number[}]|[^{}]+)', 'g')
    WITH ORDINALITY AS pieces(part, ordinal);
  IF NEW.reference IS DISTINCT FROM expected_reference
     OR NEW.invoice_date IS DISTINCT FROM (NEW.issued_at AT TIME ZONE NEW.document_time_zone)::date
     OR NEW.invoice_date < period.starts_on OR NEW.invoice_date >= period.ends_before
     OR NEW.issued_at < version.shared_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invoice reference/date does not match frozen issuance settings';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER invoice_issue BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_issue();

CREATE FUNCTION private.check_invoice_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE b uuid; i uuid; inv public.invoices; source public.quotation_versions;
BEGIN
  b := NEW.business_id;
  IF TG_TABLE_NAME='invoices' THEN i := NEW.id; ELSE i := NEW.invoice_id; END IF;
  SELECT * INTO inv FROM public.invoices WHERE business_id=b AND id=i;
  SELECT * INTO source FROM public.quotation_versions WHERE business_id=b AND id=inv.source_version_id;
  IF ROW(inv.seller_display_name, inv.seller_contact_email, inv.seller_contact_phone, inv.seller_postal_address, inv.seller_country_code, inv.seller_state_code, inv.seller_gst_registered, inv.seller_gstin, inv.seller_logo_asset_key, inv.seller_logo_sha256, inv.seller_signature_asset_key, inv.seller_signature_sha256, inv.buyer_display_name, inv.buyer_contact_name, inv.buyer_email, inv.buyer_phone, inv.buyer_billing_address, inv.buyer_state_code, inv.buyer_gstin_applicable, inv.buyer_gstin, inv.currency_code, inv.currency_exponent, inv.quantity_scale, inv.calculation_rule_code, inv.price_tax_mode, inv.gst_auto_treatment, inv.gst_treatment_override, inv.gst_treatment, inv.document_time_zone, inv.place_of_supply_applicable, inv.place_of_supply_state_code, inv.place_of_supply_text, inv.reverse_charge_applies, inv.subtotal_minor, inv.taxable_subtotal_minor, inv.cgst_total_minor, inv.sgst_total_minor, inv.igst_total_minor, inv.gst_total_minor, inv.total_minor, inv.seller_bank_name, inv.seller_bank_account_name, inv.seller_bank_account_number, inv.seller_bank_ifsc, inv.seller_upi_id, inv.payment_instructions, inv.terms)
     IS DISTINCT FROM ROW(source.seller_display_name, source.seller_contact_email, source.seller_contact_phone, source.seller_postal_address, source.seller_country_code, source.seller_state_code, source.seller_gst_registered, source.seller_gstin, source.seller_logo_asset_key, source.seller_logo_sha256, source.seller_signature_asset_key, source.seller_signature_sha256, source.buyer_display_name, source.buyer_contact_name, source.buyer_email, source.buyer_phone, source.buyer_billing_address, source.buyer_state_code, source.buyer_gstin_applicable, source.buyer_gstin, source.currency_code, source.currency_exponent, source.quantity_scale, source.calculation_rule_code, source.price_tax_mode, source.gst_auto_treatment, source.gst_treatment_override, source.gst_treatment, source.document_time_zone, source.place_of_supply_applicable, source.place_of_supply_state_code, source.place_of_supply_text, source.reverse_charge_applies, source.subtotal_minor, source.taxable_subtotal_minor, source.cgst_total_minor, source.sgst_total_minor, source.igst_total_minor, source.gst_total_minor, source.total_minor, source.seller_bank_name, source.seller_bank_account_name, source.seller_bank_account_number, source.seller_bank_ifsc, source.seller_upi_id, source.payment_instructions, source.terms) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Every invoice document field must equal its approved snapshot';
  END IF;
  IF NOT EXISTS (SELECT FROM public.invoice_items WHERE business_id=b AND invoice_id=i) OR EXISTS (
    SELECT FROM
      (SELECT * FROM public.quotation_items WHERE business_id=b AND version_id=inv.source_version_id) q
      FULL JOIN (SELECT * FROM public.invoice_items WHERE business_id=b AND invoice_id=i) n
      ON q.id=n.source_quotation_item_id
    WHERE q.id IS NULL OR n.id IS NULL OR q.position IS DISTINCT FROM n.position
       OR ROW(q.description, q.unit_label, q.hsn_sac, q.quantity, q.unit_price_minor, q.line_subtotal_minor, q.gst_category, q.gst_treatment, q.gst_rate, q.taxable_amount_minor, q.cgst_rate, q.cgst_amount_minor, q.sgst_rate, q.sgst_amount_minor, q.igst_rate, q.igst_amount_minor, q.line_total_minor)
          IS DISTINCT FROM ROW(n.description, n.unit_label, n.hsn_sac, n.quantity, n.unit_price_minor, n.line_subtotal_minor, n.gst_category, n.gst_treatment, n.gst_rate, n.taxable_amount_minor, n.cgst_rate, n.cgst_amount_minor, n.sgst_rate, n.sgst_amount_minor, n.igst_rate, n.igst_amount_minor, n.line_total_minor)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invoice source IDs, positions and every line field must match exactly';
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER invoice_snapshot AFTER INSERT ON public.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_invoice_snapshot();
CREATE CONSTRAINT TRIGGER invoice_snapshot AFTER INSERT ON public.invoice_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_invoice_snapshot();

CREATE FUNCTION private.guard_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE inv public.invoices; paid numeric;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/business/'||NEW.business_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webameen/invoice/'||NEW.business_id::text||'/'||NEW.invoice_id::text,0));
  SELECT * INTO inv FROM public.invoices WHERE business_id=NEW.business_id AND id=NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF; -- Let the composite FK reject a wrong business/parent.
  SELECT coalesce(sum(p.amount_minor),0) INTO paid FROM public.payments p
  WHERE p.business_id=NEW.business_id AND p.invoice_id=NEW.invoice_id AND NOT EXISTS (
    SELECT FROM public.payment_reversals r WHERE r.business_id=p.business_id AND r.payment_id=p.id
  );
  IF NEW.received_at < inv.issued_at OR NEW.received_at > pg_catalog.clock_timestamp()
     OR ROW(NEW.currency_code,NEW.currency_exponent) IS DISTINCT FROM ROW(inv.currency_code,inv.currency_exponent)
     OR paid+NEW.amount_minor::numeric > inv.total_minor::numeric THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Payment time/currency is invalid or payment exceeds outstanding amount';
  END IF;
  IF NEW.replaces_payment_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM public.payments p JOIN public.payment_reversals r
      ON r.business_id=p.business_id AND r.invoice_id=p.invoice_id AND r.payment_id=p.id
    WHERE p.business_id=NEW.business_id AND p.invoice_id=NEW.invoice_id AND p.id=NEW.replaces_payment_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Replacement requires a reversed predecessor on the same invoice';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER payment_validity BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.guard_payment();

CREATE FUNCTION private.guard_reversal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE original public.payments;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/business/'||NEW.business_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webameen/invoice/'||NEW.business_id::text||'/'||NEW.invoice_id::text,0));
  SELECT * INTO original FROM public.payments WHERE business_id=NEW.business_id AND invoice_id=NEW.invoice_id AND id=NEW.payment_id;
  IF FOUND AND NEW.reversed_at < original.recorded_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Reversal cannot precede payment recording';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER reversal_validity BEFORE INSERT ON public.payment_reversals FOR EACH ROW EXECUTE FUNCTION private.guard_reversal();

CREATE FUNCTION private.check_receipt_completeness() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE original public.payments; receipt public.receipts; predecessor_receipt uuid; b uuid; p uuid;
BEGIN
  b:=NEW.business_id;
  IF TG_TABLE_NAME='payments' THEN p:=NEW.id; ELSE p:=NEW.payment_id; END IF;
  SELECT * INTO original FROM public.payments WHERE business_id=b AND id=p;
  SELECT * INTO receipt FROM public.receipts WHERE business_id=b AND payment_id=p;
  IF original.replaces_payment_id IS NOT NULL THEN
    SELECT id INTO predecessor_receipt FROM public.receipts WHERE business_id=b AND invoice_id=original.invoice_id AND payment_id=original.replaces_payment_id;
  END IF;
  IF receipt.id IS NULL OR ROW(receipt.invoice_id,receipt.amount_minor,receipt.currency_code,receipt.currency_exponent,receipt.issued_by)
     IS DISTINCT FROM ROW(original.invoice_id,original.amount_minor,original.currency_code,original.currency_exponent,original.created_by)
     OR receipt.issued_at < original.recorded_at
     OR receipt.replaces_receipt_id IS DISTINCT FROM predecessor_receipt
     OR (original.replaces_payment_id IS NOT NULL AND predecessor_receipt IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Payment requires exactly one matching receipt with matching predecessor';
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER receipt_completeness AFTER INSERT ON public.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_receipt_completeness();
CREATE CONSTRAINT TRIGGER receipt_completeness AFTER INSERT ON public.receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_receipt_completeness();

-- Pre-coercion quantity validation for the future typed draft command.
-- A CHECK on numeric(18,6) alone cannot see digits already rounded by its typmod.
CREATE FUNCTION private.validate_quantity(value numeric) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF NOT (value > 0 AND value < 'Infinity'::numeric AND value = round(value,3))
     OR value >= 1000000000000 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Quantity must be positive, within storage range and have at most three decimals';
  END IF;
  RETURN value;
END
$fn$;

CREATE FUNCTION private.lock_gst_configuration() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webameen/gst-options',0));
  RETURN NULL;
END
$fn$;
CREATE TRIGGER a_config_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.gst_rate_options
FOR EACH STATEMENT EXECUTE FUNCTION private.lock_gst_configuration();

CREATE FUNCTION private.guard_catalog_rate() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP='INSERT' OR ROW(NEW.default_gst_category,NEW.default_gst_rate)
      IS DISTINCT FROM ROW(OLD.default_gst_category,OLD.default_gst_rate) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/gst-options',0));
    IF NEW.default_gst_category='taxable' AND NOT EXISTS (
      SELECT FROM public.gst_rate_options WHERE rate=NEW.default_gst_rate AND selectable
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Select a currently configured catalog GST rate';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER b_catalog_rate BEFORE INSERT OR UPDATE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION private.guard_catalog_rate();

CREATE FUNCTION private.lock_membership_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webameen/business/'||NEW.business_id::text,0));
  RETURN NEW;
END
$fn$;
CREATE TRIGGER b_membership_lock BEFORE UPDATE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION private.lock_membership_change();

-- Read access is available; no workflow RPC is exposed by this foundation.
-- Broker roles remain inaccessible and have no base-table grants until their
-- token-authorized operations are implemented in the corresponding phases.
GRANT USAGE ON SCHEMA public, private, auth TO webameen_executor;
GRANT EXECUTE ON FUNCTION auth.uid() TO webameen_executor;
GRANT SELECT (id, email_confirmed_at) ON auth.users TO webameen_executor;
GRANT USAGE ON SCHEMA public TO authenticated;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.businesses FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.businesses TO authenticated, webameen_executor;
CREATE POLICY businesses_read ON public.businesses FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = businesses.id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.businesses TO webameen_executor;
CREATE POLICY businesses_insert ON public.businesses FOR INSERT TO webameen_executor WITH CHECK (created_by = (SELECT auth.uid()));
GRANT UPDATE (display_name, contact_email, contact_phone, postal_address, state_code, gst_registered, gstin, logo_asset_key, logo_sha256, signature_asset_key, signature_sha256, bank_name, bank_account_name, bank_account_number, bank_ifsc, upi_id, payment_instructions, default_terms, time_zone, updated_at) ON public.businesses TO webameen_executor;
CREATE POLICY businesses_update ON public.businesses FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = businesses.id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = businesses.id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memberships FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_memberships FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.business_memberships TO authenticated, webameen_executor;
CREATE POLICY business_memberships_read ON public.business_memberships FOR SELECT TO authenticated, webameen_executor USING (user_id = (SELECT auth.uid()));
GRANT INSERT ON public.business_memberships TO webameen_executor;
CREATE POLICY business_memberships_insert ON public.business_memberships FOR INSERT TO webameen_executor WITH CHECK (user_id = (SELECT auth.uid()) AND role = 'owner' AND disabled_at IS NULL);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.customers TO authenticated, webameen_executor;
CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = customers.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.customers TO webameen_executor;
CREATE POLICY customers_insert ON public.customers FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = customers.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));
GRANT UPDATE (display_name, contact_name, email, phone, billing_address, state_code, gstin_applicable, gstin, private_note, archived_at, archived_by, updated_at) ON public.customers TO webameen_executor;
CREATE POLICY customers_update ON public.customers FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = customers.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = customers.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_items FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.catalog_items TO authenticated, webameen_executor;
CREATE POLICY catalog_items_read ON public.catalog_items FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = catalog_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.catalog_items TO webameen_executor;
CREATE POLICY catalog_items_insert ON public.catalog_items FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = catalog_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));
GRANT UPDATE (kind, name, description, unit_label, default_unit_price_minor, default_gst_category, default_gst_rate, hsn_sac, archived_at, archived_by, updated_at) ON public.catalog_items TO webameen_executor;
CREATE POLICY catalog_items_update ON public.catalog_items FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = catalog_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = catalog_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quotations FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.quotations TO authenticated, webameen_executor;
CREATE POLICY quotations_read ON public.quotations FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotations.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.quotations TO webameen_executor;
CREATE POLICY quotations_insert ON public.quotations FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotations.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));
GRANT UPDATE (current_version_id, updated_at) ON public.quotations TO webameen_executor;
CREATE POLICY quotations_update ON public.quotations FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotations.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotations.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT DELETE ON public.quotations TO webameen_executor;
CREATE POLICY quotations_delete ON public.quotations FOR DELETE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotations.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.quotation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quotation_versions FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.quotation_versions TO authenticated, webameen_executor;
CREATE POLICY quotation_versions_read ON public.quotation_versions FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_versions.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.quotation_versions TO webameen_executor;
CREATE POLICY quotation_versions_insert ON public.quotation_versions FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_versions.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));
GRANT UPDATE (seller_display_name, seller_contact_email, seller_contact_phone, seller_postal_address, seller_country_code, seller_state_code, seller_gst_registered, seller_gstin, seller_logo_asset_key, seller_logo_sha256, seller_signature_asset_key, seller_signature_sha256, buyer_display_name, buyer_contact_name, buyer_email, buyer_phone, buyer_billing_address, buyer_state_code, buyer_gstin_applicable, buyer_gstin, currency_code, currency_exponent, quantity_scale, calculation_rule_code, price_tax_mode, gst_auto_treatment, gst_treatment_override, gst_treatment, document_time_zone, place_of_supply_applicable, place_of_supply_state_code, place_of_supply_text, reverse_charge_applies, subtotal_minor, taxable_subtotal_minor, cgst_total_minor, sgst_total_minor, igst_total_minor, gst_total_minor, total_minor, seller_bank_name, seller_bank_account_name, seller_bank_account_number, seller_bank_ifsc, seller_upi_id, payment_instructions, terms, state, edit_sequence, valid_until, response_deadline_at, edited_at, shared_by, shared_at, superseded_by, superseded_at) ON public.quotation_versions TO webameen_executor;
CREATE POLICY quotation_versions_update ON public.quotation_versions FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_versions.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_versions.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT DELETE ON public.quotation_versions TO webameen_executor;
CREATE POLICY quotation_versions_delete ON public.quotation_versions FOR DELETE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_versions.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quotation_items FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.quotation_items TO authenticated, webameen_executor;
CREATE POLICY quotation_items_read ON public.quotation_items FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.quotation_items TO webameen_executor;
CREATE POLICY quotation_items_insert ON public.quotation_items FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT UPDATE (source_catalog_item_id, position, description, unit_label, hsn_sac, quantity, unit_price_minor, line_subtotal_minor, gst_category, gst_treatment, gst_rate, taxable_amount_minor, cgst_rate, cgst_amount_minor, sgst_rate, sgst_amount_minor, igst_rate, igst_amount_minor, line_total_minor) ON public.quotation_items TO webameen_executor;
CREATE POLICY quotation_items_update ON public.quotation_items FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT DELETE ON public.quotation_items TO webameen_executor;
CREATE POLICY quotation_items_delete ON public.quotation_items FOR DELETE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.quotation_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_public_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quotation_public_links FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.quotation_public_links TO authenticated, webameen_executor;
CREATE POLICY quotation_public_links_read ON public.quotation_public_links FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.quotation_public_links TO webameen_executor;
CREATE POLICY quotation_public_links_insert ON public.quotation_public_links FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));
GRANT UPDATE (revoked_by, revoked_at, revocation_reason) ON public.quotation_public_links TO webameen_executor;
CREATE POLICY quotation_public_links_update ON public.quotation_public_links FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.quotation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_responses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quotation_responses FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.quotation_responses TO authenticated, webameen_executor;
CREATE POLICY quotation_responses_read ON public.quotation_responses FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = quotation_responses.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoices FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.invoices TO authenticated, webameen_executor;
CREATE POLICY invoices_read ON public.invoices FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoices.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.invoices TO webameen_executor;
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoices.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_items FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.invoice_items TO authenticated, webameen_executor;
CREATE POLICY invoice_items_read ON public.invoice_items FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.invoice_items TO webameen_executor;
CREATE POLICY invoice_items_insert ON public.invoice_items FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_items.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.payments TO authenticated, webameen_executor;
CREATE POLICY payments_read ON public.payments FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = payments.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.payments TO webameen_executor;
CREATE POLICY payments_insert ON public.payments FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = payments.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));

ALTER TABLE public.payment_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reversals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_reversals FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.payment_reversals TO authenticated, webameen_executor;
CREATE POLICY payment_reversals_read ON public.payment_reversals FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = payment_reversals.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.payment_reversals TO webameen_executor;
CREATE POLICY payment_reversals_insert ON public.payment_reversals FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = payment_reversals.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND reversed_by = (SELECT auth.uid()));

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.receipts FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.receipts TO authenticated, webameen_executor;
CREATE POLICY receipts_read ON public.receipts FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = receipts.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.receipts TO webameen_executor;
CREATE POLICY receipts_insert ON public.receipts FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = receipts.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND issued_by = (SELECT auth.uid()));

ALTER TABLE public.invoice_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_public_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_public_links FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.invoice_public_links TO authenticated, webameen_executor;
CREATE POLICY invoice_public_links_read ON public.invoice_public_links FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.invoice_public_links TO webameen_executor;
CREATE POLICY invoice_public_links_insert ON public.invoice_public_links FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));
GRANT UPDATE (revoked_by, revoked_at, revocation_reason) ON public.invoice_public_links TO webameen_executor;
CREATE POLICY invoice_public_links_update ON public.invoice_public_links FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_public_links.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_number_sequences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_number_sequences FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.invoice_number_sequences TO authenticated, webameen_executor;
CREATE POLICY invoice_number_sequences_read ON public.invoice_number_sequences FOR SELECT TO authenticated, webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_number_sequences.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));
GRANT INSERT ON public.invoice_number_sequences TO webameen_executor;
CREATE POLICY invoice_number_sequences_insert ON public.invoice_number_sequences FOR INSERT TO webameen_executor WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_number_sequences.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL) AND created_by = (SELECT auth.uid()));
GRANT UPDATE (starts_on, ends_before, prefix, format_template, minimum_digits, starting_number, last_issued_number, updated_at) ON public.invoice_number_sequences TO webameen_executor;
CREATE POLICY invoice_number_sequences_update ON public.invoice_number_sequences FOR UPDATE TO webameen_executor USING (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_number_sequences.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships membership WHERE membership.user_id = (SELECT auth.uid()) AND membership.business_id = invoice_number_sequences.business_id AND membership.role = 'owner' AND membership.disabled_at IS NULL));

ALTER TABLE public.gst_rate_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_rate_options FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gst_rate_options FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker, webameen_invoice_broker;
GRANT SELECT ON public.gst_rate_options TO authenticated, webameen_executor;
CREATE POLICY gst_rate_options_read ON public.gst_rate_options FOR SELECT TO authenticated, webameen_executor USING (true);

-- Transfer integrity-function ownership without leaving schema CREATE privileges.
GRANT CREATE ON SCHEMA private TO webameen_executor;
-- PostgreSQL 17 requires SET membership to transfer function ownership. This
-- temporary membership belongs only to the migration operator and is revoked
-- below in the same transaction; runtime identities never receive membership.
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.reject_mutation() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.reject_mutation() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_fixed_columns() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_fixed_columns() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_link_revocation() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_link_revocation() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_version() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_version() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_quotation_item() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_quotation_item() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_quotation_purge() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_quotation_purge() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.check_quotation_integrity() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.check_quotation_integrity() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_new_share() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_new_share() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.check_share_link() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.check_share_link() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_quote_link() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_quote_link() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_response() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_response() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_number_period() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_number_period() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.check_number_allocation() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.check_number_allocation() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_invoice_issue() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_invoice_issue() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.check_invoice_snapshot() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.check_invoice_snapshot() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_payment() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_payment() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_reversal() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_reversal() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.check_receipt_completeness() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.check_receipt_completeness() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.validate_quantity(numeric) OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.validate_quantity(numeric) FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.lock_gst_configuration() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.lock_gst_configuration() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.guard_catalog_rate() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.guard_catalog_rate() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
ALTER FUNCTION private.lock_membership_change() OWNER TO webameen_executor;
REVOKE ALL ON FUNCTION private.lock_membership_change() FROM PUBLIC, anon, authenticated, service_role, webameen_quote_broker, webameen_invoice_broker;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE CREATE ON SCHEMA public FROM webameen_executor, webameen_quote_broker, webameen_invoice_broker;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
