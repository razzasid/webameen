import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintReceiptButton } from "@/components/payments/print-receipt-button";
import { formatPaise } from "@/server/modules/catalog/validation";
import { getInvoice } from "@/server/modules/invoices/queries";
import {
  getInvoicePaymentSummary,
  getReceiptInvoiceId,
} from "@/server/modules/payments/queries";

function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoiceId = await getReceiptInvoiceId(id);
  const [invoice, summary] = await Promise.all([
    getInvoice(invoiceId),
    getInvoicePaymentSummary(invoiceId),
  ]);
  const payment = summary.payments.find((item) => item.receipt?.id === id);
  if (!payment?.receipt) notFound();
  const receipt = payment.receipt;
  const predecessor = receipt.replaces_receipt_id
    ? summary.payments.find((item) => item.receipt?.id === receipt.replaces_receipt_id)
    : null;
  const replacement = summary.payments.find(
    (item) => item.receipt?.replaces_receipt_id === receipt.id,
  );
  const isVoided = payment.reversal !== null;

  return (
    <section className="mx-auto max-w-4xl">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/invoices/${invoice.id}`}
          className="text-sm font-medium text-[var(--brand)]"
        >
          ← Back to invoice {invoice.reference}
        </Link>
        <PrintReceiptButton />
      </div>

      <article className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-8 print:mt-0 print:border-0 print:p-0">
        {isVoided ? (
          <div className="mb-6 border-2 border-red-700 p-3 text-center text-xl font-bold uppercase tracking-widest text-red-800">
            Void receipt
          </div>
        ) : null}
        <header className="flex flex-wrap justify-between gap-6 border-b border-[var(--line)] pb-5">
          <div>
            <p className="text-sm font-medium text-[var(--brand)]">Payment receipt</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
              {receipt.reference}
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Issued {formatDateTime(receipt.issued_at, summary.document_time_zone)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--muted)]">Amount received</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatPaise(payment.amount_minor)}
            </p>
            <p className="text-sm">{summary.currency_code}</p>
          </div>
        </header>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Received from
            </h2>
            <p className="mt-2 font-semibold">{invoice.buyer_display_name}</p>
            {invoice.buyer_contact_name ? (
              <p className="mt-1 text-sm">{invoice.buyer_contact_name}</p>
            ) : null}
            <p className="mt-1 whitespace-pre-line text-sm">
              {invoice.buyer_billing_address}
            </p>
            <p className="mt-1 text-sm">
              {[invoice.buyer_email, invoice.buyer_phone].filter(Boolean).join(" · ")}
            </p>
          </section>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Received by
            </h2>
            <p className="mt-2 font-semibold">{invoice.seller_display_name}</p>
            <p className="mt-1 whitespace-pre-line text-sm">
              {invoice.seller_postal_address}
            </p>
            <p className="mt-1 text-sm">
              {[invoice.seller_contact_email, invoice.seller_contact_phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-3 border-y border-[var(--line)] py-5 text-sm sm:grid-cols-2">
          <dt className="text-[var(--muted)]">Invoice</dt>
          <dd className="font-medium">
            {invoice.reference} · {invoice.invoice_date}
          </dd>
          <dt className="text-[var(--muted)]">Date payment received</dt>
          <dd>{formatDateTime(payment.received_at, summary.document_time_zone)}</dd>
          <dt className="text-[var(--muted)]">Payment method</dt>
          <dd>{payment.method}</dd>
          {payment.external_reference ? (
            <>
              <dt className="text-[var(--muted)]">Payment reference</dt>
              <dd>{payment.external_reference}</dd>
            </>
          ) : null}
          <dt className="text-[var(--muted)]">Invoice total</dt>
          <dd>{formatPaise(invoice.total_minor)}</dd>
          {invoice.due_on ? (
            <>
              <dt className="text-[var(--muted)]">Invoice due date</dt>
              <dd>{invoice.due_on}</dd>
            </>
          ) : null}
        </dl>

        <section className="mt-6">
          <h2 className="font-semibold">Invoice details</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3">Quantity</th>
                  <th className="py-2 pr-3">Unit price</th>
                  <th className="py-2 text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr className="border-b border-[var(--line)]" key={item.id}>
                    <td className="py-2 pr-3">
                      {item.position}. {item.description}
                    </td>
                    <td className="py-2 pr-3">
                      {item.quantity} {item.unit_label}
                    </td>
                    <td className="py-2 pr-3">{formatPaise(item.unit_price_minor)}</td>
                    <td className="py-2 text-right">
                      {formatPaise(item.line_total_minor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-right font-semibold">
            Invoice total: {formatPaise(invoice.total_minor)}
          </p>
        </section>

        {invoice.terms ? (
          <section className="mt-6 border-t border-[var(--line)] pt-5">
            <h2 className="font-semibold">Approved terms</h2>
            <p className="mt-2 whitespace-pre-line text-sm">{invoice.terms}</p>
          </section>
        ) : null}

        {predecessor?.receipt || replacement?.receipt ? (
          <section className="print:hidden mt-6 border-t border-[var(--line)] pt-5">
            <h2 className="font-semibold">Correction history</h2>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {predecessor?.receipt ? (
                <Link
                  className="text-[var(--brand)] underline"
                  href={`/receipts/${predecessor.receipt.id}`}
                >
                  Replaces {predecessor.receipt.reference}
                </Link>
              ) : null}
              {replacement?.receipt ? (
                <Link
                  className="text-[var(--brand)] underline"
                  href={`/receipts/${replacement.receipt.id}`}
                >
                  Replaced by {replacement.receipt.reference}
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {payment.reversal ? (
          <p className="mt-6 border-t border-red-200 pt-4 text-sm text-red-900">
            Reversed{" "}
            {formatDateTime(payment.reversal.reversed_at, summary.document_time_zone)}.
            Reason: {payment.reversal.reason}
          </p>
        ) : null}
        <p className="mt-6 text-xs text-[var(--muted)]">
          This receipt records the payment against the immutable invoice shown above.
        </p>
      </article>
    </section>
  );
}
