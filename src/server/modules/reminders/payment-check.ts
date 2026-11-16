import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createReminderWorkerClient } from "./client";

export type AuthoritativeInvoicePayment = {
  invoice_id: string;
  business_id: string;
  reference: string;
  total_minor: string;
  paid_minor: string;
  outstanding_minor: string;
  currency_code: string;
  due_on: string | null;
  document_time_zone: string;
  local_today: string;
  payment_status: "paid" | "unpaid" | "part_paid";
  overdue: boolean;
  buyer_display_name: string;
  buyer_contact_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  seller_display_name: string;
};

export async function getAuthoritativePaymentStatus(
  invoiceId: string,
  client?: SupabaseClient,
): Promise<AuthoritativeInvoicePayment | null> {
  const supabase = client || createReminderWorkerClient();

  // Call the stored procedure in private schema
  const { data, error } = await supabase.rpc("get_authoritative_payment_status", {
    p_invoice_id: invoiceId,
  });

  if (error || !data) {
    // Direct query fallback for test environments or RPC fallback
    return fetchDirectPaymentStatus(invoiceId, supabase);
  }

  return data as AuthoritativeInvoicePayment;
}

export async function fetchDirectPaymentStatus(
  invoiceId: string,
  supabase: SupabaseClient,
): Promise<AuthoritativeInvoicePayment | null> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) return null;

  // Retrieve non-reversed payments
  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount_minor")
    .eq("business_id", invoice.business_id)
    .eq("invoice_id", invoiceId);

  const { data: reversals } = await supabase
    .from("payment_reversals")
    .select("payment_id")
    .eq("business_id", invoice.business_id)
    .eq("invoice_id", invoiceId);

  const reversedSet = new Set((reversals || []).map((r) => r.payment_id));
  const validPayments = (payments || []).filter((p) => !reversedSet.has(p.id));

  const totalMinor = BigInt(invoice.total_minor);
  const paidMinor = validPayments.reduce(
    (acc, p) => acc + BigInt(p.amount_minor),
    BigInt(0),
  );
  const outstandingMinor = totalMinor - paidMinor;

  const paymentStatus =
    outstandingMinor <= BigInt(0)
      ? "paid"
      : paidMinor === BigInt(0)
        ? "unpaid"
        : "part_paid";

  const localToday = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(
    invoice.due_on && invoice.due_on < localToday && outstandingMinor > BigInt(0),
  );

  return {
    invoice_id: invoice.id,
    business_id: invoice.business_id,
    reference: invoice.reference,
    total_minor: totalMinor.toString(),
    paid_minor: paidMinor.toString(),
    outstanding_minor: outstandingMinor.toString(),
    currency_code: invoice.currency_code,
    due_on: invoice.due_on,
    document_time_zone: invoice.document_time_zone,
    local_today: localToday,
    payment_status: paymentStatus,
    overdue,
    buyer_display_name: invoice.buyer_display_name,
    buyer_contact_name: invoice.buyer_contact_name,
    buyer_email: invoice.buyer_email,
    buyer_phone: invoice.buyer_phone,
    seller_display_name: invoice.seller_display_name,
  };
}

export async function stopScheduleDueToFullPayment(
  scheduleId: string,
  invoiceId: string,
  businessId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client || createReminderWorkerClient();

  // Mark schedule as completed
  await supabase
    .from("invoice_reminder_schedules")
    .update({
      status: "completed",
      stop_reason: "fully_paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId)
    .eq("business_id", businessId);

  // Skip any remaining pending occurrences
  await supabase
    .from("invoice_reminder_occurrences")
    .update({
      status: "skipped",
      skip_reason: "fully_paid",
      updated_at: new Date().toISOString(),
    })
    .eq("schedule_id", scheduleId)
    .eq("invoice_id", invoiceId)
    .in("status", ["pending", "processing"]);
}
