import type { InvoiceSummary } from "@/server/modules/invoices/queries";
import type { InvoicePaymentSummary } from "@/server/modules/payments/queries";
import type { QuoteSummary } from "@/server/modules/quotations/queries";

export type DashboardActivity = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
  amountMinor?: string;
};

export type DashboardOverview = {
  customerCount: number;
  quotationCount: number;
  awaitingResponseCount: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  overdueInvoiceCount: number;
  outstandingInvoiceCount: number;
  receivedMinor: string;
  outstandingMinor: string;
  recentActivity: DashboardActivity[];
};

export function sumMinorAmounts(values: string[]): string {
  return values.reduce((total, value) => total + BigInt(value), BigInt(0)).toString();
}

export function deriveDashboardOverview({
  customerCount,
  quotes,
  invoices,
  paymentSummaries,
  customers,
  activityLimit = 8,
}: {
  customerCount: number;
  quotes: QuoteSummary[];
  invoices: InvoiceSummary[];
  paymentSummaries: InvoicePaymentSummary[];
  customers: Array<{ id: string; display_name: string; created_at: string }>;
  activityLimit?: number;
}): DashboardOverview {
  const invoiceActivity = invoices.map(
    (invoice): DashboardActivity => ({
      id: `invoice:${invoice.id}`,
      title: "Invoice issued",
      detail: `${invoice.reference} · ${invoice.buyer_display_name}`,
      occurredAt: invoice.issued_at,
      href: `/invoices/${invoice.id}`,
      amountMinor: invoice.total_minor,
    }),
  );
  const paymentActivity = paymentSummaries.flatMap((summary) => {
    const invoice = invoices.find((row) => row.id === summary.invoice_id);
    if (!invoice) return [];
    return summary.payments.map(
      (payment): DashboardActivity => ({
        id: `payment:${payment.payment_id}`,
        title: payment.reversal ? "Payment reversed" : "Payment recorded",
        detail: `${invoice.reference} · ${invoice.buyer_display_name}`,
        occurredAt: payment.reversal?.reversed_at ?? payment.recorded_at,
        href: `/invoices/${invoice.id}`,
        amountMinor: payment.amount_minor,
      }),
    );
  });
  const quotationActivity = quotes.map(
    (quote): DashboardActivity => ({
      id: `quotation:${quote.id}`,
      title:
        quote.version_state === "approved"
          ? "Quotation approved"
          : quote.version_state === "change_requested"
            ? "Changes requested"
            : quote.version_state === "shared"
              ? "Quotation shared"
              : "Quotation updated",
      detail: `${quote.reference} · ${quote.customer_name}`,
      occurredAt: quote.updated_at,
      href: `/quotations/${quote.id}`,
      ...(quote.total_minor ? { amountMinor: quote.total_minor } : {}),
    }),
  );
  const customerActivity = customers.map(
    (customer): DashboardActivity => ({
      id: `customer:${customer.id}`,
      title: "Customer added",
      detail: customer.display_name,
      occurredAt: customer.created_at,
      href: `/customers/${customer.id}`,
    }),
  );
  const activity = [
    ...invoiceActivity,
    ...paymentActivity,
    ...quotationActivity,
    ...customerActivity,
  ]
    .sort((first, second) => {
      const byDate = Date.parse(second.occurredAt) - Date.parse(first.occurredAt);
      return byDate || first.id.localeCompare(second.id);
    })
    .slice(0, Math.max(0, activityLimit));

  return {
    customerCount,
    quotationCount: quotes.length,
    awaitingResponseCount: quotes.filter((quote) => quote.version_state === "shared")
      .length,
    invoiceCount: invoices.length,
    paidInvoiceCount: paymentSummaries.filter(
      (summary) => summary.payment_status === "paid",
    ).length,
    overdueInvoiceCount: paymentSummaries.filter((summary) => summary.overdue).length,
    outstandingInvoiceCount: paymentSummaries.filter(
      (summary) => summary.outstanding_minor !== "0",
    ).length,
    receivedMinor: sumMinorAmounts(paymentSummaries.map((summary) => summary.paid_minor)),
    outstandingMinor: sumMinorAmounts(
      paymentSummaries.map((summary) => summary.outstanding_minor),
    ),
    recentActivity: activity,
  };
}
