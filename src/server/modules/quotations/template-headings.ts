import { z } from "zod";

export const defaultQuotationHeadings = {
  documentTitle: "QUOTATION",
  customerTitle: "Bill to",
  detailsTitle: "Quotation details",
  itemDescription: "Item Description",
  materialsTitle: "Materials / subproducts",
  termsTitle: "Terms & conditions",
  paymentTitle: "Payment details",
  acceptanceTitle: "Acceptance",
  totalTitle: "Total Amount",
} as const;

export type QuotationHeadingKey = keyof typeof defaultQuotationHeadings;
export type QuotationHeadings = Record<QuotationHeadingKey, string>;
const heading = z
  .string()
  .trim()
  .min(1, "Enter a heading.")
  .refine(
    (value) =>
      [...value].every(
        (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    "Use a single line for each heading.",
  )
  .max(60, "Use up to 60 characters.");
export const quotationHeadingsSchema = z
  .object({
    documentTitle: heading.optional(),
    customerTitle: heading.optional(),
    detailsTitle: heading.optional(),
    itemDescription: heading.optional(),
    materialsTitle: heading.optional(),
    termsTitle: heading.optional(),
    paymentTitle: heading.optional(),
    acceptanceTitle: heading.optional(),
    totalTitle: heading.optional(),
  })
  .default({});

export function resolveQuotationHeadings(value: unknown): QuotationHeadings {
  const parsed = quotationHeadingsSchema.safeParse(value);
  return { ...defaultQuotationHeadings, ...(parsed.success ? parsed.data : {}) };
}
