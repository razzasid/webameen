BEGIN;

-- Owner-only exact-string reads. Bigint and numeric values are never sent as
-- JSON numbers, which could lose precision in JavaScript.
CREATE FUNCTION public.list_quotation_drafts()
RETURNS TABLE(id uuid,reference text,customer_name text,version_state text,
  edit_sequence integer,total_minor text,updated_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
  SELECT q.id,q.reference,c.display_name,v.state,v.edit_sequence,v.total_minor::text,q.updated_at
  FROM public.quotations AS q
  JOIN public.customers AS c ON c.business_id=q.business_id AND c.id=q.customer_id
  JOIN public.quotation_versions AS v ON v.business_id=q.business_id AND v.id=q.current_version_id
  ORDER BY q.updated_at DESC,q.id DESC
$fn$;

CREATE FUNCTION public.get_quotation_draft(p_quotation_id uuid) RETURNS jsonb
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
      'line_total_minor',li.line_total_minor::text
    ) ORDER BY li.position)
      FROM public.quotation_items AS li WHERE li.business_id=q.business_id AND li.version_id=v.id),'[]'::jsonb)
  )
  FROM public.quotations AS q
  JOIN public.quotation_versions AS v ON v.business_id=q.business_id AND v.id=q.current_version_id
  WHERE q.id=p_quotation_id
$fn$;

REVOKE ALL ON FUNCTION public.list_quotation_drafts() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_quotation_draft(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_quotation_drafts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quotation_draft(uuid) TO authenticated;

COMMIT;
