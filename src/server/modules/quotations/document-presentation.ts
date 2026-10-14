import { indianStates } from "@/server/modules/business/states";
import type { QuotationDocument } from "./document-model";

export function formatQuotationDate(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatQuotationQuantity(value: string) {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

export function componentAmountMinor(quantity: string, unitPriceMinor: string) {
  const [whole, fraction = ""] = quantity.split(".", 2);
  const scale = BigInt(1000);
  const quantityThousandths = BigInt(whole) * scale + BigInt(fraction.padEnd(3, "0"));
  return ((quantityThousandths * BigInt(unitPriceMinor) + BigInt(500)) / scale).toString();
}

export function splitQuotationDescription(description: string) {
  const [title = "", ...details] = description.split("\n");
  return { title, detail: details.join("\n") };
}

export function quotationGstLabel(line: QuotationDocument["lines"][number]) {
  const categories: Record<string, string> = {
    no_gst: "No GST",
    exempt: "Exempt",
    nil_rated: "Nil rated",
    non_gst: "Non GST",
  };
  return {
    rate:
      line.gst_rate !== null
        ? `${formatQuotationQuantity(line.gst_rate)}%`
        : (categories[line.gst_category] ?? line.gst_category.replaceAll("_", " ")),
    treatment:
      line.gst_rate === null
        ? ""
        : line.gst_treatment === "cgst_sgst"
          ? "CGST + SGST"
          : line.gst_treatment === "igst"
            ? "IGST"
            : "",
  };
}

export function quotationPriceNote(quote: QuotationDocument) {
  return quote.document.price_tax_mode === "inclusive"
    ? "Prices include GST where applicable."
    : "Prices shown before GST where applicable.";
}

export function quotationSupplyDetails(quote: QuotationDocument) {
  const settings = quote.document;
  const state = indianStates.find(([code]) => code === settings.place_of_supply_state_code);
  return [
    settings.place_of_supply_applicable
      ? `Place of supply: ${
          [
            settings.place_of_supply_text,
            state ? `${state[1]} (${state[0]})` : settings.place_of_supply_state_code,
          ]
            .filter(Boolean)
            .join(" · ") || "Specified"
        }`
      : "Place of supply: Not specified",
    `Reverse charge: ${settings.reverse_charge_applies ? "Applies" : "Does not apply"}`,
  ];
}

export function quotationTotalRows(quote: QuotationDocument) {
  const totals = quote.totals;
  const rows = [{ label: "Subtotal", value: totals.subtotal_minor }];
  if (totals.taxable_subtotal_minor !== totals.subtotal_minor) {
    rows.push({ label: "Taxable subtotal", value: totals.taxable_subtotal_minor });
  }
  for (const [label, value] of [
    ["CGST", totals.cgst_total_minor],
    ["SGST", totals.sgst_total_minor],
    ["IGST", totals.igst_total_minor],
  ]) {
    if (value && BigInt(value) !== BigInt(0)) rows.push({ label: label ?? "GST", value });
  }
  if (BigInt(totals.gst_total_minor) === BigInt(0)) {
    rows.push({ label: "GST", value: totals.gst_total_minor });
  }
  return rows;
}

export function quotationPaymentDetails(quote: QuotationDocument) {
  const seller = quote.seller;
  return [
    seller.bank_name ? `Bank: ${seller.bank_name}` : null,
    seller.bank_account_name ? `Account name: ${seller.bank_account_name}` : null,
    seller.bank_account_number ? `Account number: ${seller.bank_account_number}` : null,
    seller.bank_ifsc ? `IFSC: ${seller.bank_ifsc}` : null,
    seller.upi_id ? `UPI: ${seller.upi_id}` : null,
    seller.payment_instructions,
  ].filter((value): value is string => Boolean(value));
}
