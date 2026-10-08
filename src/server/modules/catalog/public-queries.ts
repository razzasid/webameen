import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CATALOG_PER_PAGE } from "./queries";

export type PublicCatalog = { slug: string; business_name: string; item_count: number };
export type PublicCatalogItem = {
  id: string;
  kind: "product" | "service";
  name: string;
  description: string | null;
  unit_label: string | null;
  price_minor: string | null;
  gst_category: "taxable" | "exempt" | "no_gst";
  gst_rate: string | null;
};

// These RPCs use a read-only database role and return an explicit public
// projection. They never use the visitor's business context or a service key.
export const getPublicCatalog = cache(async (slug: string): Promise<PublicCatalog> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_catalog", { p_slug: slug });
  if (error) throw new Error("Could not load public catalog.");
  if (!data?.[0]) notFound();
  return data[0] as PublicCatalog;
});

export async function listPublicCatalogItems(
  catalog: PublicCatalog,
  requestedPage: number,
) {
  const totalPages = Math.max(1, Math.ceil(catalog.item_count / CATALOG_PER_PAGE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_public_catalog_items", {
    p_slug: catalog.slug,
    p_offset: (page - 1) * CATALOG_PER_PAGE,
    p_limit: CATALOG_PER_PAGE,
  });
  if (error) throw new Error("Could not load public catalog items.");
  return { items: (data ?? []) as PublicCatalogItem[], page, totalPages };
}

export async function getPublicCatalogItem(
  slug: string,
  id: string,
): Promise<PublicCatalogItem> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_catalog_item", {
    p_slug: slug,
    p_item_id: id,
  });
  if (error) throw new Error("Could not load public catalog item.");
  if (!data?.[0]) notFound();
  return data[0] as PublicCatalogItem;
}
