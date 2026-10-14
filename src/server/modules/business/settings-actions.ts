"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import { reportSafeFailure } from "@/server/observability/report-safe-failure";
import { getBusinessContext } from "./context";
import { BUSINESS_LOGO_BUCKET } from "./logo-assets";
import {
  type BusinessLogoActionState,
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
  } catch (error) {
    return {
      values,
      error: reportSafeFailure(
        "business.settings.update",
        error,
        "Business settings are temporarily unavailable. Please try again.",
      ),
    };
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { values, saved: true };
}

const MAX_BUSINESS_LOGO_BYTES = 700_000;

export async function updateBusinessLogoAction(
  _previousState: BusinessLogoActionState,
  formData: FormData,
): Promise<BusinessLogoActionState> {
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return { error: "Complete your business setup before adding a logo." };
  }

  const supabase = await createSupabaseServerClient();
  const intent = String(formData.get("intent") ?? "upload");

  if (intent === "remove") {
    try {
      const { error } = await supabase.rpc("update_business_logo", {
        p_logo_asset_key: null,
        p_logo_sha256_hex: null,
      });
      if (error) return { error: "We couldn't remove the logo. Please try again." };
    } catch (error) {
      return {
        error: reportSafeFailure(
          "business.logo.remove",
          error,
          "Business logo settings are temporarily unavailable. Please try again.",
        ),
      };
    }
    revalidatePath("/settings");
    revalidatePath("/quotations/new");
    return { saved: true };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PNG or JPG logo to upload." };
  }
  if (file.size > MAX_BUSINESS_LOGO_BYTES) {
    return { error: "The logo must be 700 KB or smaller." };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedType = detectBusinessLogoType(bytes);
    if (!detectedType || file.type !== detectedType.mimeType) {
      return { error: "Use a valid PNG or JPG image for the logo." };
    }

    const assetKey = `${context.business.id}/${randomUUID()}.${detectedType.extension}`;
    const { error: uploadError } = await supabase.storage
      .from(BUSINESS_LOGO_BUCKET)
      .upload(assetKey, bytes, {
        cacheControl: "31536000",
        contentType: detectedType.mimeType,
        upsert: false,
      });
    if (uploadError) {
      return { error: "We couldn't upload the logo. Please try again." };
    }

    const logoSha256Hex = createHash("sha256").update(bytes).digest("hex");
    const { error: saveError } = await supabase.rpc("update_business_logo", {
      p_logo_asset_key: assetKey,
      p_logo_sha256_hex: logoSha256Hex,
    });
    if (saveError)
      return { error: "The logo uploaded but couldn't be saved. Please try again." };
  } catch (error) {
    return {
      error: reportSafeFailure(
        "business.logo.upload",
        error,
        "Business logo settings are temporarily unavailable. Please try again.",
      ),
    };
  }

  revalidatePath("/settings");
  revalidatePath("/quotations/new");
  return { saved: true };
}

function detectBusinessLogoType(bytes: Buffer) {
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: "png", mimeType: "image/png" } as const;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" } as const;
  }
  return null;
}
