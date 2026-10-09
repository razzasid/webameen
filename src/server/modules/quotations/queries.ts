import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { isUuid } from "@/server/shared/uuid";
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
