"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import {
  type BusinessSettingsActionState,
  type BusinessSettingsField,
  businessSettingsSchema,
  readBusinessSettings,
} from "./settings-validation";

export async function updateBusinessSettingsAction(
  _previousState: BusinessSettingsActionState,
  formData: FormData,
): Promise<BusinessSettingsActionState> {
  await requireAuthenticatedUser();
  const values = readBusinessSettings(formData);
  const parsed = businessSettingsSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: BusinessSettingsActionState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as BusinessSettingsField;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { values, fieldErrors };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("update_business_settings", {
      p_display_name: parsed.data.displayName,
      p_contact_email: parsed.data.contactEmail,
      p_contact_phone: parsed.data.contactPhone,
      p_postal_address: parsed.data.postalAddress,
      p_state_code: parsed.data.stateCode,
      p_gst_registered: parsed.data.gstRegistered,
      p_gstin: parsed.data.gstin,
      p_default_terms: parsed.data.defaultTerms,
      p_time_zone: parsed.data.timeZone,
      p_bank_name: parsed.data.bankName,
      p_bank_account_name: parsed.data.bankAccountName,
      p_bank_account_number: parsed.data.bankAccountNumber,
      p_bank_ifsc: parsed.data.bankIfsc,
      p_upi_id: parsed.data.upiId,
      p_payment_instructions: parsed.data.paymentInstructions,
    });
    if (error) {
      return {
        values,
        error:
          error.code === "22023"
            ? "Review the settings, including the document time zone, and try again."
            : "We couldn't save business settings. Please try again.",
      };
    }
  } catch {
    return {
      values,
      error: "Business settings are temporarily unavailable. Please try again.",
    };
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { values, saved: true };
}
