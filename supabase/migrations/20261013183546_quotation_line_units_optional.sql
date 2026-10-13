BEGIN;

ALTER TABLE public.quotation_items
  ALTER COLUMN unit_label DROP NOT NULL;
ALTER TABLE public.quotation_items
  DROP CONSTRAINT quotation_items_unit_label_text_ck,
  ADD CONSTRAINT quotation_items_unit_label_text_ck
    CHECK (unit_label IS NULL OR (unit_label = btrim(unit_label) AND unit_label <> ''));

ALTER TABLE public.invoice_items
  ALTER COLUMN unit_label DROP NOT NULL;
ALTER TABLE public.invoice_items
  DROP CONSTRAINT invoice_items_unit_label_text_ck,
  ADD CONSTRAINT invoice_items_unit_label_text_ck
    CHECK (unit_label IS NULL OR (unit_label = btrim(unit_label) AND unit_label <> ''));

GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA private TO webameen_executor;
SET LOCAL ROLE webameen_executor;
CREATE OR REPLACE FUNCTION private.calculate_quotation_draft(
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
    IF v_description IS NULL OR pg_catalog.length(v_description)>10000
      OR (v_unit IS NOT NULL AND pg_catalog.length(v_unit)>1000)
      OR pg_catalog.length(COALESCE(v_hsn,''))>1000
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
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
