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

export async function listCustomers(search = "", requestedPage = 1) {
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return { customers: [] as Customer[], page: 1, total: 0, totalPages: 1 };
  }
  const supabase = await createSupabaseServerClient();
  const term = search.trim().slice(0, 100);
  // PostgREST parses OR filters as syntax, so quote and escape the user value.
  const escapedTerm = term.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const searchFilter = ["display_name", "email", "phone"]
    .map((column) => `${column}.ilike."%${escapedTerm}%"`)
    .join(",");

  let countQuery = supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("business_id", context.business.id);
  if (term) countQuery = countQuery.or(searchFilter);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error("Could not load customers.");

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMERS_PER_PAGE));
  const page = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const offset = (page - 1) * CUSTOMERS_PER_PAGE;

  let rowsQuery = supabase
    .from("customers")
    .select(
      "id, display_name, contact_name, email, phone, billing_address, state_code, gstin_applicable, gstin, archived_at, created_at, updated_at",
    )
    .eq("business_id", context.business.id)
    .order("display_name", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + CUSTOMERS_PER_PAGE - 1);
  if (term) rowsQuery = rowsQuery.or(searchFilter);
  const { data, error } = await rowsQuery;
  if (error) throw new Error("Could not load customers.");
  return { customers: (data ?? []) as Customer[], page, total, totalPages };
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
