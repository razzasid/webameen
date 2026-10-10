import type { PublicQuotation } from "./public-broker";

type JsonRecord = Record<string, string | number | boolean | null>;

function text(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return value === null || value === undefined ? null : String(value);
}

function bool(record: JsonRecord, key: string): boolean {
  return record[key] === true;
}

export type QuotationDocument = {
  reference: string;
  version_number: number;
  state: string;
  valid_until: string | null;
  seller: {
    display_name: string;
    email: string | null;
    phone: string | null;
    address: string;
    country_code: string | null;
    state_code: string | null;
    gst_registered: boolean;
    gstin: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    upi_id: string | null;
    payment_instructions: string | null;
  };
  buyer: {
    display_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    billing_address: string;
    state_code: string | null;
    gstin_applicable: boolean;
    gstin: string | null;
  };
  document: {
    currency_code: string;
    price_tax_mode: string;
    gst_treatment: string;
    document_time_zone: string;
    place_of_supply_applicable: boolean;
    place_of_supply_state_code: string | null;
    place_of_supply_text: string | null;
    reverse_charge_applies: boolean;
    terms: string | null;
  };
  totals: {
    subtotal_minor: string;
    taxable_subtotal_minor: string;
    cgst_total_minor: string;
    sgst_total_minor: string;
    igst_total_minor: string;
    gst_total_minor: string;
    total_minor: string;
  };
  lines: Array<{
    position: number;
    description: string;
    unit_label: string;
    hsn_sac: string | null;
    quantity: string;
    unit_price_minor: string;
    gst_category: string;
    gst_treatment: string;
    gst_rate: string | null;
    taxable_amount_minor: string;
    cgst_amount_minor: string;
    sgst_amount_minor: string;
    igst_amount_minor: string;
    line_total_minor: string;
  }>;
};

export function toQuotationDocument(quotation: PublicQuotation): QuotationDocument {
  const seller = quotation.seller as JsonRecord;
  const buyer = quotation.buyer as JsonRecord;
  const settings = quotation.document as JsonRecord;
  const totals = quotation.totals as JsonRecord;
  return {
    reference: quotation.reference,
    version_number: quotation.version_number,
    state: quotation.state,
    valid_until: quotation.valid_until,
    seller: {
      display_name: text(seller, "display_name") ?? "",
      email: text(seller, "email"),
      phone: text(seller, "phone"),
      address: text(seller, "address") ?? "",
      country_code: text(seller, "country_code"),
      state_code: text(seller, "state_code"),
      gst_registered: bool(seller, "gst_registered"),
      gstin: text(seller, "gstin"),
      bank_name: text(seller, "bank_name"),
      bank_account_name: text(seller, "bank_account_name"),
      bank_account_number: text(seller, "bank_account_number"),
      bank_ifsc: text(seller, "bank_ifsc"),
      upi_id: text(seller, "upi_id"),
      payment_instructions: text(seller, "payment_instructions"),
    },
    buyer: {
      display_name: text(buyer, "display_name") ?? "",
      contact_name: text(buyer, "contact_name"),
      email: text(buyer, "email"),
      phone: text(buyer, "phone"),
      billing_address: text(buyer, "billing_address") ?? "",
      state_code: text(buyer, "state_code"),
      gstin_applicable: bool(buyer, "gstin_applicable"),
      gstin: text(buyer, "gstin"),
    },
    document: {
      currency_code: text(settings, "currency_code") ?? "INR",
      price_tax_mode: text(settings, "price_tax_mode") ?? "exclusive",
      gst_treatment: text(settings, "gst_treatment") ?? "",
      document_time_zone: text(settings, "document_time_zone") ?? "Asia/Kolkata",
      place_of_supply_applicable: bool(settings, "place_of_supply_applicable"),
      place_of_supply_state_code: text(settings, "place_of_supply_state_code"),
      place_of_supply_text: text(settings, "place_of_supply_text"),
      reverse_charge_applies: bool(settings, "reverse_charge_applies"),
      terms: text(settings, "terms"),
    },
    totals: {
      subtotal_minor: text(totals, "subtotal_minor") ?? "0",
      taxable_subtotal_minor: text(totals, "taxable_subtotal_minor") ?? "0",
      cgst_total_minor: text(totals, "cgst_total_minor") ?? "0",
      sgst_total_minor: text(totals, "sgst_total_minor") ?? "0",
      igst_total_minor: text(totals, "igst_total_minor") ?? "0",
      gst_total_minor: text(totals, "gst_total_minor") ?? "0",
      total_minor: text(totals, "total_minor") ?? "0",
    },
    lines: quotation.lines.map((line) => {
      const record = line as JsonRecord;
      return {
        position: Number(record.position ?? 0),
        description: text(record, "description") ?? "",
        unit_label: text(record, "unit_label") ?? "",
        hsn_sac: text(record, "hsn_sac"),
        quantity: text(record, "quantity") ?? "0",
        unit_price_minor: text(record, "unit_price_minor") ?? "0",
        gst_category: text(record, "gst_category") ?? "no_gst",
        gst_treatment: text(record, "gst_treatment") ?? "",
        gst_rate: text(record, "gst_rate"),
        taxable_amount_minor: text(record, "taxable_amount_minor") ?? "0",
        cgst_amount_minor: text(record, "cgst_amount_minor") ?? "0",
        sgst_amount_minor: text(record, "sgst_amount_minor") ?? "0",
        igst_amount_minor: text(record, "igst_amount_minor") ?? "0",
        line_total_minor: text(record, "line_total_minor") ?? "0",
      };
    }),
  };
}
