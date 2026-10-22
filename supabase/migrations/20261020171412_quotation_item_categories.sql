BEGIN;

ALTER TABLE public.quotation_versions
  ADD COLUMN item_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT quotation_versions_item_categories_array_ck CHECK (
    CASE WHEN pg_catalog.jsonb_typeof(item_categories) = 'array'
      THEN pg_catalog.jsonb_array_length(item_categories) <= 50 ELSE false END
  );
ALTER TABLE public.quotation_items ADD COLUMN category_id uuid;

GRANT UPDATE (item_categories) ON public.quotation_versions TO webameen_executor;
GRANT UPDATE (category_id) ON public.quotation_items TO webameen_executor;
GRANT SELECT (business_id, quotation_id, id, previous_version_id, item_categories, shared_at)
  ON public.quotation_versions TO webameen_executor;
GRANT SELECT (business_id, version_id, position, category_id)
  ON public.quotation_items TO webameen_executor;
GRANT SELECT (business_id, id, previous_version_id, item_categories)
  ON public.quotation_versions TO webameen_quote_broker;
GRANT SELECT (business_id, version_id, position, category_id)
  ON public.quotation_items TO webameen_quote_broker;

CREATE FUNCTION private.guard_quotation_item_categories() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_entry record;
BEGIN
  IF TG_OP='UPDATE' AND OLD.shared_at IS NOT NULL
    AND NEW.item_categories IS DISTINCT FROM OLD.item_categories THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Frozen quotation categories cannot change';
  END IF;
  IF TG_OP='INSERT' AND NEW.previous_version_id IS NOT NULL THEN
    SELECT version.item_categories INTO NEW.item_categories
    FROM public.quotation_versions AS version
    WHERE version.business_id=NEW.business_id AND version.quotation_id=NEW.quotation_id
      AND version.id=NEW.previous_version_id;
  END IF;
  IF NEW.item_categories IS NULL OR pg_catalog.jsonb_typeof(NEW.item_categories) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation categories';
  END IF;
  IF pg_catalog.jsonb_array_length(NEW.item_categories)>50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation categories';
  END IF;
  FOR v_entry IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.item_categories) LOOP
    IF pg_catalog.jsonb_typeof(v_entry.value)<>'object'
      OR COALESCE(v_entry.value->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(v_entry.value->'name') IS DISTINCT FROM 'string'
      OR pg_catalog.length(pg_catalog.btrim(v_entry.value->>'name')) NOT BETWEEN 1 AND 120
      OR (v_entry.value->>'name') ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Category names must contain 1 to 120 characters';
    END IF;
  END LOOP;
  IF (SELECT pg_catalog.count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(NEW.item_categories))
    <> pg_catalog.jsonb_array_length(NEW.item_categories) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Quotation category IDs must be unique';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.guard_quotation_item_categories() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER c_quotation_item_categories BEFORE INSERT OR UPDATE OF item_categories
  ON public.quotation_versions FOR EACH ROW EXECUTE FUNCTION private.guard_quotation_item_categories();

-- A revision inherits the item-to-category links at matching line positions.
CREATE FUNCTION private.guard_quotation_item_category_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_previous uuid; v_categories jsonb; v_shared_at timestamptz;
BEGIN
  SELECT previous_version_id,item_categories,shared_at INTO v_previous,v_categories,v_shared_at
    FROM public.quotation_versions
    WHERE business_id=NEW.business_id AND id=NEW.version_id;
  IF TG_OP='UPDATE' AND v_shared_at IS NOT NULL AND NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Frozen quotation item categories cannot change';
  END IF;
  IF TG_OP='INSERT' AND NEW.category_id IS NULL AND v_previous IS NOT NULL THEN
    SELECT category_id INTO NEW.category_id FROM public.quotation_items
      WHERE business_id=NEW.business_id AND version_id=v_previous AND position=NEW.position;
  END IF;
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(v_categories,'[]'::jsonb)) AS category(value)
    WHERE (category.value->>'id')::uuid=NEW.category_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Quotation item category is unavailable';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.guard_quotation_item_category_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER c_quotation_item_category_revision BEFORE INSERT OR UPDATE OF category_id ON public.quotation_items
  FOR EACH ROW EXECUTE FUNCTION private.guard_quotation_item_category_revision();

CREATE FUNCTION private.validate_quotation_item_categories(p_snapshot jsonb,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v_categories jsonb:=COALESCE(p_snapshot->'item_categories','[]'::jsonb);
  v_category jsonb; v_line jsonb; v_id uuid; v_ids uuid[]:='{}'; v_name text;
  v_clean jsonb:='[]'::jsonb;
BEGIN
  IF pg_catalog.jsonb_typeof(v_categories) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation category input';
  END IF;
  IF pg_catalog.jsonb_array_length(v_categories)>50 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation category input';
  END IF;
  FOR v_category IN SELECT value FROM pg_catalog.jsonb_array_elements(v_categories) LOOP
    IF pg_catalog.jsonb_typeof(v_category)<>'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation category';
    END IF;
    BEGIN v_id:=(v_category->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation category ID'; END;
    v_name:=pg_catalog.btrim(v_category->>'name');
    IF v_name IS NULL OR pg_catalog.length(v_name) NOT BETWEEN 1 AND 120
      OR v_name ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Category names must contain 1 to 120 characters';
    END IF;
    IF v_id=ANY(v_ids) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Quotation category IDs must be unique'; END IF;
    v_ids:=pg_catalog.array_append(v_ids,v_id);
    v_clean:=v_clean || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id::text,'name',v_name));
  END LOOP;
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF v_line ? 'category_id' AND v_line->'category_id'<>'null'::jsonb THEN
      BEGIN v_id:=(v_line->>'category_id')::uuid;
      EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid line category'; END;
      IF NOT (v_id=ANY(v_ids)) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every item must belong to a quotation category';
      END IF;
    ELSIF pg_catalog.jsonb_array_length(v_categories)>0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every item must belong to a quotation category';
    END IF;
  END LOOP;
  RETURN v_clean;
END $fn$;
REVOKE ALL ON FUNCTION private.validate_quotation_item_categories(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.save_quotation_draft_with_categories(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb; v_business_id uuid; v_version_id uuid; v_categories jsonb;
BEGIN
  v_categories:=private.validate_quotation_item_categories(p_snapshot,p_lines);
  v_result:=private.save_quotation_draft_with_template($1,$2,$3,$4);
  SELECT business_id INTO v_business_id FROM public.business_memberships
    WHERE user_id=auth.uid() AND role='owner' AND disabled_at IS NULL;
  SELECT current_version_id INTO v_version_id FROM public.quotations
    WHERE business_id=v_business_id AND id=p_quotation_id;
  IF v_business_id IS NULL OR v_version_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required';
  END IF;
  UPDATE public.quotation_versions SET item_categories=v_categories
    WHERE business_id=v_business_id AND id=v_version_id AND state='draft' AND shared_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Draft unavailable'; END IF;
  UPDATE public.quotation_items AS item SET category_id=NULLIF(line.value->>'category_id','')::uuid
    FROM pg_catalog.jsonb_array_elements(p_lines) WITH ORDINALITY AS line(value,position)
    WHERE item.business_id=v_business_id AND item.version_id=v_version_id
      AND item.position=line.position::integer;
  RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.save_quotation_draft(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.save_quotation_draft_with_categories($1,$2,$3,$4) $fn$;

CREATE OR REPLACE FUNCTION public.preview_quotation_draft(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  PERFORM private.validate_quotation_item_categories(p_snapshot,p_lines);
  RETURN private.preview_quotation_draft($1,$2,$3,$4);
END $fn$;

CREATE OR REPLACE FUNCTION private.create_quotation_draft_with_categories(
  p_request_key uuid,p_customer_id uuid,p_snapshot jsonb,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid; v_business_id uuid; v_categories jsonb;
BEGIN
  v_categories:=private.validate_quotation_item_categories(p_snapshot,p_lines);
  v_id:=private.create_quotation_draft_with_content($1,$2,$3,$4);
  SELECT business_id INTO v_business_id FROM public.business_memberships
    WHERE user_id=auth.uid() AND role='owner' AND disabled_at IS NULL;
  UPDATE public.quotation_versions AS version SET item_categories=v_categories
    FROM public.quotations AS quotation
    WHERE quotation.business_id=v_business_id AND quotation.id=v_id
      AND version.business_id=v_business_id AND version.id=quotation.current_version_id
      AND version.state='draft' AND version.shared_at IS NULL;
  UPDATE public.quotation_items AS item SET category_id=NULLIF(line.value->>'category_id','')::uuid
    FROM public.quotations AS quotation,
      pg_catalog.jsonb_array_elements(p_lines) WITH ORDINALITY AS line(value,position)
    WHERE quotation.business_id=v_business_id AND quotation.id=v_id
      AND item.business_id=v_business_id AND item.version_id=quotation.current_version_id
      AND item.position=line.position::integer;
  RETURN v_id;
END $fn$;
CREATE OR REPLACE FUNCTION public.create_quotation_draft_with_content(
  p_request_key uuid,p_customer_id uuid,p_snapshot jsonb,p_lines jsonb
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.create_quotation_draft_with_categories($1,$2,$3,$4) $fn$;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET ROLE webameen_executor;
ALTER FUNCTION private.preview_new_quotation_draft(uuid,jsonb,jsonb)
  RENAME TO preview_new_quotation_draft_without_categories;
RESET ROLE;
REVOKE webameen_executor FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
CREATE FUNCTION private.preview_new_quotation_draft(
  p_customer_id uuid,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM private.validate_quotation_item_categories(p_snapshot,p_lines);
  RETURN private.preview_new_quotation_draft_without_categories($1,$2,$3);
END $fn$;
CREATE OR REPLACE FUNCTION public.preview_new_quotation_draft(
  p_customer_id uuid,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.preview_new_quotation_draft($1,$2,$3) $fn$;

CREATE OR REPLACE FUNCTION public.get_quotation_draft(p_quotation_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'id',q.id,'reference',q.reference,'customer_id',q.customer_id,
    'version_id',v.id,'version_number',v.version_number,'state',v.state,
    'edit_sequence',v.edit_sequence,'created_at',q.created_at,'updated_at',q.updated_at,
    'template_headings',v.template_headings,'item_categories',v.item_categories,
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
      'document_time_zone',v.document_time_zone,'place_of_supply_applicable',v.place_of_supply_applicable,
      'place_of_supply_state_code',v.place_of_supply_state_code,'place_of_supply_text',v.place_of_supply_text,
      'reverse_charge_applies',v.reverse_charge_applies,'valid_until',v.valid_until,
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
      'id',li.id,'source_catalog_item_id',li.source_catalog_item_id,'category_id',li.category_id,
      'position',li.position,'description',li.description,'unit_label',li.unit_label,
      'hsn_sac',li.hsn_sac,'quantity',li.quantity::text,'unit_price_minor',li.unit_price_minor::text,
      'line_subtotal_minor',li.line_subtotal_minor::text,'gst_category',li.gst_category,
      'gst_treatment',li.gst_treatment,'gst_rate',li.gst_rate::text,
      'taxable_amount_minor',li.taxable_amount_minor::text,'cgst_rate',li.cgst_rate::text,
      'cgst_amount_minor',li.cgst_amount_minor::text,'sgst_rate',li.sgst_rate::text,
      'sgst_amount_minor',li.sgst_amount_minor::text,'igst_rate',li.igst_rate::text,
      'igst_amount_minor',li.igst_amount_minor::text,'line_total_minor',li.line_total_minor::text,
      'components',li.components
    ) ORDER BY li.position) FROM public.quotation_items AS li
      WHERE li.business_id=q.business_id AND li.version_id=v.id),'[]'::jsonb)
  ) FROM public.quotations AS q
  JOIN public.quotation_versions AS v ON v.business_id=q.business_id AND v.id=q.current_version_id
  WHERE q.id=p_quotation_id
$fn$;

GRANT CREATE ON SCHEMA private TO webameen_quote_broker;
GRANT webameen_quote_broker TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET ROLE webameen_quote_broker;
CREATE OR REPLACE FUNCTION private.read_public_quotation_with_template(p_token_hash_hex text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_quote jsonb; v_categories jsonb; v_lines jsonb; v_business_id uuid; v_version_id uuid;
BEGIN
  v_quote:=private.read_public_quotation_with_components(p_token_hash_hex);
  IF v_quote IS NULL THEN RETURN NULL; END IF;
  SELECT link.business_id,link.version_id INTO v_business_id,v_version_id
    FROM public.quotation_public_links AS link
    WHERE link.token_hash=pg_catalog.decode(p_token_hash_hex,'hex');
  SELECT item_categories INTO v_categories FROM public.quotation_versions
    WHERE business_id=v_business_id AND id=v_version_id;
  SELECT pg_catalog.jsonb_agg(line.value || pg_catalog.jsonb_build_object('category_id',item.category_id)
      ORDER BY (line.value->>'position')::integer) INTO v_lines
    FROM pg_catalog.jsonb_array_elements(v_quote->'lines') AS line(value)
    LEFT JOIN public.quotation_items AS item ON item.business_id=v_business_id
      AND item.version_id=v_version_id AND item.position=(line.value->>'position')::integer;
  RETURN pg_catalog.jsonb_set(v_quote,'{lines}',COALESCE(v_lines,'[]'::jsonb),true)
    || pg_catalog.jsonb_build_object('item_categories',COALESCE(v_categories,'[]'::jsonb));
END $fn$;
RESET ROLE;
CREATE OR REPLACE FUNCTION public.read_public_quotation(p_token_hash_hex text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.read_public_quotation_with_template($1) $fn$;

REVOKE ALL ON FUNCTION private.save_quotation_draft_with_categories(uuid,integer,jsonb,jsonb),
  private.create_quotation_draft_with_categories(uuid,uuid,jsonb,jsonb),
  private.validate_quotation_item_categories(jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.save_quotation_draft_with_categories(uuid,integer,jsonb,jsonb),
  private.create_quotation_draft_with_categories(uuid,uuid,jsonb,jsonb),
  private.validate_quotation_item_categories(jsonb,jsonb)
  TO authenticated;
REVOKE ALL ON FUNCTION private.preview_new_quotation_draft(uuid,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.preview_new_quotation_draft(uuid,jsonb,jsonb) TO authenticated;
SET ROLE webameen_quote_broker;
REVOKE ALL ON FUNCTION private.read_public_quotation_with_template(text)
  FROM PUBLIC,anon,authenticated,service_role,webameen_quote_broker;
GRANT EXECUTE ON FUNCTION private.read_public_quotation_with_template(text) TO service_role;
RESET ROLE;
REVOKE webameen_quote_broker FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA private FROM webameen_quote_broker;

GRANT CREATE ON SCHEMA private TO webameen_executor,webameen_quote_broker;
GRANT webameen_executor,webameen_quote_broker TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.guard_quotation_item_categories() OWNER TO webameen_executor;
ALTER FUNCTION private.guard_quotation_item_category_revision() OWNER TO webameen_executor;
ALTER FUNCTION private.validate_quotation_item_categories(jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.save_quotation_draft_with_categories(uuid,integer,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.create_quotation_draft_with_categories(uuid,uuid,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.preview_new_quotation_draft(uuid,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.read_public_quotation_with_template(text) OWNER TO webameen_quote_broker;
REVOKE CREATE ON SCHEMA private FROM webameen_executor,webameen_quote_broker;
REVOKE webameen_executor,webameen_quote_broker FROM CURRENT_USER;

COMMIT;
