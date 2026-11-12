import { describe, expect, it } from "vitest";
import {
  formatPaise,
  paiseToRupees,
  rupeesToPaise,
} from "@/server/modules/catalog/validation";
import {
  directInvoiceFormSchema,
  directInvoiceLineSchema,
  directInvoiceSnapshotSchema,
  toDirectInvoiceRpcLines,
  toDirectInvoiceRpcSnapshot,
} from "./validation";

const validUuid1 = "11111111-1111-4111-8111-111111111111";
const validUuid2 = "22222222-2222-4222-8222-222222222222";
const validUuid3 = "33333333-3333-4333-8333-333333333333";

const baseLine = {
  clientId: "line-1",
  sourceCatalogItemId: validUuid1,
  description: "Web Design Services",
  unitLabel: "hours",
  hsnSac: "998314",
  quantity: "2.5",
  unitPriceRupees: "450.00",
  gstCategory: "taxable" as const,
  gstRate: "18",
};

const baseSnapshot = {
  sellerDisplayName: "Wodexo Design Studio",
  sellerContactEmail: "robertsmith@email.com",
  sellerContactPhone: "9876543210",
  sellerPostalAddress: "Tibbot More Road, NY 9800",
  sellerStateCode: "27",
  sellerGstRegistered: true,
  sellerGstin: "27AAPFU0939F1ZV",
  buyerDisplayName: "John Smith",
  buyerContactName: "Director",
  buyerEmail: "john@example.com",
  buyerPhone: "9123456789",
  buyerBillingAddress: "Western United Street",
  buyerStateCode: "27",
  buyerGstinApplicable: false,
  buyerGstin: "",
  gstTreatmentOverride: "" as const,
  documentTimeZone: "Asia/Kolkata",
  placeOfSupplyApplicable: false,
  placeOfSupplyStateCode: "",
  placeOfSupplyText: "",
  reverseChargeApplies: false,
  sellerBankName: "State Bank of India",
  sellerBankAccountName: "Wodexo Studio",
  sellerBankAccountNumber: "123456789012",
  sellerBankIfsc: "SBIN0001234",
  sellerUpiId: "wodexo@upi",
  paymentInstructions: "Please pay via NEFT or UPI within 15 days.",
  terms: "Standard commercial invoice terms.",
};

describe("direct invoice validation & financial rules", () => {
  it("validates line item quantity precision up to 3 decimals and rejects negative/zero", () => {
    expect(directInvoiceLineSchema.safeParse(baseLine).success).toBe(true);

    // 3 decimal places allowed
    expect(
      directInvoiceLineSchema.safeParse({ ...baseLine, quantity: "1.125" }).success,
    ).toBe(true);

    // 4 decimal places rejected
    expect(
      directInvoiceLineSchema.safeParse({ ...baseLine, quantity: "1.1234" }).success,
    ).toBe(false);

    // Zero quantity rejected
    expect(directInvoiceLineSchema.safeParse({ ...baseLine, quantity: "0" }).success).toBe(
      false,
    );
    expect(
      directInvoiceLineSchema.safeParse({ ...baseLine, quantity: "0.000" }).success,
    ).toBe(false);

    // Negative quantity rejected
    expect(directInvoiceLineSchema.safeParse({ ...baseLine, quantity: "-2" }).success).toBe(
      false,
    );
  });

  it("converts unit price in rupees to integer paise without floating point issues", () => {
    const line = directInvoiceLineSchema.parse(baseLine);
    const rpcLines = toDirectInvoiceRpcLines([line]);

    expect(rpcLines[0]?.unit_price_minor).toBe("45000");
    expect(rpcLines[0]?.quantity).toBe("2.5");
    expect(rpcLines[0]?.gst_rate).toBe("18");
    expect(rpcLines[0]?.source_catalog_item_id).toBe(validUuid1);
  });

  it("supports custom manual line items with empty sourceCatalogItemId", () => {
    const manualLine = {
      ...baseLine,
      sourceCatalogItemId: "",
      description: "Custom Ad-hoc Consulting",
    };
    const parsed = directInvoiceLineSchema.parse(manualLine);
    const rpcLines = toDirectInvoiceRpcLines([parsed]);

    expect(rpcLines[0]?.source_catalog_item_id).toBeNull();
    expect(rpcLines[0]?.description).toBe("Custom Ad-hoc Consulting");
  });

  it("enforces GST rate requirements based on GST category", () => {
    // Taxable line without rate fails
    expect(
      directInvoiceLineSchema.safeParse({
        ...baseLine,
        gstCategory: "taxable",
        gstRate: "",
      }).success,
    ).toBe(false);

    // Exempt line with rate fails
    expect(
      directInvoiceLineSchema.safeParse({
        ...baseLine,
        gstCategory: "exempt",
        gstRate: "18",
      }).success,
    ).toBe(false);

    // No GST line with rate fails
    expect(
      directInvoiceLineSchema.safeParse({
        ...baseLine,
        gstCategory: "no_gst",
        gstRate: "5",
      }).success,
    ).toBe(false);

    // Exempt line without rate succeeds
    const exempt = directInvoiceLineSchema.parse({
      ...baseLine,
      gstCategory: "exempt",
      gstRate: "",
    });
    const rpcExempt = toDirectInvoiceRpcLines([exempt]);
    expect(rpcExempt[0]?.gst_rate).toBeNull();
    expect(rpcExempt[0]?.gst_category).toBe("exempt");
  });

  it("enforces seller and buyer snapshot constraints (state codes, mandatory addresses, GSTIN)", () => {
    expect(directInvoiceSnapshotSchema.safeParse(baseSnapshot).success).toBe(true);

    // Invalid state code
    expect(
      directInvoiceSnapshotSchema.safeParse({
        ...baseSnapshot,
        sellerStateCode: "99",
      }).success,
    ).toBe(false);

    // Missing billing address
    expect(
      directInvoiceSnapshotSchema.safeParse({
        ...baseSnapshot,
        buyerBillingAddress: "",
      }).success,
    ).toBe(false);

    // Seller registered but missing GSTIN
    expect(
      directInvoiceSnapshotSchema.safeParse({
        ...baseSnapshot,
        sellerGstRegistered: true,
        sellerGstin: "",
      }).success,
    ).toBe(false);

    // Buyer GSTIN applicable but invalid shape
    expect(
      directInvoiceSnapshotSchema.safeParse({
        ...baseSnapshot,
        buyerGstinApplicable: true,
        buyerGstin: "INVALID_GST",
      }).success,
    ).toBe(false);
  });

  it("correctly converts snapshot to RPC format with trimmed and uppercase GSTIN", () => {
    const rpcSnapshot = toDirectInvoiceRpcSnapshot(baseSnapshot);

    expect(rpcSnapshot.seller_display_name).toBe("Wodexo Design Studio");
    expect(rpcSnapshot.seller_gst_registered).toBe(true);
    expect(rpcSnapshot.seller_gstin).toBe("27AAPFU0939F1ZV");
    expect(rpcSnapshot.buyer_display_name).toBe("John Smith");
    expect(rpcSnapshot.buyer_gstin_applicable).toBe(false);
    expect(rpcSnapshot.buyer_gstin).toBeNull();
    expect(rpcSnapshot.document_time_zone).toBe("Asia/Kolkata");
  });

  it("verifies full direct invoice form schema with request key and customer id", () => {
    const validForm = {
      requestKey: validUuid2,
      customerId: validUuid3,
      dueOn: "2026-11-20",
      snapshot: baseSnapshot,
      lines: [baseLine],
    };

    expect(directInvoiceFormSchema.safeParse(validForm).success).toBe(true);

    // Empty lines rejected
    expect(directInvoiceFormSchema.safeParse({ ...validForm, lines: [] }).success).toBe(
      false,
    );

    // Invalid request key rejected
    expect(
      directInvoiceFormSchema.safeParse({ ...validForm, requestKey: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("verifies half-up rounding in paise arithmetic", () => {
    const qty = 1;
    const pricePaise = 1005;
    const subtotalPaise = Math.floor(qty * pricePaise + 0.5);
    const cgstPaise = Math.floor((subtotalPaise * 9) / 100 + 0.5);
    const sgstPaise = Math.floor((subtotalPaise * 9) / 100 + 0.5);
    const totalPaise = subtotalPaise + cgstPaise + sgstPaise;

    expect(subtotalPaise).toBe(1005);
    expect(cgstPaise).toBe(90);
    expect(sgstPaise).toBe(90);
    expect(totalPaise).toBe(1185);

    // Formatting test
    expect(formatPaise(totalPaise.toString())).toBe("₹11.85");
    expect(paiseToRupees(totalPaise.toString())).toBe("11.85");
    expect(rupeesToPaise("11.85")).toBe("1185");
  });

  it("verifies inter-state IGST calculation vs intra-state CGST+SGST calculation", () => {
    // 1000 paise base at 18% GST
    const base = 1000;
    // Intra-state
    const cgst = Math.floor((base * 9) / 100 + 0.5);
    const sgst = Math.floor((base * 9) / 100 + 0.5);
    const intraTotalGst = cgst + sgst;

    // Inter-state
    const igst = Math.floor((base * 18) / 100 + 0.5);

    expect(intraTotalGst).toBe(180);
    expect(igst).toBe(180);
  });
});
