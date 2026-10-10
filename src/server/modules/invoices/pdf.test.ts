import { describe, expect, it, vi } from "vitest";
import type { InvoiceDocument } from "./document-model";

vi.mock("server-only", () => ({}));

import { renderInvoicePdf } from "./pdf";

const line: InvoiceDocument["lines"][number] = {
  position: 1,
  description: "Consulting service",
  unit_label: "day",
  hsn_sac: "9983",
  quantity: "1.125000",
  unit_price_minor: "10000",
  line_subtotal_minor: "11250",
  gst_category: "taxable",
  gst_treatment: "cgst_sgst",
  gst_rate: "18",
  taxable_amount_minor: "11250",
  cgst_rate: "9",
  cgst_amount_minor: "1013",
  sgst_rate: "9",
  sgst_amount_minor: "1012",
  igst_rate: null,
  igst_amount_minor: "0",
  line_total_minor: "13275",
};

const fixture: InvoiceDocument = {
  kind: "invoice",
  reference: "WEB/TEST/0100",
  invoice_date: "2026-10-10",
  due_on: null,
  issued_at: "2026-10-10T10:00:00.000Z",
  seller: {
    display_name: "Frozen Seller",
    email: null,
    phone: null,
    address: "Seller street",
    country_code: "IN",
    state_code: "29",
    gst_registered: false,
    gstin: null,
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
    currency_exponent: 2,
    quantity_scale: 3,
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
    subtotal_minor: "11250",
    taxable_subtotal_minor: "11250",
    cgst_total_minor: "1013",
    sgst_total_minor: "1012",
    igst_total_minor: "0",
    gst_total_minor: "2025",
    total_minor: "13275",
  },
  remittance: {
    bank_name: null,
    bank_account_name: null,
    bank_account_number: null,
    bank_ifsc: null,
    upi_id: null,
    payment_instructions: null,
  },
  lines: [line],
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

describe("invoice PDF rendering", () => {
  it("renders a compact frozen snapshot and tolerates absent optional remittance and terms", async () => {
    const pdf = await renderInvoicePdf(fixture);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(Number(pdf.toString("latin1").match(/\/Count (\d+)/)?.[1])).toBe(1);
    expect(searchablePdfText(pdf)).toContain("WEB/TEST/0100");
    expect(searchablePdfText(pdf)).toContain("Consulting service");
    expect(searchablePdfText(pdf)).not.toContain("INR 132.75 INR");
  });

  it("includes frozen payment details and terms when present", async () => {
    const withPaymentDetails: InvoiceDocument = {
      ...fixture,
      document: { ...fixture.document, terms: "Payment is due within 14 days." },
      remittance: {
        bank_name: "Example Bank",
        bank_account_name: "Frozen Seller",
        bank_account_number: "000123456789",
        bank_ifsc: "EXAM0000123",
        upi_id: "seller@example",
        payment_instructions: "Use the invoice reference as the payment note.",
      },
    };
    const pdf = await renderInvoicePdf(withPaymentDetails);
    const content = searchablePdfText(pdf);
    expect(content).toContain("Example Bank");
    expect(content).toContain("000123456789");
    expect(content).toContain("seller@example");
    expect(content).toContain("Payment is due within 14 days.");
  });

  it("keeps long line lists paginated and includes mixed GST and tiny paise values", async () => {
    const multiPage: InvoiceDocument = {
      ...fixture,
      totals: {
        ...fixture.totals,
        subtotal_minor: "51",
        taxable_subtotal_minor: "51",
        cgst_total_minor: "0",
        sgst_total_minor: "0",
        igst_total_minor: "1",
        gst_total_minor: "1",
        total_minor: "52",
      },
      lines: Array.from({ length: 55 }, (_, index) => ({
        ...line,
        position: index + 1,
        description: `Service line ${index + 1} ${"with a long description ".repeat(4)}`,
        gst_treatment: index % 2 === 0 ? "igst" : "cgst_sgst",
        gst_rate: index % 2 === 0 ? "0.01" : "18",
        cgst_amount_minor: index % 2 === 0 ? "0" : "1",
        sgst_amount_minor: "0",
        igst_rate: index % 2 === 0 ? "0.01" : null,
        igst_amount_minor: index % 2 === 0 ? "1" : "0",
        line_total_minor: "1",
      })),
    };
    const pdf = await renderInvoicePdf(multiPage);
    const source = pdf.toString("latin1");
    const pageCount = Number(source.match(/\/Count (\d+)/)?.[1]);
    const searchablePages = searchablePdfPages(pdf);
    expect(pageCount).toBeGreaterThan(1);
    expect((source.match(/\/Type \/Page\b/g) ?? []).length).toBe(pageCount);
    expect(searchablePages).toHaveLength(pageCount);
    for (const page of searchablePages.filter((text) => text.includes("Service line"))) {
      expect(page).toContain("Description");
    }
    expect(pdf.byteLength).toBeLessThan(4 * 1024 * 1024);
  });
});
