import { describe, expect, it, vi } from "vitest";
import type { PublicQuotation } from "./public-broker";

vi.mock("server-only", () => ({}));

import { toQuotationDocument } from "./document-model";
import { renderQuotationPdf } from "./pdf";

const quotation: PublicQuotation = {
  reference: "Q-2026-0100",
  version_number: 1,
  state: "approved",
  revision_in_preparation: false,
  valid_until: "2026-10-31",
  response_deadline_at: null,
  response_deadline_passed: false,
  seller: {
    display_name: "Frozen Seller",
    email: null,
    phone: null,
    address: "Seller street",
    country_code: "IN",
    state_code: "29",
    gst_registered: false,
    gstin: null,
    bank_name: null,
    bank_account_name: null,
    bank_account_number: null,
    bank_ifsc: null,
    upi_id: null,
    payment_instructions: null,
  },
  buyer: {
    display_name: "Frozen Buyer",
    contact_name: null,
    email: null,
    phone: null,
    billing_address: "Buyer street",
    state_code: "29",
    gstin_applicable: false,
    gstin: null,
  },
  document: {
    currency_code: "INR",
    currency_exponent: "2",
    quantity_scale: "3",
    calculation_rule_code: "in-gst-exclusive-line-paise-half-up-v1",
    price_tax_mode: "exclusive",
    gst_auto_treatment: "cgst_sgst",
    gst_treatment_override: null,
    gst_treatment: "cgst_sgst",
    document_time_zone: "Asia/Kolkata",
    place_of_supply_applicable: true,
    place_of_supply_state_code: "29",
    place_of_supply_text: "Karnataka",
    reverse_charge_applies: false,
    terms: null,
  },
  totals: {
    subtotal_minor: "1",
    taxable_subtotal_minor: "1",
    cgst_total_minor: "0",
    sgst_total_minor: "0",
    igst_total_minor: "0",
    gst_total_minor: "0",
    total_minor: "1",
  },
  lines: [
    {
      position: 1,
      description: "Tiny rounding fixture",
      unit_label: "item",
      hsn_sac: null,
      quantity: "1",
      unit_price_minor: "1",
      line_subtotal_minor: "1",
      gst_category: "no_gst",
      gst_treatment: "cgst_sgst",
      gst_rate: null,
      taxable_amount_minor: "1",
      cgst_rate: null,
      cgst_amount_minor: "0",
      sgst_rate: null,
      sgst_amount_minor: "0",
      igst_rate: null,
      igst_amount_minor: "0",
      line_total_minor: "1",
    },
  ],
  response: null,
};

function searchablePdfPages(pdf: Buffer): string[] {
  const source = pdf.toString("latin1");
  const streams = Array.from(
    source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
    ([, stream]) => stream,
  );
  return streams.map((stream) =>
    Array.from(stream.matchAll(/\[([\s\S]*?)\]\s*TJ/g), ([, operands]) =>
      Array.from(operands.matchAll(/<([\da-fA-F]+)>/g), ([, hex]) =>
        Buffer.from(hex, "hex").toString("latin1"),
      ).join(""),
    ).join("\n"),
  );
}

function searchablePdfText(pdf: Buffer): string {
  return searchablePdfPages(pdf).join("\n");
}

describe("quotation PDF rendering", () => {
  it("renders the same frozen public snapshot with a searchable PDF body", async () => {
    const document = toQuotationDocument(quotation);
    const pdf = await renderQuotationPdf(document);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const content = searchablePdfText(pdf);
    expect(content).toContain("Q-2026-0100");
    expect(content).toContain("Tiny rounding fixture");
    expect(content).toContain("Frozen Buyer");
    expect(Number(pdf.toString("latin1").match(/\/Count (\d+)/)?.[1])).toBe(1);
    expect(content).not.toContain("INR 0.01 INR");
  });

  it("includes frozen payment details and terms when present", async () => {
    const withPaymentDetails: PublicQuotation = {
      ...quotation,
      seller: {
        ...quotation.seller,
        bank_name: "Example Bank",
        bank_account_name: "Frozen Seller",
        bank_account_number: "000123456789",
        bank_ifsc: "EXAM0000123",
        upi_id: "seller@example",
        payment_instructions: "Use the quotation reference as the payment note.",
      },
      document: { ...quotation.document, terms: "Payment is due within 14 days." },
    };
    const pdf = await renderQuotationPdf(toQuotationDocument(withPaymentDetails));
    const content = searchablePdfText(pdf);
    expect(content).toContain("Example Bank");
    expect(content).toContain("000123456789");
    expect(content).toContain("seller@example");
    expect(content).toContain("Payment is due within 14 days.");
  });

  it("keeps long quotation line lists paginated", async () => {
    const template = quotation.lines[0];
    if (!template) throw new Error("The quotation fixture needs one line.");
    const multiPage = toQuotationDocument({
      ...quotation,
      lines: Array.from({ length: 55 }, (_, index) => ({
        ...template,
        position: index + 1,
        description: `Service line ${index + 1} ${"with a long description ".repeat(4)}`,
      })),
    });
    const pdf = await renderQuotationPdf(multiPage);
    const source = pdf.toString("latin1");
    const pageCount = Number(source.match(/\/Count (\d+)/)?.[1]);
    const pages = searchablePdfPages(pdf);
    expect(pageCount).toBeGreaterThan(1);
    expect((source.match(/\/Type \/Page\b/g) ?? []).length).toBe(pageCount);
    expect(pages).toHaveLength(pageCount);
    for (const page of pages.filter((text) => text.includes("Service line"))) {
      expect(page).toContain("Description");
    }
    expect(pdf.byteLength).toBeLessThan(4 * 1024 * 1024);
  });
});
