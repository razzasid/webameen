BEGIN;

ALTER TABLE public.quotation_items
  ADD COLUMN components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT quotation_items_components_array_ck CHECK (
    CASE WHEN pg_catalog.jsonb_typeof(components) = 'array'
      THEN pg_catalog.jsonb_array_length(components) <= 20
      ELSE false
    END
  );

GRANT UPDATE (components) ON public.quotation_items TO webameen_executor;
GRANT SELECT (business_id, version_id, position, components)
  ON public.quotation_items TO webameen_quote_broker;

-- Keep the established owner-only save checks and total calculations. This
-- wrapper validates and stores nested details after the parent rows are saved;
-- component prices are deliberately excluded from parent line calculations.
CREATE FUNCTION private.save_quotation_draft_with_components(
  p_quotation_id uuid,
  p_expected_edit_sequence integer,
  p_snapshot jsonb,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_result jsonb;
  v_line jsonb;
  v_component jsonb;
  v_components jsonb;
  v_clean_components jsonb;
  v_all_components jsonb := '[]'::jsonb;
  v_position integer := 0;
  v_component_position integer := 0;
  v_business_id uuid;
  v_version_id uuid;
  v_description text;
  v_unit text;
  v_quantity_text text;
  v_price_text text;
  v_quantity numeric;
  v_price numeric;
  v_max numeric := 9223372036854775807;
BEGIN
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation line input';
  END IF;
  IF pg_catalog.jsonb_array_length(p_lines) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation line input';
  END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_position := v_position + 1;
    IF pg_catalog.jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation line';
    END IF;
    v_components := COALESCE(v_line->'components', '[]'::jsonb);
    IF pg_catalog.jsonb_typeof(v_components) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation subproducts';
    END IF;
    IF pg_catalog.jsonb_array_length(v_components) > 20 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation subproducts';
    END IF;

    v_clean_components := '[]'::jsonb;
    v_component_position := 0;
    FOR v_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v_components) LOOP
      v_component_position := v_component_position + 1;
      IF pg_catalog.jsonb_typeof(v_component) <> 'object' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation subproduct';
      END IF;
      v_description := NULLIF(pg_catalog.btrim(v_component->>'description'), '');
      v_unit := NULLIF(pg_catalog.btrim(v_component->>'unit_label'), '');
      v_quantity_text := pg_catalog.btrim(v_component->>'quantity');
      v_price_text := pg_catalog.btrim(v_component->>'unit_price_minor');
      IF v_description IS NULL OR pg_catalog.length(v_description) > 1000
        OR pg_catalog.length(COALESCE(v_unit, '')) > 1000
        OR v_quantity_text IS NULL OR v_quantity_text !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
        OR v_price_text IS NULL OR v_price_text !~ '^[0-9]{1,19}$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation subproduct input';
      END IF;
      v_quantity := v_quantity_text::numeric;
      v_price := v_price_text::numeric;
      IF v_quantity <= 0 OR v_quantity > 999999999999.999 OR v_price > v_max THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Subproduct quantity or price is out of range';
      END IF;
      v_clean_components := v_clean_components || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'position', v_component_position,
          'description', v_description,
          'unit_label', v_unit,
          'quantity', v_quantity::text,
          'unit_price_minor', v_price::text
        )
      );
    END LOOP;
    v_all_components := v_all_components || pg_catalog.jsonb_build_array(v_clean_components);
  END LOOP;

  v_result := private.save_quotation_draft(
    p_quotation_id, p_expected_edit_sequence, p_snapshot, p_lines
  );

  SELECT business_id INTO v_business_id
  FROM public.business_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND disabled_at IS NULL;
  SELECT current_version_id INTO v_version_id
  FROM public.quotations
  WHERE business_id = v_business_id AND id = p_quotation_id;
  IF v_business_id IS NULL OR v_version_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required';
  END IF;

  UPDATE public.quotation_items AS item
  SET components = saved.value
  FROM pg_catalog.jsonb_array_elements(v_all_components)
    WITH ORDINALITY AS saved(value, position)
  WHERE item.business_id = v_business_id
    AND item.version_id = v_version_id
    AND item.position = saved.position::integer;

  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.save_quotation_draft(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.save_quotation_draft_with_components($1,$2,$3,$4) $fn$;

CREATE OR REPLACE FUNCTION public.get_quotation_draft(p_quotation_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'id',q.id,'reference',q.reference,'customer_id',q.customer_id,
    'version_id',v.id,'version_number',v.version_number,'state',v.state,
    'edit_sequence',v.edit_sequence,'created_at',q.created_at,'updated_at',q.updated_at,
    'snapshot',pg_catalog.jsonb_build_object(
      'seller_display_name',v.seller_display_name,'seller_contact_email',v.seller_contact_email,
      'seller_contact_phone',v.seller_contact_phone,'seller_postal_address',v.seller_postal_address,
      'seller_state_code',v.seller_state_code,'seller_gst_registered',v.seller_gst_registered,
      'seller_gstin',v.seller_gstin,'buyer_display_name',v.buyer_display_name,
      'buyer_contact_name',v.buyer_contact_name,'buyer_email',v.buyer_email,
      'buyer_phone',v.buyer_phone,'buyer_billing_address',v.buyer_billing_address,
      'buyer_state_code',v.buyer_state_code,'buyer_gstin_applicable',v.buyer_gstin_applicable,
      'buyer_gstin',v.buyer_gstin,'gst_auto_treatment',v.gst_auto_treatment,
      'gst_treatment_override',v.gst_treatment_override,'gst_treatment',v.gst_treatment,
      'document_time_zone',v.document_time_zone,
      'place_of_supply_applicable',v.place_of_supply_applicable,
      'place_of_supply_state_code',v.place_of_supply_state_code,
      'place_of_supply_text',v.place_of_supply_text,
      'reverse_charge_applies',v.reverse_charge_applies,
      'valid_until',v.valid_until,
      'seller_bank_name',v.seller_bank_name,'seller_bank_account_name',v.seller_bank_account_name,
      'seller_bank_account_number',v.seller_bank_account_number,'seller_bank_ifsc',v.seller_bank_ifsc,
      'seller_upi_id',v.seller_upi_id,'payment_instructions',v.payment_instructions,'terms',v.terms
    ),
    'totals',pg_catalog.jsonb_build_object(
      'subtotal_minor',v.subtotal_minor::text,'taxable_subtotal_minor',v.taxable_subtotal_minor::text,
      'cgst_total_minor',v.cgst_total_minor::text,'sgst_total_minor',v.sgst_total_minor::text,
      'igst_total_minor',v.igst_total_minor::text,'gst_total_minor',v.gst_total_minor::text,
      'total_minor',v.total_minor::text
    ),
    'lines',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',li.id,'source_catalog_item_id',li.source_catalog_item_id,
      'position',li.position,'description',li.description,'unit_label',li.unit_label,
      'hsn_sac',li.hsn_sac,'quantity',li.quantity::text,
      'unit_price_minor',li.unit_price_minor::text,
      'line_subtotal_minor',li.line_subtotal_minor::text,
      'gst_category',li.gst_category,'gst_treatment',li.gst_treatment,
      'gst_rate',li.gst_rate::text,'taxable_amount_minor',li.taxable_amount_minor::text,
      'cgst_rate',li.cgst_rate::text,'cgst_amount_minor',li.cgst_amount_minor::text,
      'sgst_rate',li.sgst_rate::text,'sgst_amount_minor',li.sgst_amount_minor::text,
      'igst_rate',li.igst_rate::text,'igst_amount_minor',li.igst_amount_minor::text,
      'line_total_minor',li.line_total_minor::text,'components',li.components
    ) ORDER BY li.position)
      FROM public.quotation_items AS li WHERE li.business_id=q.business_id AND li.version_id=v.id),'[]'::jsonb)
  )
  FROM public.quotations AS q
  JOIN public.quotation_versions AS v ON v.business_id=q.business_id AND v.id=q.current_version_id
  WHERE q.id=p_quotation_id
$fn$;

-- The accountless quote broker adds stored breakdowns to the existing public
-- DTO without giving the service key direct access to tenant tables.
CREATE FUNCTION private.read_public_quotation_with_components(p_token_hash_hex text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_quote jsonb;
  v_hash bytea;
  v_business_id uuid;
  v_version_id uuid;
  v_lines jsonb;
BEGIN
  v_quote := private.read_public_quotation(p_token_hash_hex);
  IF v_quote IS NULL THEN RETURN NULL; END IF;
  v_hash := pg_catalog.decode(p_token_hash_hex, 'hex');
  SELECT business_id, version_id INTO v_business_id, v_version_id
  FROM public.quotation_public_links WHERE token_hash = v_hash;
  IF v_business_id IS NULL OR v_version_id IS NULL THEN RETURN NULL; END IF;

  SELECT pg_catalog.jsonb_agg(
    line.value || pg_catalog.jsonb_build_object(
      'components', COALESCE(item.components, '[]'::jsonb)
    ) ORDER BY (line.value->>'position')::integer
  ) INTO v_lines
  FROM pg_catalog.jsonb_array_elements(v_quote->'lines') AS line(value)
  LEFT JOIN public.quotation_items AS item
    ON item.business_id = v_business_id
    AND item.version_id = v_version_id
    AND item.position = (line.value->>'position')::integer;

  RETURN pg_catalog.jsonb_set(
    v_quote, '{lines}', COALESCE(v_lines, '[]'::jsonb), true
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.read_public_quotation(p_token_hash_hex text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.read_public_quotation_with_components(p_token_hash_hex) $fn$;

REVOKE ALL ON FUNCTION private.save_quotation_draft_with_components(uuid,integer,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.read_public_quotation_with_components(text)
  FROM PUBLIC,anon,authenticated,service_role,webameen_quote_broker;
REVOKE ALL ON FUNCTION public.save_quotation_draft(uuid,integer,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_quotation_draft(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_public_quotation(text)
  FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION private.save_quotation_draft_with_components(uuid,integer,jsonb,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.read_public_quotation_with_components(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_quotation_draft(uuid,integer,jsonb,jsonb),
  public.get_quotation_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_public_quotation(text) TO service_role;

GRANT CREATE ON SCHEMA private TO webameen_executor,webameen_quote_broker;
GRANT webameen_executor,webameen_quote_broker TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.save_quotation_draft_with_components(uuid,integer,jsonb,jsonb)
  OWNER TO webameen_executor;
ALTER FUNCTION private.read_public_quotation_with_components(text)
  OWNER TO webameen_quote_broker;
REVOKE CREATE ON SCHEMA private FROM webameen_executor,webameen_quote_broker;
REVOKE webameen_executor,webameen_quote_broker FROM CURRENT_USER;

COMMIT;
