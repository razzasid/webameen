import { randomUUID } from "node:crypto";
import Link from "next/link";
import { PaymentEntryForm } from "@/components/payments/payment-entry-form";
import { ReversePaymentForm } from "@/components/payments/reverse-payment-form";
import { formatPaise, paiseToRupees } from "@/server/modules/catalog/validation";
import type {
  InvoicePayment,
  InvoicePaymentSummary,
} from "@/server/modules/payments/queries";

function localDateTime(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${values.fractionalSecond}`;
}

function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function ReceiptTrail({
  payment,
  payments,
}: {
  payment: InvoicePayment;
  payments: InvoicePayment[];
}) {
  const predecessor = payments.find(
    (item) => item.payment_id === payment.replaces_payment_id,
  );
  const successor = payments.find(
    (item) => item.replaces_payment_id === payment.payment_id,
  );
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
      {predecessor?.receipt ? (
        <span>
          Replaces{" "}
          <Link className="underline" href={`/receipts/${predecessor.receipt.id}`}>
            {predecessor.receipt.reference}
          </Link>
        </span>
      ) : null}
      {successor?.receipt ? (
        <span>
          Corrected by{" "}
          <Link className="underline" href={`/receipts/${successor.receipt.id}`}>
            {successor.receipt.reference}
          </Link>
        </span>
      ) : null}
    </div>
  );
}

export function InvoicePaymentPanel({
  invoiceId,
  summary,
}: {
  invoiceId: string;
  summary: InvoicePaymentSummary;
}) {
  const now = localDateTime(summary.document_time_zone);
  const replacementPaymentIds = new Set(
    summary.payments.flatMap((payment) =>
      payment.replaces_payment_id ? [payment.replaces_payment_id] : [],
    ),
  );

  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Payment status</p>
          <h2 className="mt-1 text-2xl font-semibold capitalize">
            {summary.payment_status.replace("_", " ")}
            {summary.overdue ? " · overdue" : ""}
          </h2>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-right text-sm">
          <dt className="text-[var(--muted)]">Paid</dt>
          <dd className="font-semibold">{formatPaise(summary.paid_minor)}</dd>
          <dt className="text-[var(--muted)]">Outstanding</dt>
          <dd className="font-semibold">{formatPaise(summary.outstanding_minor)}</dd>
        </dl>
      </div>

      {BigInt(summary.outstanding_minor) > BigInt(0) ? (
        <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4 md:p-5">
          <PaymentEntryForm
            invoiceId={invoiceId}
            requestKey={randomUUID()}
            initialAmount={paiseToRupees(summary.outstanding_minor)}
            receivedAt={now}
          />
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-[#edf6f1] p-4 text-sm text-[#245847]">
          The invoice balance is fully paid. Any reversed payments remain in the history
          below.
        </p>
      )}

      <div className="mt-7 border-t border-[var(--line)] pt-5">
        <h3 className="text-lg font-semibold">Payment history</h3>
        {summary.payments.length ? (
          <ol className="mt-4 space-y-4">
            {summary.payments.map((payment) => {
              const receipt = payment.receipt;
              const replacementAvailable =
                payment.reversal !== null &&
                receipt !== null &&
                !replacementPaymentIds.has(payment.payment_id) &&
                BigInt(summary.outstanding_minor) > BigInt(0);
              return (
                <li
                  key={payment.payment_id}
                  id={`payment-${payment.payment_id}`}
                  className="rounded-xl border border-[var(--line)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {formatPaise(payment.amount_minor)} · {payment.method}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Received{" "}
                        {formatDateTime(payment.received_at, summary.document_time_zone)}
                        {payment.external_reference
                          ? ` · Ref ${payment.external_reference}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Recorded{" "}
                        {formatDateTime(payment.recorded_at, summary.document_time_zone)}
                      </p>
                      {receipt ? (
                        <ReceiptTrail payment={payment} payments={summary.payments} />
                      ) : null}
                    </div>
                    {receipt ? (
                      <div className="text-right">
                        {payment.reversal ? (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                            Reversed · receipt void
                          </span>
                        ) : null}
                        <Link
                          className="mt-2 block text-sm font-semibold text-[var(--brand)] underline"
                          href={`/receipts/${receipt.id}`}
                        >
                          {receipt.reference}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                  {payment.reversal ? (
                    <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
                      Reversed{" "}
                      {formatDateTime(
                        payment.reversal.reversed_at,
                        summary.document_time_zone,
                      )}
                      : {payment.reversal.reason}
                    </p>
                  ) : (
                    <ReversePaymentForm
                      invoiceId={invoiceId}
                      paymentId={payment.payment_id}
                    />
                  )}
                  {replacementAvailable ? (
                    <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
                      <PaymentEntryForm
                        invoiceId={invoiceId}
                        requestKey={randomUUID()}
                        initialAmount={paiseToRupees(payment.amount_minor)}
                        receivedAt={now}
                        replacesPaymentId={payment.payment_id}
                        heading="Record replacement payment"
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            No payments have been recorded.
          </p>
        )}
      </div>
    </section>
  );
}
