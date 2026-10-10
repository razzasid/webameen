import Link from "next/link";
import { formatPaise } from "@/server/modules/catalog/validation";
import { listBusinessPayments } from "@/server/modules/payments/queries";

function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function PaymentsPage() {
  const payments = await listBusinessPayments();
  return (
    <section>
      <div>
        <p className="text-sm font-medium text-[var(--brand)]">Workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Payments</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Recorded money received across your issued invoices.
        </p>
      </div>
      {payments.length ? (
        <ul className="mt-6 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
          {payments.map(
            ({
              invoice_id,
              invoice_reference,
              customer_name,
              payment,
              payment_status,
              outstanding_minor,
              document_time_zone,
            }) => (
              <li key={payment.payment_id}>
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="min-w-64">
                    <Link
                      href={`/invoices/${invoice_id}`}
                      className="font-semibold text-[var(--brand)] underline"
                    >
                      {invoice_reference}
                    </Link>
                    <p className="mt-1 text-sm">
                      {customer_name} · {payment.method}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Received {formatDateTime(payment.received_at, document_time_zone)}
                      {payment.external_reference
                        ? ` · Ref ${payment.external_reference}`
                        : ""}
                    </p>
                    {payment.reversal ? (
                      <p className="mt-2 text-sm text-red-800">
                        Reversed: {payment.reversal.reason}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs capitalize text-[var(--muted)]">
                        Invoice {payment_status.replace("_", " ")} ·{" "}
                        {formatPaise(outstanding_minor)} outstanding
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatPaise(payment.amount_minor)}</p>
                    {payment.receipt ? (
                      <Link
                        href={`/receipts/${payment.receipt.id}`}
                        className="mt-1 inline-block text-sm text-[var(--brand)] underline"
                      >
                        {payment.reversal ? "Void receipt" : payment.receipt.reference}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">No payments yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Record a payment from an issued invoice to see its receipt and history here.
          </p>
          <Link
            href="/invoices"
            className="mt-4 inline-block text-sm font-semibold text-[var(--brand)] underline"
          >
            View invoices
          </Link>
        </div>
      )}
    </section>
  );
}
