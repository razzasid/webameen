import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { listInvoices } from "@/server/modules/invoices/queries";
import { isUuid } from "@/server/shared/uuid";

export type PaymentReversal = {
  reason: string;
  reversed_at: string;
};

export type PaymentReceipt = {
  id: string;
  reference: string;
  issued_at: string;
  replaces_receipt_id: string | null;
};

export type InvoicePayment = {
  payment_id: string;
  amount_minor: string;
  received_at: string;
  method: string;
  external_reference: string | null;
  recorded_at: string;
  replaces_payment_id: string | null;
  reversal: PaymentReversal | null;
  receipt: PaymentReceipt | null;
};

export type InvoicePaymentSummary = {
  invoice_id: string;
  total_minor: string;
  currency_code: string;
  currency_exponent: number;
  due_on: string | null;
  document_time_zone: string;
  local_today: string;
  paid_minor: string;
  outstanding_minor: string;
  payment_status: "paid" | "unpaid" | "part_paid";
  overdue: boolean;
  payments: InvoicePayment[];
};

export type BusinessPaymentHistoryEntry = {
  invoice_id: string;
  invoice_reference: string;
  customer_name: string;
  invoice_date: string;
  payment: InvoicePayment;
  payment_status: InvoicePaymentSummary["payment_status"];
  outstanding_minor: string;
  document_time_zone: string;
};

export async function getInvoicePaymentSummary(
  invoiceId: string,
): Promise<InvoicePaymentSummary> {
  if (!isUuid(invoiceId)) notFound();
  const context = await getBusinessContext();
  if (context.status !== "ready") notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_invoice_payment_summary", {
    p_invoice_id: invoiceId,
  });
  if (error?.code === "P0002" || error?.code === "42501") notFound();
  if (error || !data) throw new Error("Could not load invoice payment history.");
  return data as unknown as InvoicePaymentSummary;
}

export async function getReceiptInvoiceId(receiptId: string): Promise<string> {
  if (!isUuid(receiptId)) notFound();
  const context = await getBusinessContext();
  if (context.status !== "ready") notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("invoice_id")
    .eq("business_id", context.business.id)
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw new Error("Could not load this receipt.");
  if (!data) notFound();
  return data.invoice_id;
}

export async function listBusinessPayments(): Promise<BusinessPaymentHistoryEntry[]> {
  const invoices = await listInvoices();
  const summaries = await Promise.all(
    invoices.map(async (invoice) => ({
      invoice,
      summary: await getInvoicePaymentSummary(invoice.id),
    })),
  );
  return summaries
    .flatMap(({ invoice, summary }) =>
      summary.payments.map((payment) => ({
        invoice_id: invoice.id,
        invoice_reference: invoice.reference,
        customer_name: invoice.buyer_display_name,
        invoice_date: invoice.invoice_date,
        payment,
        payment_status: summary.payment_status,
        outstanding_minor: summary.outstanding_minor,
        document_time_zone: summary.document_time_zone,
      })),
    )
    .sort(
      (first, second) =>
        new Date(second.payment.recorded_at).getTime() -
        new Date(first.payment.recorded_at).getTime(),
    );
}
