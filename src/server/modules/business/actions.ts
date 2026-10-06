"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import {
  type BusinessSetupActionState,
  type BusinessSetupField,
  businessSetupSchema,
  readBusinessSetup,
} from "./validation";

export async function createBusinessAction(
  _previousState: BusinessSetupActionState,
  formData: FormData,
): Promise<BusinessSetupActionState> {
  // The form can be invoked directly. Always recheck the provider identity here.
  await requireAuthenticatedUser();
  const raw = readBusinessSetup(formData);
  if (raw.gstRegistered === "no") raw.gstin = "";
  const values = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      typeof value === "string" ? value : "",
    ]),
  ) as Record<BusinessSetupField, string>;
  const parsed = businessSetupSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: BusinessSetupActionState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as BusinessSetupField;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { fieldErrors, values };
  }

  let errorMessage: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("bootstrap_business", {
      p_display_name: parsed.data.displayName,
      p_contact_email: parsed.data.contactEmail,
      p_contact_phone: parsed.data.contactPhone,
      p_postal_address: parsed.data.postalAddress,
      p_state_code: parsed.data.stateCode,
      p_gst_registered: parsed.data.gstRegistered,
      p_gstin: parsed.data.gstin,
    });
    if (error) {
      errorMessage =
        error.code === "42501"
          ? "Confirm your email before creating a business."
          : "We couldn't save your business. Please try again.";
    }
  } catch {
    errorMessage = "Business setup is temporarily unavailable. Please try again.";
  }
  if (errorMessage) return { error: errorMessage, values };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
