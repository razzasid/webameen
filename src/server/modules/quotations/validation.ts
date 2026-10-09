import { z } from "zod";
import { isIndianStateCode } from "@/server/modules/business/states";
import { paiseToRupees, rupeesToPaise } from "@/server/modules/catalog/validation";

const optionalState = z
  .string()
  .refine(
    (value) => !value || isIndianStateCode(value),
    "Select an Indian state or territory.",
  );
const declaration = z.enum(["unset", "yes", "no"]);
const optionalEmail = z
  .string()
  .refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email.",
  );
const gstinShape = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$/;

export const quoteSnapshotSchema = z
  .object({
    sellerDisplayName: z.string(),
    sellerContactEmail: optionalEmail,
    sellerContactPhone: z.string(),
    sellerPostalAddress: z.string(),
    sellerStateCode: optionalState,
    sellerGstRegistered: declaration,
    sellerGstin: z.string(),
    buyerDisplayName: z.string(),
    buyerContactName: z.string(),
    buyerEmail: optionalEmail,
    buyerPhone: z.string(),
    buyerBillingAddress: z.string(),
    buyerStateCode: optionalState,
    buyerGstinApplicable: declaration,
    buyerGstin: z.string(),
    gstTreatmentOverride: z.enum(["", "cgst_sgst", "igst"]),
    documentTimeZone: z.string().trim().min(1, "Enter a document time zone."),
    placeOfSupplyApplicable: declaration,
    placeOfSupplyStateCode: optionalState,
    placeOfSupplyText: z.string(),
    reverseChargeApplies: declaration,
    validUntil: z
      .string()
      .refine(
        (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
        "Enter a valid date.",
      ),
    sellerBankName: z.string(),
    sellerBankAccountName: z.string(),
    sellerBankAccountNumber: z.string(),
    sellerBankIfsc: z.string(),
    sellerUpiId: z.string(),
    paymentInstructions: z.string(),
    terms: z.string(),
  })
  .superRefine((value, context) => {
    for (const [field, input] of [
      ["sellerGstin", value.sellerGstin],
      ["buyerGstin", value.buyerGstin],
    ] as const) {
      if (input.trim() && !gstinShape.test(input.trim().toUpperCase())) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Enter a 15-character GSTIN in the basic format.",
        });
      }
    }
  });
export type QuoteSnapshotInput = z.infer<typeof quoteSnapshotSchema>;

export const quoteLineSchema = z
  .object({
    clientId: z.string(),
    sourceCatalogItemId: z.union([z.literal(""), z.uuid()]),
    description: z.string().trim().min(1, "Enter a line description.").max(10000),
    unitLabel: z.string().trim().min(1, "Enter a unit.").max(1000),
    hsnSac: z.string().max(1000),
    quantity: z
      .string()
      .trim()
      .regex(
        /^\d{1,12}(?:\.\d{1,3})?$/,
        "Enter a positive quantity with up to three decimals.",
      ),
    unitPriceRupees: z.string().trim().min(1, "Enter a price in rupees.").max(30),
    gstCategory: z.enum(["taxable", "exempt", "no_gst"]),
    gstRate: z.string().max(80),
  })
  .superRefine((line, context) => {
    if (/^0+(?:\.0+)?$/.test(line.quantity))
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Quantity must be positive.",
      });
    try {
      if (rupeesToPaise(line.unitPriceRupees) === null) throw new Error();
    } catch {
      context.addIssue({
        code: "custom",
        path: ["unitPriceRupees"],
        message: "Enter a nonnegative price with up to two decimals.",
      });
    }
    if (line.gstCategory === "taxable" && !/^\d+(?:\.\d+)?$/.test(line.gstRate.trim())) {
      context.addIssue({
        code: "custom",
        path: ["gstRate"],
        message: "Select a configured GST rate.",
      });
    }
    if (line.gstCategory !== "taxable" && line.gstRate.trim()) {
      context.addIssue({
        code: "custom",
        path: ["gstRate"],
        message: "Clear the rate for exempt or no-GST lines.",
      });
    }
  });
export const quoteLinesSchema = z
  .array(quoteLineSchema)
  .max(100, "A draft can contain up to 100 lines.");
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

export type QuoteTotals = {
  subtotal_minor: string;
  taxable_subtotal_minor: string;
  cgst_total_minor: string;
  sgst_total_minor: string;
  igst_total_minor: string;
  gst_total_minor: string;
  total_minor: string;
};
export type CalculatedLine = {
  position: number;
  description: string;
  unit_label: string;
  quantity: string;
  unit_price_minor: string;
  line_subtotal_minor: string;
  gst_category: string;
  gst_treatment: string;
  gst_rate: string | null;
  cgst_rate: string | null;
  cgst_amount_minor: string;
  sgst_rate: string | null;
  sgst_amount_minor: string;
  igst_rate: string | null;
  igst_amount_minor: string;
  line_total_minor: string;
};
export type QuoteCalculation = QuoteTotals & {
  auto_treatment: "cgst_sgst" | "igst" | null;
  treatment: "cgst_sgst" | "igst" | null;
  lines: CalculatedLine[];
};

export function toRpcSnapshot(value: QuoteSnapshotInput) {
  const bool = (input: string) => (input === "unset" ? null : input === "yes");
  return {
    seller_display_name: value.sellerDisplayName,
    seller_contact_email: value.sellerContactEmail,
    seller_contact_phone: value.sellerContactPhone,
    seller_postal_address: value.sellerPostalAddress,
    seller_state_code: value.sellerStateCode,
    seller_gst_registered: bool(value.sellerGstRegistered),
    seller_gstin: value.sellerGstin,
    buyer_display_name: value.buyerDisplayName,
    buyer_contact_name: value.buyerContactName,
    buyer_email: value.buyerEmail,
    buyer_phone: value.buyerPhone,
    buyer_billing_address: value.buyerBillingAddress,
    buyer_state_code: value.buyerStateCode,
    buyer_gstin_applicable: bool(value.buyerGstinApplicable),
    buyer_gstin: value.buyerGstin,
    gst_treatment_override: value.gstTreatmentOverride,
    document_time_zone: value.documentTimeZone,
    place_of_supply_applicable: bool(value.placeOfSupplyApplicable),
    place_of_supply_state_code: value.placeOfSupplyStateCode,
    place_of_supply_text: value.placeOfSupplyText,
    reverse_charge_applies: bool(value.reverseChargeApplies),
    valid_until: value.validUntil,
    seller_bank_name: value.sellerBankName,
    seller_bank_account_name: value.sellerBankAccountName,
    seller_bank_account_number: value.sellerBankAccountNumber,
    seller_bank_ifsc: value.sellerBankIfsc,
    seller_upi_id: value.sellerUpiId,
    payment_instructions: value.paymentInstructions,
    terms: value.terms,
  };
}

export function toRpcLines(lines: QuoteLineInput[]) {
  return lines.map((line) => ({
    source_catalog_item_id: line.sourceCatalogItemId || null,
    description: line.description,
    unit_label: line.unitLabel,
    hsn_sac: line.hsnSac,
    quantity: line.quantity,
    unit_price_minor: rupeesToPaise(line.unitPriceRupees),
    gst_category: line.gstCategory,
    gst_rate: line.gstCategory === "taxable" ? line.gstRate : null,
  }));
}

export type QuoteSnapshot = Record<
  keyof ReturnType<typeof toRpcSnapshot>,
  string | boolean | null
>;
export function snapshotToInput(snapshot: QuoteSnapshot): QuoteSnapshotInput {
  const s = (value: string | boolean | null) => (typeof value === "string" ? value : "");
  const b = (value: string | boolean | null) =>
    value === null ? "unset" : value ? "yes" : "no";
  return {
    sellerDisplayName: s(snapshot.seller_display_name),
    sellerContactEmail: s(snapshot.seller_contact_email),
    sellerContactPhone: s(snapshot.seller_contact_phone),
    sellerPostalAddress: s(snapshot.seller_postal_address),
    sellerStateCode: s(snapshot.seller_state_code),
    sellerGstRegistered: b(snapshot.seller_gst_registered),
    sellerGstin: s(snapshot.seller_gstin),
    buyerDisplayName: s(snapshot.buyer_display_name),
    buyerContactName: s(snapshot.buyer_contact_name),
    buyerEmail: s(snapshot.buyer_email),
    buyerPhone: s(snapshot.buyer_phone),
    buyerBillingAddress: s(snapshot.buyer_billing_address),
    buyerStateCode: s(snapshot.buyer_state_code),
    buyerGstinApplicable: b(snapshot.buyer_gstin_applicable),
    buyerGstin: s(snapshot.buyer_gstin),
    gstTreatmentOverride: s(
      snapshot.gst_treatment_override,
    ) as QuoteSnapshotInput["gstTreatmentOverride"],
    documentTimeZone: s(snapshot.document_time_zone),
    placeOfSupplyApplicable: b(snapshot.place_of_supply_applicable),
    placeOfSupplyStateCode: s(snapshot.place_of_supply_state_code),
    placeOfSupplyText: s(snapshot.place_of_supply_text),
    reverseChargeApplies: b(snapshot.reverse_charge_applies),
    validUntil: s(snapshot.valid_until),
    sellerBankName: s(snapshot.seller_bank_name),
    sellerBankAccountName: s(snapshot.seller_bank_account_name),
    sellerBankAccountNumber: s(snapshot.seller_bank_account_number),
    sellerBankIfsc: s(snapshot.seller_bank_ifsc),
    sellerUpiId: s(snapshot.seller_upi_id),
    paymentInstructions: s(snapshot.payment_instructions),
    terms: s(snapshot.terms),
  };
}

export function savedLineToInput(line: {
  id: string;
  source_catalog_item_id: string | null;
  description: string;
  unit_label: string;
  hsn_sac: string | null;
  quantity: string;
  unit_price_minor: string;
  gst_category: "taxable" | "exempt" | "no_gst";
  gst_rate: string | null;
}): QuoteLineInput {
  const [whole, fraction] = line.quantity.split(".", 2);
  const normalizedFraction = fraction?.replace(/0+$/, "");
  return {
    clientId: line.id,
    sourceCatalogItemId: line.source_catalog_item_id ?? "",
    description: line.description,
    unitLabel: line.unit_label,
    hsnSac: line.hsn_sac ?? "",
    // PostgreSQL returns scaled NUMERIC values such as `1.000000`. Normalize
    // insignificant zeroes so a valid saved quantity remains valid input under
    // the prototype's maximum three decimal places.
    quantity: normalizedFraction ? `${whole}.${normalizedFraction}` : whole,
    unitPriceRupees: paiseToRupees(line.unit_price_minor),
    gstCategory: line.gst_category,
    gstRate: line.gst_rate ?? "",
  };
}
