BEGIN;

-- All monetary arithmetic stays numeric until its checked conversion to
-- integer paise. Neither preview nor save accepts caller-supplied totals.
CREATE FUNCTION private.calculate_quotation_draft(
  p_business_id uuid, p_snapshot jsonb, p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_seller_state text := NULLIF(pg_catalog.btrim(p_snapshot->>'seller_state_code'), '');
  v_buyer_state text := NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_state_code'), '');
  v_override text := NULLIF(pg_catalog.btrim(p_snapshot->>'gst_treatment_override'), '');
  v_auto text;
  v_route text;
  v_line jsonb;
  v_result_lines jsonb := '[]'::jsonb;
  v_position integer := 0;
  v_description text;
  v_unit text;
  v_hsn text;
  v_source uuid;
  v_quantity_text text;
  v_price_text text;
  v_rate_text text;
  v_category text;
  v_quantity numeric;
  v_price numeric;
  v_rate numeric;
  v_cgst_rate numeric;
  v_sgst_rate numeric;
  v_igst_rate numeric;
  v_base numeric;
  v_taxable numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_taxable_total numeric := 0;
  v_cgst_total numeric := 0;
  v_sgst_total numeric := 0;
  v_igst_total numeric := 0;
  v_max numeric := 9223372036854775807;
BEGIN
  IF p_snapshot IS NULL OR pg_catalog.jsonb_typeof(p_snapshot) <> 'object'
    OR p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
    OR pg_catalog.jsonb_array_length(p_lines) > 100
  THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation draft input';
  END IF;
  IF (v_seller_state IS NOT NULL AND v_seller_state NOT IN
    ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','26','27','29','30','31','32','33','34','35','36','37','38'))
    OR (v_buyer_state IS NOT NULL AND v_buyer_state NOT IN
    ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','26','27','29','30','31','32','33','34','35','36','37','38'))
    OR (v_override IS NOT NULL AND v_override NOT IN ('cgst_sgst','igst'))
  THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation state or GST route';
  END IF;
  IF v_seller_state IS NOT NULL AND v_buyer_state IS NOT NULL THEN
    v_auto := CASE WHEN v_seller_state=v_buyer_state THEN 'cgst_sgst' ELSE 'igst' END;
  END IF;
  v_route := COALESCE(v_override,v_auto);
  IF pg_catalog.jsonb_array_length(p_lines)>0 AND v_auto IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Seller and buyer states are required for lines';
  END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_position := v_position + 1;
    IF pg_catalog.jsonb_typeof(v_line)<>'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation line';
    END IF;
    v_description := NULLIF(pg_catalog.btrim(v_line->>'description'),'');
    v_unit := NULLIF(pg_catalog.btrim(v_line->>'unit_label'),'');
    v_hsn := NULLIF(pg_catalog.btrim(v_line->>'hsn_sac'),'');
    v_quantity_text := pg_catalog.btrim(v_line->>'quantity');
    v_price_text := pg_catalog.btrim(v_line->>'unit_price_minor');
    v_rate_text := NULLIF(pg_catalog.btrim(v_line->>'gst_rate'),'');
    v_category := v_line->>'gst_category';
    IF v_description IS NULL OR v_unit IS NULL OR pg_catalog.length(v_description)>10000
      OR pg_catalog.length(v_unit)>1000 OR pg_catalog.length(COALESCE(v_hsn,''))>1000
      OR v_quantity_text IS NULL OR v_quantity_text !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
      OR v_price_text IS NULL OR v_price_text !~ '^[0-9]{1,19}$'
      OR v_category NOT IN ('taxable','exempt','no_gst')
    THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation line input';
    END IF;
    v_quantity := v_quantity_text::numeric;
    v_price := v_price_text::numeric;
    IF v_quantity<=0 OR v_quantity>999999999999.999 OR v_price>v_max THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Quantity or price is out of range';
    END IF;
    v_source := NULL;
    IF NULLIF(v_line->>'source_catalog_item_id','') IS NOT NULL THEN
      IF (v_line->>'source_catalog_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid catalog source';
      END IF;
      v_source := (v_line->>'source_catalog_item_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.catalog_items AS c
        WHERE c.business_id=p_business_id AND c.id=v_source) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Catalog source unavailable';
      END IF;
    END IF;
    v_base := pg_catalog.floor(v_quantity*v_price+0.5);
    v_taxable := 0; v_rate := NULL; v_cgst_rate := NULL; v_sgst_rate := NULL;
    v_igst_rate := NULL; v_cgst := 0; v_sgst := 0; v_igst := 0;
    IF v_category='taxable' THEN
      IF v_rate_text IS NULL OR pg_catalog.length(v_rate_text)>80
        OR v_rate_text !~ '^[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Select a configured GST rate';
      END IF;
      v_rate := v_rate_text::numeric;
      IF v_rate>100 OR NOT EXISTS (SELECT 1 FROM public.gst_rate_options AS r
          WHERE r.rate=v_rate AND r.selectable) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Select a currently configured GST rate';
      END IF;
      v_taxable := v_base;
      IF v_route='cgst_sgst' THEN
        v_cgst_rate := v_rate/2; v_sgst_rate := v_rate/2;
        v_cgst := pg_catalog.floor(v_taxable*v_cgst_rate/100+0.5);
        v_sgst := pg_catalog.floor(v_taxable*v_sgst_rate/100+0.5);
      ELSE
        v_igst_rate := v_rate;
        v_igst := pg_catalog.floor(v_taxable*v_igst_rate/100+0.5);
      END IF;
    ELSIF v_rate_text IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GST rate applies only to taxable lines';
    END IF;
    v_line_total := v_base+v_cgst+v_sgst+v_igst;
    v_subtotal := v_subtotal+v_base; v_taxable_total := v_taxable_total+v_taxable;
    v_cgst_total := v_cgst_total+v_cgst; v_sgst_total := v_sgst_total+v_sgst;
    v_igst_total := v_igst_total+v_igst;
    IF v_line_total>v_max OR v_subtotal+v_cgst_total+v_sgst_total+v_igst_total>v_max THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Quotation amount is out of range';
    END IF;
    v_result_lines := v_result_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_catalog_item_id',v_source,'position',v_position,'description',v_description,
      'unit_label',v_unit,'hsn_sac',v_hsn,'quantity',v_quantity::text,
      'unit_price_minor',v_price::text,'line_subtotal_minor',v_base::text,
      'gst_category',v_category,
      'gst_treatment',CASE WHEN v_category='taxable' THEN v_route ELSE 'none' END,
      'gst_rate',v_rate::text,'taxable_amount_minor',v_taxable::text,
      'cgst_rate',v_cgst_rate::text,'cgst_amount_minor',v_cgst::text,
      'sgst_rate',v_sgst_rate::text,'sgst_amount_minor',v_sgst::text,
      'igst_rate',v_igst_rate::text,'igst_amount_minor',v_igst::text,
      'line_total_minor',v_line_total::text
    ));
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'auto_treatment',v_auto,'treatment',v_route,'lines',v_result_lines,
    'subtotal_minor',v_subtotal::text,'taxable_subtotal_minor',v_taxable_total::text,
    'cgst_total_minor',v_cgst_total::text,'sgst_total_minor',v_sgst_total::text,
    'igst_total_minor',v_igst_total::text,
    'gst_total_minor',(v_cgst_total+v_sgst_total+v_igst_total)::text,
    'total_minor',(v_subtotal+v_cgst_total+v_sgst_total+v_igst_total)::text
  );
END
$fn$;

CREATE FUNCTION private.create_quotation_draft(p_request_key uuid,p_customer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_customer_id uuid;
  v_version_id uuid := pg_catalog.gen_random_uuid();
  v_business public.businesses;
  v_customer public.customers;
BEGIN
  IF v_user_id IS NULL OR p_request_key IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Authenticated owner and customer required';
  END IF;
  SELECT business_id INTO v_business_id FROM public.business_memberships WHERE user_id=v_user_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/business/'||v_business_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.business_memberships WHERE user_id=v_user_id
    AND business_id=v_business_id AND role='owner' AND disabled_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webameen/quote-create/'||p_request_key::text,0));
  SELECT customer_id INTO v_customer_id FROM public.quotations
  WHERE id=p_request_key AND business_id=v_business_id;
  IF FOUND THEN
    IF v_customer_id<>p_customer_id THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Creation key belongs to a different customer';
    END IF;
    RETURN p_request_key;
  END IF;
  SELECT * INTO v_customer FROM public.customers
  WHERE id=p_customer_id AND business_id=v_business_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Select an active customer'; END IF;
  SELECT * INTO v_business FROM public.businesses WHERE id=v_business_id;
  INSERT INTO public.quotations(id,business_id,customer_id,reference,current_version_id,created_by)
  VALUES(p_request_key,v_business_id,p_customer_id,'Q-'||p_request_key::text,v_version_id,v_user_id);
  INSERT INTO public.quotation_versions(
    id,business_id,quotation_id,version_number,created_by,
    seller_display_name,seller_contact_email,seller_contact_phone,seller_postal_address,
    seller_country_code,seller_state_code,seller_gst_registered,seller_gstin,
    seller_logo_asset_key,seller_logo_sha256,seller_signature_asset_key,seller_signature_sha256,
    buyer_display_name,buyer_contact_name,buyer_email,buyer_phone,buyer_billing_address,
    buyer_state_code,buyer_gstin_applicable,buyer_gstin,currency_code,currency_exponent,
    quantity_scale,calculation_rule_code,price_tax_mode,gst_auto_treatment,gst_treatment,
    document_time_zone
  ) VALUES (
    v_version_id,v_business_id,p_request_key,1,v_user_id,
    v_business.display_name,v_business.contact_email,v_business.contact_phone,v_business.postal_address,
    'IN',v_business.state_code,v_business.gst_registered,v_business.gstin,
    v_business.logo_asset_key,v_business.logo_sha256,v_business.signature_asset_key,v_business.signature_sha256,
    v_customer.display_name,v_customer.contact_name,v_customer.email,v_customer.phone,v_customer.billing_address,
    v_customer.state_code,v_customer.gstin_applicable,v_customer.gstin,'INR',2,
    3,'in-gst-exclusive-line-paise-half-up-v1','exclusive',
    CASE WHEN v_business.state_code IS NULL OR v_customer.state_code IS NULL THEN NULL
      WHEN v_business.state_code=v_customer.state_code THEN 'cgst_sgst' ELSE 'igst' END,
    CASE WHEN v_business.state_code IS NULL OR v_customer.state_code IS NULL THEN NULL
      WHEN v_business.state_code=v_customer.state_code THEN 'cgst_sgst' ELSE 'igst' END,
    v_business.time_zone
  );
  RETURN p_request_key;
END
$fn$;

CREATE FUNCTION private.preview_quotation_draft(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_user_id uuid := auth.uid(); v_business_id uuid; v_quote public.quotations; v_version public.quotation_versions;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Authentication required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/gst-options',0));
  SELECT business_id INTO v_business_id FROM public.business_memberships WHERE user_id=v_user_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/business/'||v_business_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.business_memberships WHERE user_id=v_user_id AND business_id=v_business_id AND role='owner' AND disabled_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required';
  END IF;
  SELECT * INTO v_quote FROM public.quotations WHERE business_id=v_business_id AND id=p_quotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Quotation unavailable'; END IF;
  SELECT * INTO v_version FROM public.quotation_versions WHERE business_id=v_business_id AND id=v_quote.current_version_id;
  IF v_version.state<>'draft' OR v_version.shared_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Only the current draft can be previewed';
  END IF;
  IF p_expected_edit_sequence IS DISTINCT FROM v_version.edit_sequence THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Draft changed; reload before editing';
  END IF;
  RETURN private.calculate_quotation_draft(v_business_id,p_snapshot,p_lines);
END
$fn$;

CREATE FUNCTION private.save_quotation_draft(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_quote public.quotations;
  v_version public.quotation_versions;
  v_calc jsonb;
  v_line jsonb;
  v_zone text;
  v_valid_text text;
  v_valid_until date;
  v_seller_gstin text;
  v_buyer_gstin text;
  v_seller_registered boolean;
  v_buyer_applicable boolean;
  v_supply_applicable boolean;
  v_reverse_charge boolean;
  v_supply_state text;
  v_seller_email text;
  v_buyer_email text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Authentication required'; END IF;
  -- Rate choices are checked while this lock is held. No later command may
  -- acquire it after a business or quotation lock.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/gst-options',0));
  SELECT business_id INTO v_business_id FROM public.business_memberships WHERE user_id=v_user_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/business/'||v_business_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.business_memberships WHERE user_id=v_user_id AND business_id=v_business_id AND role='owner' AND disabled_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required';
  END IF;
  SELECT * INTO v_quote FROM public.quotations WHERE business_id=v_business_id AND id=p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Quotation unavailable'; END IF;
  SELECT * INTO v_version FROM public.quotation_versions WHERE business_id=v_business_id AND id=v_quote.current_version_id;
  IF v_version.state<>'draft' OR v_version.shared_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Only the current draft can be edited';
  END IF;
  IF p_expected_edit_sequence IS DISTINCT FROM v_version.edit_sequence THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Draft changed; reload before editing';
  END IF;
  IF v_version.edit_sequence=2147483647 OR p_snapshot IS NULL OR pg_catalog.jsonb_typeof(p_snapshot)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid draft input';
  END IF;
  v_calc := private.calculate_quotation_draft(v_business_id,p_snapshot,p_lines);
  v_zone := NULLIF(pg_catalog.btrim(p_snapshot->>'document_time_zone'),'');
  IF v_zone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_zone) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Select a valid document time zone';
  END IF;
  v_valid_text := NULLIF(pg_catalog.btrim(p_snapshot->>'valid_until'),'');
  IF v_valid_text IS NOT NULL THEN
    IF v_valid_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid validity date';
    END IF;
    v_valid_until := v_valid_text::date;
  END IF;
  IF COALESCE(p_snapshot->>'seller_gst_registered','') NOT IN ('','true','false')
    OR COALESCE(p_snapshot->>'buyer_gstin_applicable','') NOT IN ('','true','false')
    OR COALESCE(p_snapshot->>'place_of_supply_applicable','') NOT IN ('','true','false')
    OR COALESCE(p_snapshot->>'reverse_charge_applies','') NOT IN ('','true','false') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document declaration';
  END IF;
  v_seller_registered := (p_snapshot->>'seller_gst_registered')::boolean;
  v_buyer_applicable := (p_snapshot->>'buyer_gstin_applicable')::boolean;
  v_supply_applicable := (p_snapshot->>'place_of_supply_applicable')::boolean;
  v_reverse_charge := (p_snapshot->>'reverse_charge_applies')::boolean;
  v_seller_gstin := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_snapshot->>'seller_gstin')),'');
  v_buyer_gstin := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_snapshot->>'buyer_gstin')),'');
  IF (v_seller_gstin IS NOT NULL AND v_seller_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$')
    OR (v_buyer_gstin IS NOT NULL AND v_buyer_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid GSTIN format';
  END IF;
  v_supply_state := NULLIF(pg_catalog.btrim(p_snapshot->>'place_of_supply_state_code'),'');
  IF v_supply_state IS NOT NULL AND v_supply_state NOT IN
    ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','26','27','29','30','31','32','33','34','35','36','37','38') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid place of supply state';
  END IF;
  IF v_supply_applicable IS DISTINCT FROM TRUE THEN v_supply_state := NULL; END IF;
  v_seller_email := NULLIF(pg_catalog.btrim(p_snapshot->>'seller_contact_email'),'');
  v_buyer_email := NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_email'),'');
  IF (v_seller_email IS NOT NULL AND v_seller_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    OR (v_buyer_email IS NOT NULL AND v_buyer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document email';
  END IF;

  UPDATE public.quotation_versions SET
    seller_display_name=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_display_name'),''),
    seller_contact_email=v_seller_email,
    seller_contact_phone=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_contact_phone'),''),
    seller_postal_address=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_postal_address'),''),
    seller_state_code=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_state_code'),''),
    seller_gst_registered=v_seller_registered,seller_gstin=v_seller_gstin,
    buyer_display_name=NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_display_name'),''),
    buyer_contact_name=NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_contact_name'),''),
    buyer_email=v_buyer_email,buyer_phone=NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_phone'),''),
    buyer_billing_address=NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_billing_address'),''),
    buyer_state_code=NULLIF(pg_catalog.btrim(p_snapshot->>'buyer_state_code'),''),
    buyer_gstin_applicable=v_buyer_applicable,buyer_gstin=v_buyer_gstin,
    gst_auto_treatment=v_calc->>'auto_treatment',
    gst_treatment_override=NULLIF(pg_catalog.btrim(p_snapshot->>'gst_treatment_override'),''),
    gst_treatment=v_calc->>'treatment',document_time_zone=v_zone,
    place_of_supply_applicable=v_supply_applicable,
    place_of_supply_state_code=v_supply_state,
    place_of_supply_text=CASE WHEN v_supply_applicable IS TRUE THEN NULLIF(pg_catalog.btrim(p_snapshot->>'place_of_supply_text'),'') ELSE NULL END,
    reverse_charge_applies=v_reverse_charge,
    valid_until=v_valid_until,response_deadline_at=NULL,
    seller_bank_name=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_bank_name'),''),
    seller_bank_account_name=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_bank_account_name'),''),
    seller_bank_account_number=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_bank_account_number'),''),
    seller_bank_ifsc=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_bank_ifsc'),''),
    seller_upi_id=NULLIF(pg_catalog.btrim(p_snapshot->>'seller_upi_id'),''),
    payment_instructions=NULLIF(pg_catalog.btrim(p_snapshot->>'payment_instructions'),''),
    terms=NULLIF(pg_catalog.btrim(p_snapshot->>'terms'),''),
    subtotal_minor=(v_calc->>'subtotal_minor')::bigint,
    taxable_subtotal_minor=(v_calc->>'taxable_subtotal_minor')::bigint,
    cgst_total_minor=(v_calc->>'cgst_total_minor')::bigint,
    sgst_total_minor=(v_calc->>'sgst_total_minor')::bigint,
    igst_total_minor=(v_calc->>'igst_total_minor')::bigint,
    gst_total_minor=(v_calc->>'gst_total_minor')::bigint,
    total_minor=(v_calc->>'total_minor')::bigint,
    edit_sequence=v_version.edit_sequence+1,edited_at=pg_catalog.clock_timestamp()
  WHERE business_id=v_business_id AND id=v_version.id;
  DELETE FROM public.quotation_items WHERE business_id=v_business_id AND version_id=v_version.id;
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_calc->'lines') LOOP
    INSERT INTO public.quotation_items(
      business_id,version_id,source_catalog_item_id,position,description,unit_label,hsn_sac,
      quantity,unit_price_minor,line_subtotal_minor,gst_category,gst_treatment,gst_rate,
      taxable_amount_minor,cgst_rate,cgst_amount_minor,sgst_rate,sgst_amount_minor,
      igst_rate,igst_amount_minor,line_total_minor
    ) VALUES (
      v_business_id,v_version.id,(v_line->>'source_catalog_item_id')::uuid,(v_line->>'position')::integer,
      v_line->>'description',v_line->>'unit_label',v_line->>'hsn_sac',
      (v_line->>'quantity')::numeric,(v_line->>'unit_price_minor')::bigint,(v_line->>'line_subtotal_minor')::bigint,
      v_line->>'gst_category',v_line->>'gst_treatment',(v_line->>'gst_rate')::numeric,
      (v_line->>'taxable_amount_minor')::bigint,(v_line->>'cgst_rate')::numeric,(v_line->>'cgst_amount_minor')::bigint,
      (v_line->>'sgst_rate')::numeric,(v_line->>'sgst_amount_minor')::bigint,
      (v_line->>'igst_rate')::numeric,(v_line->>'igst_amount_minor')::bigint,(v_line->>'line_total_minor')::bigint
    );
  END LOOP;
  UPDATE public.quotations SET updated_at=pg_catalog.clock_timestamp()
  WHERE business_id=v_business_id AND id=v_quote.id;
  RETURN v_calc || pg_catalog.jsonb_build_object('edit_sequence',v_version.edit_sequence+1);
END
$fn$;

CREATE FUNCTION public.create_quotation_draft(p_request_key uuid,p_customer_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.create_quotation_draft($1,$2) $fn$;
CREATE FUNCTION public.preview_quotation_draft(p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.preview_quotation_draft($1,$2,$3,$4) $fn$;
CREATE FUNCTION public.save_quotation_draft(p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.save_quotation_draft($1,$2,$3,$4) $fn$;

REVOKE ALL ON FUNCTION private.calculate_quotation_draft(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.create_quotation_draft(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.preview_quotation_draft(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.save_quotation_draft(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_quotation_draft(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_quotation_draft(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_quotation_draft(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.create_quotation_draft(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.preview_quotation_draft(uuid,integer,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.save_quotation_draft(uuid,integer,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_draft(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_quotation_draft(uuid,integer,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_quotation_draft(uuid,integer,jsonb,jsonb) TO authenticated;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.calculate_quotation_draft(uuid,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.create_quotation_draft(uuid,uuid) OWNER TO webameen_executor;
ALTER FUNCTION private.preview_quotation_draft(uuid,integer,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.save_quotation_draft(uuid,integer,jsonb,jsonb) OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
