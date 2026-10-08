"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import {
  type CatalogActionState,
  catalogFieldErrors,
  catalogFormValues,
  catalogItemSchema,
  readCatalogForm,
  rupeesToPaise,
} from "./validation";

async function saveCatalogItem(id: string | null, formData: FormData) {
  await requireAuthenticatedUser();
  const raw = readCatalogForm(formData);
  const values = catalogFormValues(raw);
  const parsed = catalogItemSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: catalogFieldErrors(parsed.error), values };

  let priceMinor: string | null;
  try {
    priceMinor = rupeesToPaise(parsed.data.defaultPrice);
  } catch (error) {
    return {
      fieldErrors: {
        defaultPrice: error instanceof Error ? error.message : "Enter a valid price.",
      },
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const gstRate = parsed.data.gstCategory === "taxable" ? parsed.data.gstRate : null;
  if (gstRate) {
    const { data: options, error: optionsError } = await supabase.rpc(
      "list_catalog_gst_rates",
    );
    if (optionsError)
      return { error: "Configured GST rates are unavailable. Please try again.", values };
    const isConfigured = (options ?? []).some(
      (option: { rate: string }) => option.rate === gstRate,
    );
    let isUnchangedRetiredRate = false;
    if (!isConfigured && id) {
      const { data } = await supabase.rpc("get_catalog_item", {
        p_catalog_item_id: id,
      });
      const current = data?.[0];
      isUnchangedRetiredRate =
        current?.default_gst_category === "taxable" &&
        String(current.default_gst_rate) === gstRate;
    }
    if (!isConfigured && !isUnchangedRetiredRate) {
      return {
        fieldErrors: { gstRate: "Choose a currently configured GST rate." },
        values,
      };
    }
  }

  const args = {
    p_kind: parsed.data.kind,
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_unit_label: parsed.data.unitLabel || null,
    p_default_unit_price_minor: priceMinor,
    p_default_gst_category: parsed.data.gstCategory,
    p_default_gst_rate: gstRate,
    p_hsn_sac: parsed.data.hsnSac || null,
  };
  const { data, error } = id
    ? await supabase.rpc("update_catalog_item", { p_catalog_item_id: id, ...args })
    : await supabase.rpc("create_catalog_item", args);
  if (error || !data) {
    return {
      error:
        error?.code === "P0002"
          ? "This item could not be found in your business."
          : error?.code === "22023"
            ? "Check the item details and choose an available GST rate."
            : "We couldn't save this item. Check the details and try again.",
      values,
    };
  }
  revalidatePath("/catalog");
  revalidatePath(`/catalog/${data}`);
  redirect(`/catalog/${data}`);
}

export async function createCatalogItemAction(
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  return saveCatalogItem(null, formData);
}

export async function updateCatalogItemAction(
  id: string,
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  return saveCatalogItem(id, formData);
}
