import type { PublicInvoice } from "./public-broker";
import type { InvoiceDetail } from "./queries";

export type InvoiceDocumentLine = {
  position: number;
  description: string;
  unit_label: string;
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
};

export type InvoiceDocument = {
  kind: "invoice";
  reference: string;
  invoice_date: string;
  due_on: string | null;
  issued_at: string;
  seller: {
    display_name: string;
    email: string | null;
    phone: string | null;
    address: string;
    country_code: string;
    state_code: string;
    gst_registered: boolean;
    gstin: string | null;
  };
  buyer: {
    display_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    billing_address: string;
    state_code: string;
    gstin_applicable: boolean;
    gstin: string | null;
  };
  document: {
    currency_code: string;
    currency_exponent: number;
    quantity_scale: number;
    calculation_rule_code: string;
    price_tax_mode: string;
    gst_auto_treatment: string;
    gst_treatment_override: string | null;
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
  remittance: {
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    upi_id: string | null;
    payment_instructions: string | null;
  };
  lines: InvoiceDocumentLine[];
};

export function toInvoiceDocument(invoice: InvoiceDetail): InvoiceDocument {
  return {
    kind: "invoice",
    reference: invoice.reference,
    invoice_date: invoice.invoice_date,
    due_on: invoice.due_on,
    issued_at: invoice.issued_at,
    seller: {
      display_name: invoice.seller_display_name,
      email: invoice.seller_contact_email,
      phone: invoice.seller_contact_phone,
      address: invoice.seller_postal_address,
      country_code: invoice.seller_country_code,
      state_code: invoice.seller_state_code,
      gst_registered: invoice.seller_gst_registered,
      gstin: invoice.seller_gstin,
    },
    buyer: {
      display_name: invoice.buyer_display_name,
      contact_name: invoice.buyer_contact_name,
      email: invoice.buyer_email,
      phone: invoice.buyer_phone,
      billing_address: invoice.buyer_billing_address,
      state_code: invoice.buyer_state_code,
      gstin_applicable: invoice.buyer_gstin_applicable,
      gstin: invoice.buyer_gstin,
    },
    document: {
      currency_code: invoice.currency_code,
      currency_exponent: invoice.currency_exponent,
      quantity_scale: invoice.quantity_scale,
      calculation_rule_code: invoice.calculation_rule_code,
      price_tax_mode: invoice.price_tax_mode,
      gst_auto_treatment: invoice.gst_auto_treatment,
      gst_treatment_override: invoice.gst_treatment_override,
      gst_treatment: invoice.gst_treatment,
      document_time_zone: invoice.document_time_zone,
      place_of_supply_applicable: invoice.place_of_supply_applicable,
      place_of_supply_state_code: invoice.place_of_supply_state_code,
      place_of_supply_text: invoice.place_of_supply_text,
      reverse_charge_applies: invoice.reverse_charge_applies,
      terms: invoice.terms,
    },
    totals: {
      subtotal_minor: invoice.subtotal_minor,
      taxable_subtotal_minor: invoice.taxable_subtotal_minor,
      cgst_total_minor: invoice.cgst_total_minor,
      sgst_total_minor: invoice.sgst_total_minor,
      igst_total_minor: invoice.igst_total_minor,
      gst_total_minor: invoice.gst_total_minor,
      total_minor: invoice.total_minor,
    },
    remittance: {
      bank_name: invoice.seller_bank_name,
      bank_account_name: invoice.seller_bank_account_name,
      bank_account_number: invoice.seller_bank_account_number,
      bank_ifsc: invoice.seller_bank_ifsc,
      upi_id: invoice.seller_upi_id,
      payment_instructions: invoice.payment_instructions,
    },
    lines: invoice.items.map((item) => ({
      position: item.position,
      description: item.description,
      unit_label: item.unit_label,
      hsn_sac: item.hsn_sac,
      quantity: String(item.quantity),
      unit_price_minor: item.unit_price_minor,
      line_subtotal_minor: item.line_subtotal_minor,
      gst_category: item.gst_category,
      gst_treatment: item.gst_treatment,
      gst_rate: item.gst_rate,
      taxable_amount_minor: item.taxable_amount_minor,
      cgst_rate: item.cgst_rate,
      cgst_amount_minor: item.cgst_amount_minor,
      sgst_rate: item.sgst_rate,
      sgst_amount_minor: item.sgst_amount_minor,
      igst_rate: item.igst_rate,
      igst_amount_minor: item.igst_amount_minor,
      line_total_minor: item.line_total_minor,
    })),
  };
}

export function publicInvoiceToDocument(invoice: PublicInvoice): InvoiceDocument {
  return {
    ...invoice,
    lines: invoice.lines.map((line) => ({ ...line, quantity: String(line.quantity) })),
  };
}
