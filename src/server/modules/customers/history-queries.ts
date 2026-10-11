import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { getInvoicePaymentSummary } from "@/server/modules/payments/queries";
import { getQuotationWorkflow } from "@/server/modules/quotations/queries";
import type { CustomerTimelineEvent } from "./history-model";
import { paginateCustomerTimeline } from "./history-model";

export async function getCustomerTimeline(customerId: string, requestedPage: number) {
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return { ...paginateCustomerTimeline([], 1), timeZone: "Asia/Kolkata" };
  }
  const supabase = await createSupabaseServerClient();
  const [quotationResult, invoiceResult, businessResult] = await Promise.all([
    supabase
      .from("quotations")
      .select("id,reference")
      .eq("business_id", context.business.id)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("invoices")
      .select("id,reference,issued_at,total_minor")
      .eq("business_id", context.business.id)
      .eq("customer_id", customerId)
      .order("issued_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("businesses")
      .select("time_zone")
      .eq("id", context.business.id)
      .maybeSingle(),
  ]);

  if (quotationResult.error || invoiceResult.error || businessResult.error) {
    throw new Error("Could not load customer history.");
  }

  const quotationRows = quotationResult.data ?? [];
  const invoiceRows = invoiceResult.data ?? [];
  const workflows = await Promise.all(
    quotationRows.map((quotation) => getQuotationWorkflow(quotation.id)),
  );
  const paymentSummaries = await Promise.all(
    invoiceRows.map((invoice) => getInvoicePaymentSummary(invoice.id)),
  );
  const events: CustomerTimelineEvent[] = [];

  for (let index = 0; index < quotationRows.length; index += 1) {
    const quotation = quotationRows[index];
    const workflow = workflows[index];
    if (!quotation || !workflow) continue;
    for (const version of workflow.versions) {
      const isRevision = version.version_number > 1;
      events.push({
        id: `quotation:${quotation.id}:version:${version.id}:created`,
        kind: "quotation",
        title: isRevision ? "Quotation revision created" : "Quotation drafted",
        detail: `${quotation.reference} · version ${version.version_number}`,
        occurredAt: version.created_at,
        href: `/quotations/${quotation.id}`,
        amountMinor: version.total_minor,
      });
      if (version.shared_at) {
        events.push({
          id: `quotation:${quotation.id}:version:${version.id}:shared`,
          kind: "quotation",
          title: "Quotation shared",
          detail: `${quotation.reference} · version ${version.version_number}`,
          occurredAt: version.shared_at,
          href: `/quotations/${quotation.id}`,
          amountMinor: version.total_minor,
        });
      }
      if (version.response) {
        const approved = version.response.kind === "approved";
        events.push({
          id: `quotation:${quotation.id}:version:${version.id}:response`,
          kind: "quotation",
          title: approved ? "Quotation approved" : "Changes requested",
          detail: `${quotation.reference} · version ${version.version_number}`,
          occurredAt: version.response.responded_at,
          href: `/quotations/${quotation.id}`,
          amountMinor: version.total_minor,
        });
      }
    }
  }

  for (let index = 0; index < invoiceRows.length; index += 1) {
    const invoice = invoiceRows[index];
    const summary = paymentSummaries[index];
    if (!invoice || !summary) continue;
    const invoiceHref = `/invoices/${invoice.id}`;
    events.push({
      id: `invoice:${invoice.id}:issued`,
      kind: "invoice",
      title: "Invoice issued",
      detail: invoice.reference,
      occurredAt: invoice.issued_at,
      href: invoiceHref,
      amountMinor: String(invoice.total_minor),
    });
    for (const payment of summary.payments) {
      events.push({
        id: `payment:${payment.payment_id}:recorded`,
        kind: "payment",
        title: "Payment recorded",
        detail: `${invoice.reference} · ${payment.method}`,
        occurredAt: payment.recorded_at,
        href: invoiceHref,
        amountMinor: payment.amount_minor,
      });
      if (payment.reversal) {
        events.push({
          id: `payment:${payment.payment_id}:reversed`,
          kind: "reversal",
          title: "Payment reversed",
          detail: `${invoice.reference} · ${payment.reversal.reason}`,
          occurredAt: payment.reversal.reversed_at,
          href: invoiceHref,
          amountMinor: payment.amount_minor,
        });
      }
      if (payment.receipt) {
        events.push({
          id: `receipt:${payment.receipt.id}:issued`,
          kind: "receipt",
          title: "Receipt issued",
          detail: `${payment.receipt.reference} · ${invoice.reference}`,
          occurredAt: payment.receipt.issued_at,
          href: `/receipts/${payment.receipt.id}`,
          amountMinor: payment.amount_minor,
        });
      }
    }
  }

  return {
    ...paginateCustomerTimeline(events, requestedPage),
    timeZone: businessResult.data?.time_zone ?? "Asia/Kolkata",
  };
}
