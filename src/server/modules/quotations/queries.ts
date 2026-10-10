import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { isUuid } from "@/server/shared/uuid";
import type { PublicQuotation } from "./public-broker";
import type { CalculatedLine, QuoteSnapshot, QuoteTotals } from "./validation";

export type QuoteSummary = {
  id: string;
  reference: string;
  customer_name: string;
  version_state: string;
  edit_sequence: number;
  total_minor: string | null;
  updated_at: string;
};
export type SavedQuoteLine = CalculatedLine & {
  id: string;
  source_catalog_item_id: string | null;
  hsn_sac: string | null;
  gst_category: "taxable" | "exempt" | "no_gst";
};
export type QuoteDraft = {
  id: string;
  reference: string;
  customer_id: string;
  version_id: string;
  version_number: number;
  state: string;
  edit_sequence: number;
  created_at: string;
  updated_at: string;
  snapshot: QuoteSnapshot;
  totals: QuoteTotals;
  lines: SavedQuoteLine[];
};
export type QuotationWorkflow = {
  quotation_id: string;
  reference: string;
  current_version_id: string;
  versions: Array<{
    id: string;
    version_number: number;
    state: string;
    created_at: string;
    shared_at: string | null;
    valid_until: string | null;
    response_deadline_at: string | null;
    total_minor: string;
    response: {
      kind: string;
      customer_note: string | null;
      respondent_name: string | null;
      responded_at: string;
    } | null;
    links: Array<{
      id: string;
      created_at: string;
      access_expires_at: string | null;
      revoked_at: string | null;
      revocation_reason: string | null;
      active: boolean;
    }>;
  }>;
};
export type CustomerChoice = { id: string; display_name: string };
export type CatalogChoice = {
  id: string;
  name: string;
  description: string | null;
  unit_label: string | null;
  default_unit_price_minor: string | null;
  default_gst_category: "taxable" | "exempt" | "no_gst";
  default_gst_rate: string | null;
  hsn_sac: string | null;
};

export async function listQuotationDrafts(): Promise<QuoteSummary[]> {
  const context = await getBusinessContext();
  if (context.status !== "ready") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_quotation_drafts");
  if (error) throw new Error("Could not load quotations.");
  return (data ?? []) as QuoteSummary[];
}

export async function getQuotationDraft(id: string): Promise<QuoteDraft> {
  if (!isUuid(id)) notFound();
  const context = await getBusinessContext();
  if (context.status !== "ready") notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_quotation_draft", { p_quotation_id: id });
  if (error) throw new Error("Could not load this quotation.");
  if (!data) notFound();
  return data as QuoteDraft;
}

export async function getQuotationWorkflow(id: string): Promise<QuotationWorkflow> {
  if (!isUuid(id)) notFound();
  const context = await getBusinessContext();
  if (context.status !== "ready") notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_quotation_workflow", {
    p_quotation_id: id,
  });
  if (error || !data) notFound();
  return data as QuotationWorkflow;
}

export async function getLatestSharedQuotationDocument(
  id: string,
): Promise<PublicQuotation | null> {
  if (!isUuid(id)) return null;
  const context = await getBusinessContext();
  if (context.status !== "ready") return null;
  const supabase = await createSupabaseServerClient();
  const { data: quotation, error: quotationError } = await supabase
    .from("quotations")
    .select("id,business_id,reference,current_version_id")
    .eq("business_id", context.business.id)
    .eq("id", id)
    .maybeSingle();
  if (quotationError) throw new Error("Could not load this quotation document.");
  if (!quotation) return null;

  const { data: version, error: versionError } = await supabase
    .from("quotation_versions")
    .select(
      "id,version_number,state,valid_until,response_deadline_at,shared_at,seller_display_name,seller_contact_email,seller_contact_phone,seller_postal_address,seller_country_code,seller_state_code,seller_gst_registered,seller_gstin,buyer_display_name,buyer_contact_name,buyer_email,buyer_phone,buyer_billing_address,buyer_state_code,buyer_gstin_applicable,buyer_gstin,currency_code,currency_exponent,quantity_scale,calculation_rule_code,price_tax_mode,gst_auto_treatment,gst_treatment_override,gst_treatment,document_time_zone,place_of_supply_applicable,place_of_supply_state_code,place_of_supply_text,reverse_charge_applies,subtotal_minor,taxable_subtotal_minor,cgst_total_minor,sgst_total_minor,igst_total_minor,gst_total_minor,total_minor,seller_bank_name,seller_bank_account_name,seller_bank_account_number,seller_bank_ifsc,seller_upi_id,payment_instructions,terms",
    )
    .eq("business_id", context.business.id)
    .eq("quotation_id", id)
    .not("shared_at", "is", null)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) throw new Error("Could not load the frozen quotation version.");
  if (!version) return null;

  const { data: lines, error: linesError } = await supabase
    .from("quotation_items")
    .select(
      "position,description,unit_label,hsn_sac,quantity,unit_price_minor,line_subtotal_minor,gst_category,gst_treatment,gst_rate,taxable_amount_minor,cgst_rate,cgst_amount_minor,sgst_rate,sgst_amount_minor,igst_rate,igst_amount_minor,line_total_minor",
    )
    .eq("business_id", context.business.id)
    .eq("version_id", version.id)
    .order("position");
  if (linesError) throw new Error("Could not load frozen quotation lines.");

  const totals = {
    subtotal_minor: String(version.subtotal_minor),
    taxable_subtotal_minor: String(version.taxable_subtotal_minor),
    cgst_total_minor: String(version.cgst_total_minor),
    sgst_total_minor: String(version.sgst_total_minor),
    igst_total_minor: String(version.igst_total_minor),
    gst_total_minor: String(version.gst_total_minor),
    total_minor: String(version.total_minor),
  };
  return {
    reference: quotation.reference,
    version_number: version.version_number,
    state: version.state,
    revision_in_preparation: quotation.current_version_id !== version.id,
    valid_until: version.valid_until,
    response_deadline_at: version.response_deadline_at,
    response_deadline_passed: Boolean(
      version.response_deadline_at &&
        Date.now() >= new Date(version.response_deadline_at).getTime(),
    ),
    seller: {
      display_name: version.seller_display_name,
      email: version.seller_contact_email,
      phone: version.seller_contact_phone,
      address: version.seller_postal_address,
      country_code: version.seller_country_code,
      state_code: version.seller_state_code,
      gst_registered: version.seller_gst_registered,
      gstin: version.seller_gstin,
      bank_name: version.seller_bank_name,
      bank_account_name: version.seller_bank_account_name,
      bank_account_number: version.seller_bank_account_number,
      bank_ifsc: version.seller_bank_ifsc,
      upi_id: version.seller_upi_id,
      payment_instructions: version.payment_instructions,
    },
    buyer: {
      display_name: version.buyer_display_name,
      contact_name: version.buyer_contact_name,
      email: version.buyer_email,
      phone: version.buyer_phone,
      billing_address: version.buyer_billing_address,
      state_code: version.buyer_state_code,
      gstin_applicable: version.buyer_gstin_applicable,
      gstin: version.buyer_gstin,
    },
    document: {
      currency_code: version.currency_code,
      currency_exponent: String(version.currency_exponent),
      quantity_scale: String(version.quantity_scale),
      calculation_rule_code: version.calculation_rule_code,
      price_tax_mode: version.price_tax_mode,
      gst_auto_treatment: version.gst_auto_treatment,
      gst_treatment_override: version.gst_treatment_override,
      gst_treatment: version.gst_treatment,
      document_time_zone: version.document_time_zone,
      place_of_supply_applicable: version.place_of_supply_applicable,
      place_of_supply_state_code: version.place_of_supply_state_code,
      place_of_supply_text: version.place_of_supply_text,
      reverse_charge_applies: version.reverse_charge_applies,
      terms: version.terms,
    },
    totals,
    lines: (lines ?? []).map((line) => ({
      ...line,
      quantity: String(line.quantity),
      unit_price_minor: String(line.unit_price_minor),
      line_subtotal_minor: String(line.line_subtotal_minor),
      gst_rate: line.gst_rate === null ? null : String(line.gst_rate),
      taxable_amount_minor: String(line.taxable_amount_minor),
      cgst_rate: line.cgst_rate === null ? null : String(line.cgst_rate),
      cgst_amount_minor: String(line.cgst_amount_minor),
      sgst_rate: line.sgst_rate === null ? null : String(line.sgst_rate),
      sgst_amount_minor: String(line.sgst_amount_minor),
      igst_rate: line.igst_rate === null ? null : String(line.igst_rate),
      igst_amount_minor: String(line.igst_amount_minor),
      line_total_minor: String(line.line_total_minor),
    })),
    response: null,
  } as unknown as PublicQuotation;
}

export async function listQuotationCustomers(): Promise<CustomerChoice[]> {
  const context = await getBusinessContext();
  if (context.status !== "ready") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id,display_name")
    .eq("business_id", context.business.id)
    .is("archived_at", null)
    .order("display_name")
    .limit(500);
  if (error) throw new Error("Could not load customers for a quotation.");
  return data ?? [];
}

export async function listQuotationCatalogChoices(): Promise<CatalogChoice[]> {
  const context = await getBusinessContext();
  if (context.status !== "ready") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_catalog_items", {
    p_search: "",
    p_offset: 0,
    p_limit: 100,
  });
  if (error) throw new Error("Could not load catalog defaults.");
  return (data ?? []) as CatalogChoice[];
}
