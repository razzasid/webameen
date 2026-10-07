import { z } from "zod";
import { isIndianStateCode } from "@/server/modules/business/states";

const gstinShape = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$/;

export const customerSchema = z
  .object({
    displayName: z.string().trim().min(1, "Enter the customer name."),
    contactName: z.string().trim(),
    email: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), z.email("Enter a valid email address.")]))
      .transform((v) => v || null),
    phone: z.string().trim(),
    billingAddress: z.string().trim(),
    stateCode: z.string().refine(isIndianStateCode, "Select a state or territory."),
    gstinApplicable: z.enum(["yes", "no"], { error: "Select GSTIN applicability." }),
    gstin: z.string().trim().toUpperCase(),
  })
  .superRefine((data, context) => {
    if (data.gstinApplicable === "yes" && !data.gstin) {
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
    contactName: data.contactName || null,
    phone: data.phone || null,
    billingAddress: data.billingAddress || null,
    gstinApplicable: data.gstinApplicable === "yes",
    gstin: data.gstinApplicable === "yes" ? data.gstin : null,
  }));

export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerField =
  | "displayName"
  | "contactName"
  | "email"
  | "phone"
  | "billingAddress"
  | "stateCode"
  | "gstinApplicable"
  | "gstin";

export type CustomerActionState = {
  error?: string;
  fieldErrors?: Partial<Record<CustomerField, string>>;
  values?: Record<CustomerField, string>;
};

export function readCustomerForm(formData: FormData) {
  return Object.fromEntries(
    (
      [
        "displayName",
        "contactName",
        "email",
        "phone",
        "billingAddress",
        "stateCode",
        "gstinApplicable",
        "gstin",
      ] as const
    ).map((key) => [key, formData.get(key) ?? ""]),
  );
}

export function customerFormValues(raw: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      typeof value === "string" ? value : "",
    ]),
  ) as Record<CustomerField, string>;
}

export function customerFieldErrors(error: z.ZodError): CustomerActionState["fieldErrors"] {
  const fieldErrors: CustomerActionState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as CustomerField;
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}
