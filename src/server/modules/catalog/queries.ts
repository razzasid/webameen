import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";

export type CatalogItem = {
  id: string;
  kind: "product" | "service";
  name: string;
  description: string | null;
  unit_label: string | null;
  default_unit_price_minor: string | null;
  default_gst_category: "taxable" | "exempt" | "no_gst";
  default_gst_rate: string | null;
  hsn_sac: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GstRateOption = { rate: string };
export const CATALOG_PER_PAGE = 12;

export async function listGstRateOptions(): Promise<GstRateOption[]> {
  const context = await getBusinessContext();
  if (context.status !== "ready") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_catalog_gst_rates");
  if (error) throw new Error("Could not load configured GST rates.");
  return (data ?? []).map((option: { rate: string }) => ({ rate: option.rate }));
}

export async function listCatalogItems(search = "", requestedPage = 1) {
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return { items: [] as CatalogItem[], page: 1, total: 0, totalPages: 1 };
  }
  const supabase = await createSupabaseServerClient();
  const term = search.trim().slice(0, 100);
  const escapedTerm = term.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const searchFilter = ["name", "description", "hsn_sac"]
    .map((column) => `${column}.ilike."%${escapedTerm}%"`)
    .join(",");
  let countQuery = supabase
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("business_id", context.business.id)
    .is("archived_at", null);
  if (term) countQuery = countQuery.or(searchFilter);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error("Could not load catalog items.");

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PER_PAGE));
  const page = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const { data, error } = await supabase.rpc("list_catalog_items", {
    p_search: term,
    p_offset: (page - 1) * CATALOG_PER_PAGE,
    p_limit: CATALOG_PER_PAGE,
  });
  if (error) throw new Error("Could not load catalog items.");
  return { items: (data ?? []) as CatalogItem[], page, total, totalPages };
}

export async function getCatalogItem(id: string): Promise<CatalogItem> {
  const context = await getBusinessContext();
  if (context.status !== "ready") notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_catalog_item", {
    p_catalog_item_id: id,
  });
  if (error) throw new Error("Could not load this catalog item.");
  if (!data?.[0]) notFound();
  return data[0] as CatalogItem;
}
