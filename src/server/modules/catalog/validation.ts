import { z } from "zod";

const pricePattern = /^(?:\d+)(?:\.\d{1,2})?$/;
const ratePattern = /^(?:\d+)(?:\.\d+)?$/;
const maxPriceMinor = BigInt("9223372036854775807");

export const catalogCategories = ["taxable", "exempt", "no_gst"] as const;
export const catalogKinds = ["product", "service"] as const;
export type CatalogKind = (typeof catalogKinds)[number];

export function rupeesToPaise(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!pricePattern.test(normalized))
    throw new Error("Enter a price with up to two decimal places.");
  const [rupees, paise = ""] = normalized.split(".");
  const minor = BigInt(rupees) * BigInt(100) + BigInt(paise.padEnd(2, "0") || "0");
  if (minor > maxPriceMinor) throw new Error("Enter a smaller price.");
  return minor.toString();
}

export function paiseToRupees(value: string | number | null): string {
  if (value === null || value === "") return "";
  const minor = BigInt(value);
  const rupees = (minor / BigInt(100)).toString();
  const paise = (minor % BigInt(100)).toString().padStart(2, "0");
  return `${rupees}.${paise}`;
}

export function formatPaise(value: string | number | null): string {
  if (value === null || value === "") return "Not set";
  const minor = BigInt(value);
  const rupees = (minor / BigInt(100)).toLocaleString("en-IN");
  const paise = (minor % BigInt(100)).toString().padStart(2, "0");
  return `₹${rupees}.${paise}`;
}

export const catalogItemSchema = z
  .object({
    kind: z.enum(catalogKinds, { error: "Choose product or service." }),
    name: z.string().trim().min(1, "Enter an item name."),
    description: z.string().trim(),
    unitLabel: z.string().trim(),
    defaultPrice: z.string().trim(),
    gstCategory: z.enum(catalogCategories, { error: "Choose a GST category." }),
    gstRate: z.string().trim(),
    hsnSac: z.string().trim(),
  })
  .superRefine((data, context) => {
    if (data.defaultPrice && !pricePattern.test(data.defaultPrice)) {
      context.addIssue({
        code: "custom",
        path: ["defaultPrice"],
        message: "Enter a price with up to two decimal places.",
      });
    } else if (data.defaultPrice) {
      try {
        rupeesToPaise(data.defaultPrice);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["defaultPrice"],
          message: "Enter a smaller price.",
        });
      }
    }
    if (data.gstCategory === "taxable") {
      if (!data.gstRate || !ratePattern.test(data.gstRate)) {
        context.addIssue({
          code: "custom",
          path: ["gstRate"],
          message: "Select a configured GST rate.",
        });
      } else {
        const rate = Number(data.gstRate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          context.addIssue({
            code: "custom",
            path: ["gstRate"],
            message: "Choose a valid GST rate.",
          });
        }
      }
    } else if (data.gstRate) {
      context.addIssue({
        code: "custom",
        path: ["gstRate"],
        message: "Clear the GST rate for this category.",
      });
    }
  });

export type CatalogInput = z.infer<typeof catalogItemSchema>;
export type CatalogField = keyof CatalogInput;

export type CatalogActionState = {
  error?: string;
  fieldErrors?: Partial<Record<CatalogField, string>>;
  values?: Record<CatalogField, string>;
};

export function readCatalogForm(formData: FormData) {
  return Object.fromEntries(
    (
      [
        "kind",
        "name",
        "description",
        "unitLabel",
        "defaultPrice",
        "gstCategory",
        "gstRate",
        "hsnSac",
      ] as const
    ).map((key) => [key, formData.get(key) ?? ""]),
  );
}

export function catalogFormValues(raw: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      typeof value === "string" ? value : "",
    ]),
  ) as Record<CatalogField, string>;
}

export function catalogFieldErrors(error: z.ZodError): CatalogActionState["fieldErrors"] {
  const fieldErrors: CatalogActionState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as CatalogField;
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}
