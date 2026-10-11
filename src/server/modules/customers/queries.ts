import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { isUuid } from "@/server/shared/uuid";

export type Customer = {
  id: string;
  display_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  state_code: string | null;
  gstin_applicable: boolean | null;
  gstin: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CUSTOMERS_PER_PAGE = 10;

export type CustomerListFilters = {
  customerStatus?: "all" | "active" | "archived";
  gstinStatus?: "all" | "applicable" | "not_applicable";
  stateCode?: string;
  sort?: "name_asc" | "name_desc";
};

export async function listCustomers(
  search = "",
  requestedPage = 1,
  filters: CustomerListFilters = {},
) {
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return {
      customers: [] as Customer[],
      page: 1,
      total: 0,
      totalPages: 1,
      summary: { total: 0, gstinApplicable: 0, states: 0 },
    };
  }
  const supabase = await createSupabaseServerClient();
  const term = search.trim().slice(0, 100);
  // PostgREST parses OR filters as syntax, so quote and escape the user value.
  const escapedTerm = term.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const searchFilter = ["display_name", "email", "phone"]
    .map((column) => `${column}.ilike."%${escapedTerm}%"`)
    .join(",");
  const searchWithoutGstinFilter = ["display_name", "email", "phone"]
    .flatMap((column) => [
      `and(${column}.ilike."%${escapedTerm}%",gstin_applicable.eq.false)`,
      `and(${column}.ilike."%${escapedTerm}%",gstin_applicable.is.null)`,
    ])
    .join(",");
  const combineSearchAndGstin = term && filters.gstinStatus === "not_applicable";

  let countQuery = supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("business_id", context.business.id);
  if (combineSearchAndGstin) countQuery = countQuery.or(searchWithoutGstinFilter);
  else if (term) countQuery = countQuery.or(searchFilter);
  if (filters.customerStatus === "active") countQuery = countQuery.is("archived_at", null);
  if (filters.customerStatus === "archived")
    countQuery = countQuery.not("archived_at", "is", null);
  if (filters.gstinStatus === "applicable")
    countQuery = countQuery.eq("gstin_applicable", true);
  if (filters.gstinStatus === "not_applicable" && !combineSearchAndGstin)
    countQuery = countQuery.or("gstin_applicable.eq.false,gstin_applicable.is.null");
  if (filters.stateCode) countQuery = countQuery.eq("state_code", filters.stateCode);

  let rowsQuery = supabase
    .from("customers")
    .select(
      "id, display_name, contact_name, email, phone, billing_address, state_code, gstin_applicable, gstin, archived_at, created_at, updated_at",
    )
    .eq("business_id", context.business.id);
  if (combineSearchAndGstin) rowsQuery = rowsQuery.or(searchWithoutGstinFilter);
  else if (term) rowsQuery = rowsQuery.or(searchFilter);
  if (filters.customerStatus === "active") rowsQuery = rowsQuery.is("archived_at", null);
  if (filters.customerStatus === "archived")
    rowsQuery = rowsQuery.not("archived_at", "is", null);
  if (filters.gstinStatus === "applicable")
    rowsQuery = rowsQuery.eq("gstin_applicable", true);
  if (filters.gstinStatus === "not_applicable" && !combineSearchAndGstin)
    rowsQuery = rowsQuery.or("gstin_applicable.eq.false,gstin_applicable.is.null");
  if (filters.stateCode) rowsQuery = rowsQuery.eq("state_code", filters.stateCode);

  const [countResult, allCountResult, gstinCountResult] = await Promise.all([
    countQuery,
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id)
      .eq("gstin_applicable", true),
  ]);
  if (countResult.error || allCountResult.error || gstinCountResult.error) {
    throw new Error("Could not load customers.");
  }

  const total = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMERS_PER_PAGE));
  const page = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const offset = (page - 1) * CUSTOMERS_PER_PAGE;
  const ascending = filters.sort !== "name_desc";
  const { data, error } = await rowsQuery
    .order("display_name", { ascending })
    .order("id", { ascending })
    .range(offset, offset + CUSTOMERS_PER_PAGE - 1);
  if (error) throw new Error("Could not load customers.");

  const stateCodes = new Set<string>();
  const statePageSize = 1000;
  for (let stateOffset = 0; ; stateOffset += statePageSize) {
    const { data: stateRows, error: stateError } = await supabase
      .from("customers")
      .select("state_code")
      .eq("business_id", context.business.id)
      .not("state_code", "is", null)
      .order("id", { ascending: true })
      .range(stateOffset, stateOffset + statePageSize - 1);
    if (stateError) throw new Error("Could not load customer summary.");
    for (const row of stateRows ?? []) {
      if (row.state_code) stateCodes.add(row.state_code);
    }
    if (!stateRows || stateRows.length < statePageSize) break;
  }

  return {
    customers: (data ?? []) as Customer[],
    page,
    total,
    totalPages,
    summary: {
      total: allCountResult.count ?? 0,
      gstinApplicable: gstinCountResult.count ?? 0,
      states: stateCodes.size,
    },
  };
}

export async function getCustomer(id: string): Promise<Customer> {
  if (!isUuid(id)) notFound();
  const context = await getBusinessContext();
  if (context.status !== "ready") notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, display_name, contact_name, email, phone, billing_address, state_code, gstin_applicable, gstin, archived_at, created_at, updated_at",
    )
    .eq("id", id)
    .eq("business_id", context.business.id)
    .maybeSingle();
  if (error) throw new Error("Could not load customer.");
  if (!data) notFound();
  return data as Customer;
}
