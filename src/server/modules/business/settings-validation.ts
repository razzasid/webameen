import { z } from "zod";
import { isIndianStateCode } from "./states";
import { gstinStateWarning } from "./validation";

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);
const gstinShape = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$/;

export const businessSettingsSchema = z
  .object({
    displayName: z.string().trim().min(1, "Enter the business name."),
    contactEmail: z
      .string()
      .trim()
      .refine(
        (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "Enter a valid contact email.",
      )
      .transform((value) => value || null),
    contactPhone: optionalText,
    postalAddress: optionalText,
    stateCode: z
      .string()
      .refine(
        (value) => !value || isIndianStateCode(value),
        "Select an Indian state or territory.",
      )
      .transform((value) => value || null),
    gstRegistered: z
      .enum(["yes", "no", "unset"])
      .transform((value) => (value === "unset" ? null : value === "yes")),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .transform((value) => value || null),
    defaultTerms: optionalText,
    timeZone: z
      .string()
      .trim()
      .min(1, "Enter a document time zone.")
      .max(100, "Use a shorter time zone."),
    bankName: optionalText,
    bankAccountName: optionalText,
    bankAccountNumber: optionalText,
    bankIfsc: optionalText,
    upiId: optionalText,
    paymentInstructions: optionalText,
  })
  .superRefine((data, context) => {
    if (data.gstRegistered === true && !data.gstin)
      context.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "Enter the GSTIN for a GST-registered business.",
      });
    if (data.gstin && !gstinShape.test(data.gstin))
      context.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "Enter a 15-character GSTIN in the basic format.",
      });
  });

export const businessSettingsFields = [
  "displayName",
  "contactEmail",
  "contactPhone",
  "postalAddress",
  "stateCode",
  "gstRegistered",
  "gstin",
  "defaultTerms",
  "timeZone",
  "bankName",
  "bankAccountName",
  "bankAccountNumber",
  "bankIfsc",
  "upiId",
  "paymentInstructions",
] as const;
export type BusinessSettingsField = (typeof businessSettingsFields)[number];
export type BusinessSettingsValues = Record<BusinessSettingsField, string>;
export type BusinessSettingsActionState = {
  error?: string;
  fieldErrors?: Partial<Record<BusinessSettingsField, string>>;
  values?: BusinessSettingsValues;
  saved?: boolean;
};

export function readBusinessSettings(formData: FormData): BusinessSettingsValues {
  return Object.fromEntries(
    businessSettingsFields.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as BusinessSettingsValues;
}

export type BusinessProfile = {
  id: string;
  display_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  postal_address: string | null;
  country_code: string;
  currency_code: string;
  state_code: string | null;
  gst_registered: boolean | null;
  gstin: string | null;
  default_terms: string | null;
  time_zone: string;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  payment_instructions: string | null;
};

export function profileToValues(profile: BusinessProfile): BusinessSettingsValues {
  return {
    displayName: profile.display_name,
    contactEmail: profile.contact_email ?? "",
    contactPhone: profile.contact_phone ?? "",
    postalAddress: profile.postal_address ?? "",
    stateCode: profile.state_code ?? "",
    gstRegistered:
      profile.gst_registered === null ? "unset" : profile.gst_registered ? "yes" : "no",
    gstin: profile.gstin ?? "",
    defaultTerms: profile.default_terms ?? "",
    timeZone: profile.time_zone,
    bankName: profile.bank_name ?? "",
    bankAccountName: profile.bank_account_name ?? "",
    bankAccountNumber: profile.bank_account_number ?? "",
    bankIfsc: profile.bank_ifsc ?? "",
    upiId: profile.upi_id ?? "",
    paymentInstructions: profile.payment_instructions ?? "",
  };
}

export function documentReadiness(profile: BusinessProfile, selectableRateCount: number) {
  const missing: string[] = [];
  if (!profile.display_name.trim()) missing.push("Business name");
  if (!profile.postal_address?.trim()) missing.push("Business address");
  if (!profile.state_code) missing.push("State or territory");
  if (profile.gst_registered === null) missing.push("GST registration declaration");
  if (profile.gst_registered && !profile.gstin) missing.push("GSTIN");
  if (selectableRateCount === 0)
    missing.push("Selectable GST rate configuration for taxable documents (operator)");
  return {
    missing,
    timeZone: profile.time_zone,
    gstinWarning: profile.state_code
      ? gstinStateWarning(profile.gstin, profile.state_code)
      : null,
  };
}
