BEGIN;

ALTER TABLE public.quotation_versions ADD COLUMN template_headings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.quotations ADD COLUMN creation_payload_hash bytea
  CHECK (creation_payload_hash IS NULL OR pg_catalog.octet_length(creation_payload_hash) = 32);
GRANT UPDATE (template_headings) ON public.quotation_versions TO webameen_executor;
GRANT UPDATE (creation_payload_hash) ON public.quotations TO webameen_executor;
GRANT SELECT (template_headings) ON public.quotation_versions TO webameen_quote_broker;

-- Presentation belongs to each frozen version, never to a global business setting.
CREATE FUNCTION private.guard_quotation_template() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_entry record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.shared_at IS NOT NULL
    AND NEW.template_headings IS DISTINCT FROM OLD.template_headings THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Frozen quotation headings cannot change';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.previous_version_id IS NOT NULL THEN
    SELECT version.template_headings INTO NEW.template_headings
    FROM public.quotation_versions AS version
    WHERE version.business_id=NEW.business_id AND version.quotation_id=NEW.quotation_id
      AND version.id=NEW.previous_version_id;
  END IF;
  IF NEW.template_headings IS NULL OR pg_catalog.jsonb_typeof(NEW.template_headings)<>'object'
    OR pg_catalog.octet_length(NEW.template_headings::text)>2048 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quotation template headings';
  END IF;
  FOR v_entry IN SELECT key,value FROM pg_catalog.jsonb_each(NEW.template_headings) LOOP
    IF v_entry.key NOT IN ('documentTitle','customerTitle','detailsTitle','itemDescription',
      'materialsTitle','termsTitle','paymentTitle','acceptanceTitle','totalTitle')
      OR pg_catalog.jsonb_typeof(v_entry.value)<>'string'
      OR (v_entry.value #>> '{}') ~ '[[:cntrl:]]'
      OR pg_catalog.length(pg_catalog.btrim(v_entry.value #>> '{}')) NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Use headings of 1 to 60 characters';
    END IF;
  END LOOP;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.guard_quotation_template() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER c_quotation_template BEFORE INSERT OR UPDATE ON public.quotation_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_quotation_template();

CREATE FUNCTION private.save_quotation_draft_with_template(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb; v_business_id uuid;
BEGIN
  v_result := private.save_quotation_draft_with_components($1,$2,$3,$4);
  SELECT business_id INTO v_business_id FROM public.business_memberships
    WHERE user_id=auth.uid() AND role='owner' AND disabled_at IS NULL;
  IF v_business_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required'; END IF;
  UPDATE public.quotation_versions AS version
    SET template_headings=COALESCE(p_snapshot->'template_headings',version.template_headings)
    FROM public.quotations AS quotation
    WHERE quotation.business_id=v_business_id AND quotation.id=p_quotation_id
      AND version.business_id=v_business_id AND version.id=quotation.current_version_id
      AND version.state='draft' AND version.shared_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Draft unavailable'; END IF;
  RETURN v_result;
END $fn$;

-- Creation and the first save commit together. A retry cannot duplicate or overwrite a quotation.
CREATE FUNCTION private.create_quotation_draft_with_content(
  p_request_key uuid,p_customer_id uuid,p_snapshot jsonb,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid; v_business_id uuid; v_stored_hash bytea; v_hash bytea; v_sequence integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/gst-options',0));
  v_id := private.create_quotation_draft(p_request_key,p_customer_id);
  SELECT business_id INTO v_business_id FROM public.business_memberships
    WHERE user_id=auth.uid() AND role='owner' AND disabled_at IS NULL;
  IF v_business_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required'; END IF;
  SELECT quotation.creation_payload_hash,version.edit_sequence INTO v_stored_hash,v_sequence
    FROM public.quotations AS quotation JOIN public.quotation_versions AS version
      ON version.business_id=quotation.business_id AND version.id=quotation.current_version_id
    WHERE quotation.business_id=v_business_id AND quotation.id=v_id FOR UPDATE OF quotation;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('customer',p_customer_id,'snapshot',p_snapshot,'lines',p_lines)::text,'UTF8'));
  IF v_stored_hash IS NOT NULL THEN
    IF v_stored_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Creation request has different content';
    END IF;
    RETURN v_id;
  END IF;
  IF v_sequence IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Draft changed; reload before editing';
  END IF;
  PERFORM private.save_quotation_draft_with_template(v_id,0,p_snapshot,p_lines);
  UPDATE public.quotations SET creation_payload_hash=v_hash WHERE business_id=v_business_id AND id=v_id;
  RETURN v_id;
END $fn$;

CREATE FUNCTION private.preview_new_quotation_draft(p_customer_id uuid,p_snapshot jsonb,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_business_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('webameen/gst-options',0));
  SELECT business_id INTO v_business_id FROM public.business_memberships
    WHERE user_id=auth.uid() AND role='owner' AND disabled_at IS NULL;
  IF v_business_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/'||v_business_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.business_memberships WHERE business_id=v_business_id
      AND user_id=auth.uid() AND role='owner' AND disabled_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.customers WHERE business_id=v_business_id
      AND id=p_customer_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Active owner and customer required';
  END IF;
  RETURN private.calculate_quotation_draft(v_business_id,p_snapshot,p_lines);
END $fn$;

CREATE OR REPLACE FUNCTION public.save_quotation_draft(
  p_quotation_id uuid,p_expected_edit_sequence integer,p_snapshot jsonb,p_lines jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.save_quotation_draft_with_template($1,$2,$3,$4) $fn$;
CREATE FUNCTION public.create_quotation_draft_with_content(
  p_request_key uuid,p_customer_id uuid,p_snapshot jsonb,p_lines jsonb
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.create_quotation_draft_with_content($1,$2,$3,$4) $fn$;
CREATE FUNCTION public.preview_new_quotation_draft(p_customer_id uuid,p_snapshot jsonb,p_lines jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.preview_new_quotation_draft($1,$2,$3) $fn$;

REVOKE ALL ON FUNCTION private.save_quotation_draft_with_template(uuid,integer,jsonb,jsonb),
  private.create_quotation_draft_with_content(uuid,uuid,jsonb,jsonb),
  private.preview_new_quotation_draft(uuid,jsonb,jsonb),
  public.create_quotation_draft_with_content(uuid,uuid,jsonb,jsonb),
  public.preview_new_quotation_draft(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.save_quotation_draft_with_template(uuid,integer,jsonb,jsonb),
  private.create_quotation_draft_with_content(uuid,uuid,jsonb,jsonb),
  private.preview_new_quotation_draft(uuid,jsonb,jsonb),
  public.create_quotation_draft_with_content(uuid,uuid,jsonb,jsonb),
  public.preview_new_quotation_draft(uuid,jsonb,jsonb) TO authenticated;

CREATE FUNCTION private.read_public_quotation_with_template(p_token_hash_hex text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_quote jsonb; v_headings jsonb;
BEGIN
  v_quote := private.read_public_quotation_with_components(p_token_hash_hex);
  IF v_quote IS NULL THEN RETURN NULL; END IF;
  SELECT version.template_headings INTO v_headings
    FROM public.quotation_public_links AS link JOIN public.quotation_versions AS version
      ON version.business_id=link.business_id AND version.id=link.version_id
    WHERE link.token_hash=pg_catalog.decode(p_token_hash_hex,'hex');
  RETURN v_quote || pg_catalog.jsonb_build_object('template_headings',COALESCE(v_headings,'{}'::jsonb));
END $fn$;
CREATE OR REPLACE FUNCTION public.read_public_quotation(p_token_hash_hex text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.read_public_quotation_with_template(p_token_hash_hex) $fn$;
REVOKE ALL ON FUNCTION private.read_public_quotation_with_template(text)
  FROM PUBLIC,anon,authenticated,service_role,webameen_quote_broker;
GRANT EXECUTE ON FUNCTION private.read_public_quotation_with_template(text) TO service_role;

GRANT CREATE ON SCHEMA private TO webameen_executor,webameen_quote_broker;
GRANT webameen_executor,webameen_quote_broker TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.save_quotation_draft_with_template(uuid,integer,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.create_quotation_draft_with_content(uuid,uuid,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.preview_new_quotation_draft(uuid,jsonb,jsonb) OWNER TO webameen_executor;
ALTER FUNCTION private.read_public_quotation_with_template(text) OWNER TO webameen_quote_broker;
REVOKE CREATE ON SCHEMA private FROM webameen_executor,webameen_quote_broker;
REVOKE webameen_executor,webameen_quote_broker FROM CURRENT_USER;

-- The owner projection is appended below before COMMIT.

CREATE OR REPLACE FUNCTION public.get_quotation_draft(p_quotation_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'id',q.id,'reference',q.reference,'customer_id',q.customer_id,
    'version_id',v.id,'version_number',v.version_number,'state',v.state,
    'edit_sequence',v.edit_sequence,'created_at',q.created_at,'updated_at',q.updated_at,
    'template_headings',v.template_headings,
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

COMMIT;
