import { z } from "zod";
import { isIndianStateCode } from "./states";

const requiredText = (message: string) => z.string().trim().min(1, message);
const gstinShape = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$/;

export const businessSetupSchema = z
  .object({
    displayName: requiredText("Enter the business name."),
    contactEmail: z.string().trim().email("Enter a valid contact email."),
    contactPhone: requiredText("Enter a contact phone number."),
    postalAddress: requiredText("Enter the business address."),
    stateCode: z.string().refine(isIndianStateCode, "Select an Indian state or territory."),
    gstRegistered: z.enum(["yes", "no"], {
      error: "Select whether the business is GST registered.",
    }),
    gstin: z.string().trim().toUpperCase(),
  })
  .superRefine((data, context) => {
    if (data.gstRegistered === "yes" && !data.gstin) {
      context.addIssue({ code: "custom", path: ["gstin"], message: "Enter the GSTIN." });
    } else if (data.gstin && !gstinShape.test(data.gstin)) {
      context.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "Enter a 15-character GSTIN in the documented basic format.",
      });
    }
  })
  .transform((data) => ({
    ...data,
    gstRegistered: data.gstRegistered === "yes",
    gstin: data.gstin || null,
  }));

export type BusinessSetupInput = z.infer<typeof businessSetupSchema>;
export type BusinessSetupField =
  | "displayName"
  | "contactEmail"
  | "contactPhone"
  | "postalAddress"
  | "stateCode"
  | "gstRegistered"
  | "gstin";

export type BusinessSetupActionState = {
  error?: string;
  fieldErrors?: Partial<Record<BusinessSetupField, string>>;
  values?: Record<BusinessSetupField, string>;
};

export function readBusinessSetup(formData: FormData) {
  return {
    displayName: formData.get("displayName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    postalAddress: formData.get("postalAddress"),
    stateCode: formData.get("stateCode"),
    gstRegistered: formData.get("gstRegistered"),
    gstin: formData.get("gstin") ?? "",
  };
}

export function gstinStateWarning(gstin: string | null, stateCode: string): string | null {
  if (!gstin || !gstinShape.test(gstin)) return null;
  const prefix = gstin.slice(0, 2);
  return prefix === stateCode
    ? null
    : `GSTIN starts with ${prefix}, but the selected state code is ${stateCode}. Please review both. This is not GSTIN verification.`;
}
