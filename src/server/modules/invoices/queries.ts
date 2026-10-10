import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { isUuid } from "@/server/shared/uuid";

export type InvoiceNumberPeriod = {
  period_key: string;
  starts_on: string;
  ends_before: string;
  prefix: string;
  format_template: string;
  minimum_digits: number;
  starting_number: string;
  last_issued_number: string | null;
};

export type InvoiceSummary = {
  id: string;
  quotation_id: string;
  customer_id: string;
  source_version_id: string;
  approved_response_id: string;
  numbering_period: string;
  sequence_number: string;
  reference: string;
  issued_at: string;
  invoice_date: string;
  due_on: string | null;
  buyer_display_name: string;
  total_minor: string;
  currency_code: string;
};

export type InvoiceItem = {
  id: string;
  source_quotation_item_id: string;
  position: number;
  description: string;
  unit_label: string;
  hsn_sac: string | null;
  quantity: string;
  unit_price_minor: string;
  line_subtotal_minor: string;
  gst_category: string;
  gst_treatment: string;
  gst_rate: string | null;
  taxable_amount_minor: string;
  cgst_rate: string | null;
  cgst_amount_minor: string;
  sgst_rate: string | null;
  sgst_amount_minor: string;
  igst_rate: string | null;
  igst_amount_minor: string;
  line_total_minor: string;
};

export type InvoiceDetail = InvoiceSummary & {
  business_id: string;
  seller_display_name: string;
  seller_contact_email: string | null;
  seller_contact_phone: string | null;
  seller_postal_address: string;
  seller_country_code: string;
  seller_state_code: string;
  seller_gst_registered: boolean;
  seller_gstin: string | null;
  seller_logo_asset_key: string | null;
  seller_signature_asset_key: string | null;
  buyer_contact_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_billing_address: string;
  buyer_state_code: string;
  buyer_gstin_applicable: boolean;
  buyer_gstin: string | null;
  currency_exponent: number;
  quantity_scale: number;
  calculation_rule_code: string;
  price_tax_mode: string;
  gst_auto_treatment: string;
  gst_treatment_override: string | null;
  gst_treatment: string;
  document_time_zone: string;
  place_of_supply_applicable: boolean;
  place_of_supply_state_code: string | null;
  place_of_supply_text: string | null;
  reverse_charge_applies: boolean;
  subtotal_minor: string;
  taxable_subtotal_minor: string;
  cgst_total_minor: string;
  sgst_total_minor: string;
  igst_total_minor: string;
  gst_total_minor: string;
  seller_bank_name: string | null;
  seller_bank_account_name: string | null;
  seller_bank_account_number: string | null;
  seller_bank_ifsc: string | null;
  seller_upi_id: string | null;
  payment_instructions: string | null;
  terms: string | null;
  items: InvoiceItem[];
};

export type InvoicePublicLink = {
  id: string;
  created_at: string;
  access_expires_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export async function listInvoiceNumberPeriods(): Promise<InvoiceNumberPeriod[]> {
  const context = await getBusinessContext();
  if (context.status !== "ready") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_number_sequences")
    .select(
      "period_key,starts_on,ends_before,prefix,format_template,minimum_digits,starting_number,last_issued_number",
    )
    .eq("business_id", context.business.id)
    .order("starts_on", { ascending: false });
  if (error) throw new Error("Could not load invoice numbering periods.");
  return (data ?? []) as InvoiceNumberPeriod[];
}

export async function listInvoices(): Promise<InvoiceSummary[]> {
  const context = await getBusinessContext();
  if (context.status !== "ready") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id,quotation_id,customer_id,source_version_id,approved_response_id,numbering_period,sequence_number,reference,issued_at,invoice_date,due_on,buyer_display_name,total_minor,currency_code",
    )
    .eq("business_id", context.business.id)
    .order("issued_at", { ascending: false });
  if (error) throw new Error("Could not load invoices.");
  return (data ?? []) as InvoiceSummary[];
}

export async function findInvoiceForOwner(id: string): Promise<InvoiceDetail | null> {
  if (!isUuid(id)) return null;
  const context = await getBusinessContext();
  if (context.status !== "ready") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("business_id", context.business.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load this invoice.");
  if (!data) return null;
  const { data: itemData, error: itemError } = await supabase
    .from("invoice_items")
    .select(
      "id,source_quotation_item_id,position,description,unit_label,hsn_sac,quantity,unit_price_minor,line_subtotal_minor,gst_category,gst_treatment,gst_rate,taxable_amount_minor,cgst_rate,cgst_amount_minor,sgst_rate,sgst_amount_minor,igst_rate,igst_amount_minor,line_total_minor",
    )
    .eq("business_id", context.business.id)
    .eq("invoice_id", id)
    .order("position");
  if (itemError) throw new Error("Could not load invoice lines.");
  return { ...(data as Omit<InvoiceDetail, "items">), items: itemData ?? [] };
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const invoice = await findInvoiceForOwner(id);
  if (!invoice) notFound();
  return invoice;
}

export async function listInvoicePublicLinks(id: string): Promise<InvoicePublicLink[]> {
  if (!isUuid(id)) return [];
  const context = await getBusinessContext();
  if (context.status !== "ready") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_public_links")
    .select("id,created_at,access_expires_at,revoked_at,revocation_reason")
    .eq("business_id", context.business.id)
    .eq("invoice_id", id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load invoice link history.");
  return (data ?? []) as InvoicePublicLink[];
}

export async function getInvoiceForQuotation(
  quotationId: string,
): Promise<Pick<InvoiceSummary, "id" | "reference"> | null> {
  if (!isUuid(quotationId)) return null;
  const context = await getBusinessContext();
  if (context.status !== "ready") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id,reference")
    .eq("business_id", context.business.id)
    .eq("quotation_id", quotationId)
    .maybeSingle();
  if (error) throw new Error("Could not check this quotation's invoice.");
  return data;
}
