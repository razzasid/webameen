import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnvironment, serverEnvironment } from "@/config/env";

export type PublicInvoice = {
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
  lines: Array<{
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
  }>;
};

function createInvoiceBrokerClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url } = publicEnvironment;
  const { SUPABASE_INVOICE_BROKER_KEY: key } = serverEnvironment;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function readPublicInvoice(tokenHashHex: string) {
  const client = createInvoiceBrokerClient();
  if (!client) return { data: null, error: new Error("Invoice access is not configured.") };
  return client.rpc("read_public_invoice", { p_token_hash_hex: tokenHashHex });
}
