import { describe, expect, it } from "vitest";
import {
  quoteLineSchema,
  quoteLinesSchema,
  quoteSnapshotSchema,
  savedLineToInput,
  toRpcLines,
  toRpcSnapshot,
} from "./validation";

const baseLine = {
  clientId: "line-1",
  sourceCatalogItemId: "",
  description: "Consulting",
  unitLabel: "hour",
  hsnSac: "9983",
  quantity: "1.5",
  unitPriceRupees: "0.01",
  gstCategory: "taxable",
  gstRate: "18",
};

describe("quotation draft input", () => {
  it("transports rupees as exact integer paise and quantity as decimal text", () => {
    const line = quoteLineSchema.parse(baseLine);
    expect(toRpcLines([line])[0]).toMatchObject({
      quantity: "1.5",
      unit_price_minor: "1",
      gst_rate: "18",
    });
  });

  it("rejects fourth-decimal quantities and missing line content", () => {
    expect(quoteLineSchema.safeParse({ ...baseLine, quantity: "1.2345" }).success).toBe(
      false,
    );
    expect(quoteLineSchema.safeParse({ ...baseLine, quantity: "0.000" }).success).toBe(
      false,
    );
    expect(quoteLineSchema.safeParse({ ...baseLine, unitLabel: "" }).success).toBe(false);
    expect(quoteLinesSchema.safeParse(Array(101).fill(baseLine)).success).toBe(false);
  });

  it("normalizes PostgreSQL numeric scale when reopening a saved line", () => {
    const reopened = savedLineToInput({
      id: "line-1",
      source_catalog_item_id: null,
      description: "Consulting",
      unit_label: "hour",
      hsn_sac: null,
      quantity: "1.000000",
      unit_price_minor: "1",
      gst_category: "no_gst",
      gst_rate: null,
    });

    expect(reopened.quantity).toBe("1");
    expect(quoteLineSchema.safeParse(reopened).success).toBe(true);
  });

  it("keeps exempt and no-GST explicit, without an inferred rate", () => {
    expect(
      quoteLineSchema.safeParse({ ...baseLine, gstCategory: "exempt", gstRate: "18" })
        .success,
    ).toBe(false);
    const exempt = quoteLineSchema.parse({
      ...baseLine,
      gstCategory: "exempt",
      gstRate: "",
    });
    expect(toRpcLines([exempt])[0]).toMatchObject({
      gst_category: "exempt",
      gst_rate: null,
    });
  });

  it("preserves explicit declarations and route override", () => {
    const parsed = quoteSnapshotSchema.parse({
      sellerDisplayName: "Seller",
      sellerContactEmail: "",
      sellerContactPhone: "",
      sellerPostalAddress: "Address",
      sellerStateCode: "29",
      sellerGstRegistered: "yes",
      sellerGstin: "29ABCDE1234F1Z5",
      buyerDisplayName: "Buyer",
      buyerContactName: "",
      buyerEmail: "",
      buyerPhone: "",
      buyerBillingAddress: "Address",
      buyerStateCode: "27",
      buyerGstinApplicable: "no",
      buyerGstin: "",
      gstTreatmentOverride: "cgst_sgst",
      documentTimeZone: "Asia/Kolkata",
      placeOfSupplyApplicable: "unset",
      placeOfSupplyStateCode: "",
      placeOfSupplyText: "",
      reverseChargeApplies: "no",
      validUntil: "",
      sellerBankName: "",
      sellerBankAccountName: "",
      sellerBankAccountNumber: "",
      sellerBankIfsc: "",
      sellerUpiId: "",
      paymentInstructions: "",
      terms: "",
    });
    expect(toRpcSnapshot(parsed)).toMatchObject({
      seller_gst_registered: true,
      buyer_gstin_applicable: false,
      gst_treatment_override: "cgst_sgst",
      place_of_supply_applicable: null,
      reverse_charge_applies: false,
    });
  });
});
