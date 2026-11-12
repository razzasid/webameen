import { z } from "zod";
import { isIndianStateCode } from "@/server/modules/business/states";
import { rupeesToPaise } from "@/server/modules/catalog/validation";

const optionalState = z
  .string()
  .refine(
    (value) => !value || isIndianStateCode(value),
    "Select an Indian state or territory.",
  );

const optionalEmail = z
  .string()
  .refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email address.",
  );

const gstinShape = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$/;

function isCalendarDate(value: string): boolean {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const directInvoiceSnapshotSchema = z
  .object({
    sellerDisplayName: z.string().trim().min(1, "Enter the seller business name."),
    sellerContactEmail: optionalEmail,
    sellerContactPhone: z.string().trim(),
    sellerPostalAddress: z.string().trim().min(1, "Enter the seller postal address."),
    sellerStateCode: z
      .string()
      .trim()
      .min(1, "Select the seller state.")
      .refine(isIndianStateCode, "Select an Indian state or territory."),
    sellerGstRegistered: z.boolean(),
    sellerGstin: z.string().trim(),
    buyerDisplayName: z.string().trim().min(1, "Enter or select the customer name."),
    buyerContactName: z.string().trim(),
    buyerEmail: optionalEmail,
    buyerPhone: z.string().trim(),
    buyerBillingAddress: z.string().trim().min(1, "Enter the customer billing address."),
    buyerStateCode: z
      .string()
      .trim()
      .min(1, "Select the customer state.")
      .refine(isIndianStateCode, "Select an Indian state or territory."),
    buyerGstinApplicable: z.boolean(),
    buyerGstin: z.string().trim(),
    gstTreatmentOverride: z.enum(["", "cgst_sgst", "igst"]),
    documentTimeZone: z.string().trim().min(1, "Enter a document time zone."),
    placeOfSupplyApplicable: z.boolean(),
    placeOfSupplyStateCode: optionalState,
    placeOfSupplyText: z.string().trim(),
    reverseChargeApplies: z.boolean(),
    sellerBankName: z.string().trim(),
    sellerBankAccountName: z.string().trim(),
    sellerBankAccountNumber: z.string().trim(),
    sellerBankIfsc: z.string().trim(),
    sellerUpiId: z.string().trim(),
    paymentInstructions: z.string().trim(),
    terms: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (value.sellerGstRegistered && !value.sellerGstin) {
      context.addIssue({
        code: "custom",
        path: ["sellerGstin"],
        message: "Enter the seller GSTIN.",
      });
    } else if (value.sellerGstin && !gstinShape.test(value.sellerGstin.toUpperCase())) {
      context.addIssue({
        code: "custom",
        path: ["sellerGstin"],
        message: "Enter a valid 15-character GSTIN.",
      });
    }

    if (value.buyerGstinApplicable && !value.buyerGstin) {
      context.addIssue({
        code: "custom",
        path: ["buyerGstin"],
        message: "Enter the customer GSTIN.",
      });
    } else if (value.buyerGstin && !gstinShape.test(value.buyerGstin.toUpperCase())) {
      context.addIssue({
        code: "custom",
        path: ["buyerGstin"],
        message: "Enter a valid 15-character GSTIN.",
      });
    }

    if (value.placeOfSupplyApplicable && !value.placeOfSupplyStateCode) {
      context.addIssue({
        code: "custom",
        path: ["placeOfSupplyStateCode"],
        message: "Select the place-of-supply state.",
      });
    }
  });

export type DirectInvoiceSnapshotInput = z.infer<typeof directInvoiceSnapshotSchema>;

export const directInvoiceLineSchema = z
  .object({
    clientId: z.string(),
    sourceCatalogItemId: z.union([z.literal(""), z.string().uuid()]),
    description: z.string().trim().min(1, "Enter an item description.").max(10000),
    unitLabel: z.string().trim().max(1000),
    hsnSac: z.string().trim().max(1000),
    quantity: z
      .string()
      .trim()
      .regex(
        /^\d{1,12}(?:\.\d{1,3})?$/,
        "Enter a positive quantity with up to three decimals.",
      ),
    unitPriceRupees: z.string().trim().min(1, "Enter a price in rupees.").max(30),
    gstCategory: z.enum(["taxable", "exempt", "no_gst"]),
    gstRate: z.string().trim().max(80),
  })
  .superRefine((line, context) => {
    if (/^0+(?:\.0+)?$/.test(line.quantity)) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Quantity must be greater than zero.",
      });
    }
    try {
      const paise = rupeesToPaise(line.unitPriceRupees);
      if (paise === null) throw new Error();
    } catch {
      context.addIssue({
        code: "custom",
        path: ["unitPriceRupees"],
        message: "Enter a valid price with up to two decimals.",
      });
    }
    if (line.gstCategory === "taxable" && !/^\d+(?:\.\d+)?$/.test(line.gstRate)) {
      context.addIssue({
        code: "custom",
        path: ["gstRate"],
        message: "Select a configured GST rate for taxable items.",
      });
    }
    if (line.gstCategory !== "taxable" && line.gstRate) {
      context.addIssue({
        code: "custom",
        path: ["gstRate"],
        message: "Clear the GST rate for exempt or non-GST lines.",
      });
    }
  });

export const directInvoiceLinesSchema = z
  .array(directInvoiceLineSchema)
  .min(1, "Add at least one invoice line item.")
  .max(100, "An invoice can contain up to 100 lines.");

export type DirectInvoiceLineInput = z.infer<typeof directInvoiceLineSchema>;

export const directInvoiceFormSchema = z.object({
  requestKey: z.string().uuid("Invalid invoice request key."),
  customerId: z.string().uuid("Select an active customer."),
  dueOn: z
    .string()
    .trim()
    .refine((v) => !v || isCalendarDate(v), "Enter a valid due date."),
  snapshot: directInvoiceSnapshotSchema,
  lines: directInvoiceLinesSchema,
});

export type DirectInvoiceFormInput = z.infer<typeof directInvoiceFormSchema>;

export type DirectInvoiceCalculation = {
  subtotal_minor: string;
  taxable_subtotal_minor: string;
  cgst_total_minor: string;
  sgst_total_minor: string;
  igst_total_minor: string;
  gst_total_minor: string;
  total_minor: string;
  auto_treatment: "cgst_sgst" | "igst" | null;
  treatment: "cgst_sgst" | "igst" | null;
  lines: Array<{
    position: number;
    description: string;
    unit_label: string | null;
    hsn_sac: string | null;
    quantity: string;
    unit_price_minor: string;
    line_subtotal_minor: string;
    gst_category: string;
    gst_treatment: string;
    gst_rate: string | null;
    taxable_amount_minor: string;
    cgst_rate: string | null;
    cgst_amount_minor: string;
    sgst_rate: string | null;
    sgst_amount_minor: string;
    igst_rate: string | null;
    igst_amount_minor: string;
    line_total_minor: string;
    source_catalog_item_id: string | null;
  }>;
};

export function toDirectInvoiceRpcSnapshot(snapshot: DirectInvoiceSnapshotInput) {
  return {
    seller_display_name: snapshot.sellerDisplayName,
    seller_contact_email: snapshot.sellerContactEmail || null,
    seller_contact_phone: snapshot.sellerContactPhone || null,
    seller_postal_address: snapshot.sellerPostalAddress,
    seller_state_code: snapshot.sellerStateCode,
    seller_gst_registered: snapshot.sellerGstRegistered,
    seller_gstin: snapshot.sellerGstRegistered ? snapshot.sellerGstin.toUpperCase() : null,
    buyer_display_name: snapshot.buyerDisplayName,
    buyer_contact_name: snapshot.buyerContactName || null,
    buyer_email: snapshot.buyerEmail || null,
    buyer_phone: snapshot.buyerPhone || null,
    buyer_billing_address: snapshot.buyerBillingAddress,
    buyer_state_code: snapshot.buyerStateCode,
    buyer_gstin_applicable: snapshot.buyerGstinApplicable,
    buyer_gstin: snapshot.buyerGstinApplicable ? snapshot.buyerGstin.toUpperCase() : null,
    gst_treatment_override: snapshot.gstTreatmentOverride || null,
    document_time_zone: snapshot.documentTimeZone,
    place_of_supply_applicable: snapshot.placeOfSupplyApplicable,
    place_of_supply_state_code: snapshot.placeOfSupplyApplicable
      ? snapshot.placeOfSupplyStateCode || null
      : null,
    place_of_supply_text: snapshot.placeOfSupplyApplicable
      ? snapshot.placeOfSupplyText || null
      : null,
    reverse_charge_applies: snapshot.reverseChargeApplies,
    seller_bank_name: snapshot.sellerBankName || null,
    seller_bank_account_name: snapshot.sellerBankAccountName || null,
    seller_bank_account_number: snapshot.sellerBankAccountNumber || null,
    seller_bank_ifsc: snapshot.sellerBankIfsc || null,
    seller_upi_id: snapshot.sellerUpiId || null,
    payment_instructions: snapshot.paymentInstructions || null,
    terms: snapshot.terms || null,
  };
}

export function toDirectInvoiceRpcLines(lines: DirectInvoiceLineInput[]) {
  return lines.map((line) => ({
    source_catalog_item_id: line.sourceCatalogItemId || null,
    description: line.description,
    unit_label: line.unitLabel.trim() || null,
    hsn_sac: line.hsnSac.trim() || null,
    quantity: line.quantity,
    unit_price_minor: rupeesToPaise(line.unitPriceRupees),
    gst_category: line.gstCategory,
    gst_rate: line.gstCategory === "taxable" ? line.gstRate : null,
  }));
}
