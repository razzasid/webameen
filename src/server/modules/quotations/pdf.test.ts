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
  const objects = new Map(
    Array.from(
      source.matchAll(/(?:^|\n)(\d+) 0 obj\b([\s\S]*?)\nendobj/g),
      ([, id, body]) => [Number(id), body ?? ""] as const,
    ),
  );
  const maps = new Map<number, Map<number, string>>();
  for (const [id, body] of objects) {
    const unicodeId = body.match(/\/ToUnicode (\d+) 0 R/)?.[1];
    if (!unicodeId) continue;
    const cmap = objects.get(Number(unicodeId)) ?? "";
    const glyphs = new Map<number, string>();
    for (const [, start, , values] of cmap.matchAll(
      /<([\da-fA-F]+)>\s*<([\da-fA-F]+)>\s*\[([\s\S]*?)\]/g,
    )) {
      const entries = Array.from((values ?? "").matchAll(/<([\da-fA-F\s]+)>/g), ([, hex]) =>
        Array.from((hex ?? "").replaceAll(/\s/g, "").matchAll(/.{4}/g), ([unit]) =>
          String.fromCharCode(Number.parseInt(unit, 16)),
        ).join(""),
      );
      entries.forEach((value, offset) => {
        glyphs.set(Number.parseInt(start ?? "0", 16) + offset, value);
      });
    }
    maps.set(id, glyphs);
  }
  const fonts = new Map(
    Array.from(
      source.matchAll(/\/(F\d+) (\d+) 0 R/g),
      ([, name, id]) => [name ?? "", maps.get(Number(id))] as const,
    ),
  );
  return Array.from(objects.values())
    .filter((body) => /\/Type \/Page\b/.test(body))
    .map((page) => {
      const contentId = page.match(/\/Contents (\d+) 0 R/)?.[1];
      const stream = objects.get(Number(contentId)) ?? "";
      let font = "";
      const text: string[] = [];
      for (const [, fontName, operands] of stream.matchAll(
        /\/(F\d+) [\d.]+ Tf|\[([\s\S]*?)\]\s*TJ/g,
      )) {
        if (fontName) {
          font = fontName;
          continue;
        }
        const glyphs = fonts.get(font);
        text.push(
          Array.from((operands ?? "").matchAll(/<([\da-fA-F]+)>/g), ([, hex]) =>
            glyphs
              ? Array.from(
                  (hex ?? "").matchAll(/.{4}/g),
                  ([code]) => glyphs.get(Number.parseInt(code, 16)) ?? "",
                ).join("")
              : Buffer.from(hex ?? "", "hex").toString("latin1"),
          ).join(""),
        );
      }
      return text.join("\n");
    });
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
    expect(content).toContain("₹0.01");
    expect(content).toContain("Signature over printed name");
    expect(content).not.toContain("Approve quotation");
    expect(content).not.toContain("Request changes");
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
    expect(searchablePdfText(pdf)).toContain("Service line 55");
    for (const page of pages) {
      expect(page).toMatch(/Service line|Quotation total|Acceptance/);
    }
  });
  it("keeps subproduct tables associated with their parent across pages", async () => {
    const model = toQuotationDocument(quotation);
    const parent = model.lines[0];
    if (!parent) throw new Error("Missing parent line.");
    parent.components = Array.from({ length: 20 }, (_, index) => ({
      position: index + 1,
      description: `Material ${index + 1} ${"with detailed specifications ".repeat(10)}`,
      quantity: "1.5",
      unit_label: "",
      unit_price_minor: "12500",
    }));
    const pdf = await renderQuotationPdf(model);
    const content = searchablePdfText(pdf);
    expect(content).toContain("Material 20");
    expect(content).toContain("item 1, continued");
    expect(content).toContain("₹187.50");
    expect(content).toContain("Breakdown only");
  }, 15_000);

  it("preserves long terms and payment instructions without losing their final lines", async () => {
    const model = toQuotationDocument(quotation);
    model.document.terms =
      "Please review the delivery specifications before confirming. ".repeat(80) +
      "\\nEnd of saved terms.";
    model.seller.payment_instructions =
      "Use the saved quotation reference for payment.\\nFinal payment instruction.";
    const pdf = await renderQuotationPdf(model);
    const content = searchablePdfText(pdf);
    expect(content).toContain("Terms & conditions (continued)");
    expect(content).toContain("End of saved terms.");
    expect(content).toContain("Final payment instruction.");
    expect(content).toContain("Acceptance");
  }, 15_000);
});
