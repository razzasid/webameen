import { randomUUID } from "node:crypto";
import { CheckCircle2, Clock3, ReceiptText } from "lucide-react";
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
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
      {predecessor?.receipt ? (
        <span>
          Replaces{" "}
          <Link
            className="font-medium text-[var(--brand)] underline"
            href={`/receipts/${predecessor.receipt.id}`}
          >
            {predecessor.receipt.reference}
          </Link>
        </span>
      ) : null}
      {successor?.receipt ? (
        <span>
          Corrected by{" "}
          <Link
            className="font-medium text-[var(--brand)] underline"
            href={`/receipts/${successor.receipt.id}`}
          >
            {successor.receipt.reference}
          </Link>
        </span>
      ) : null}
    </div>
  );
}

function paymentStatusLabel(summary: InvoicePaymentSummary) {
  if (summary.payment_status === "paid") return "Paid";
  if (summary.overdue) return "Overdue";
  if (summary.payment_status === "part_paid") return "Partially paid";
  return "Pending";
}

function paymentStatusClass(summary: InvoicePaymentSummary) {
  if (summary.payment_status === "paid") return "text-[#176b4c]";
  if (summary.overdue) return "text-[#a32e32]";
  if (summary.payment_status === "part_paid") return "text-[#315b8a]";
  return "text-[#8d5400]";
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
  const statusLabel = paymentStatusLabel(summary);

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_1px_2px_rgb(15_45_36/4%)] sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-[#d7eee3] bg-[#eaf6f1] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/75 text-[var(--brand)]">
            <CheckCircle2 aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Payment status
            </p>
            <h2
              className={`mt-0.5 text-2xl font-bold capitalize ${paymentStatusClass(summary)}`}
            >
              {statusLabel}
            </h2>
          </div>
        </div>
        <dl className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-2 border-t border-[#d2e8dd] pt-3 text-xs sm:min-w-[240px] sm:border-t-0 sm:border-l sm:pl-5 sm:pt-0 sm:text-sm">
          <dt className="text-[var(--muted-foreground)]">Paid</dt>
          <dd className="text-right font-semibold tabular-nums text-[var(--ink)]">
            {formatPaise(summary.paid_minor)}
          </dd>
          <dt className="text-[var(--muted-foreground)]">Outstanding</dt>
          <dd className="text-right font-semibold tabular-nums text-[var(--ink)]">
            {formatPaise(summary.outstanding_minor)}
          </dd>
        </dl>
      </div>

      {summary.payment_status === "paid" ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-[#eaf6f1] px-3 py-2.5 text-xs leading-5 text-[var(--ink)]">
          <CheckCircle2
            aria-hidden="true"
            className="size-4 shrink-0 text-[var(--success)]"
          />
          The invoice balance is fully paid. Any reversed payments remain in the history
          below.
        </p>
      ) : summary.overdue ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
          The due date has passed and a balance remains outstanding.
        </p>
      ) : null}

      {BigInt(summary.outstanding_minor) > BigInt(0) ? (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <PaymentEntryForm
            invoiceId={invoiceId}
            requestKey={randomUUID()}
            initialAmount={paiseToRupees(summary.outstanding_minor)}
            receivedAt={now}
          />
        </div>
      ) : null}

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <div className="flex items-center gap-3 border-b border-[var(--line)] pb-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
            <ReceiptText aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-[var(--ink)]">Payment history</h2>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {summary.payments.length}{" "}
              {summary.payments.length === 1 ? "payment" : "payments"} recorded
            </p>
          </div>
        </div>

        {summary.payments.length ? (
          <ol className="mt-3 space-y-3">
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
                  className="relative min-w-0 rounded-xl border border-[var(--line)] p-3 sm:p-3.5"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${payment.reversal ? "bg-red-100 text-red-700" : "bg-[#e2f3eb] text-[#176b4c]"}`}
                      >
                        {payment.reversal ? (
                          <Clock3 aria-hidden="true" className="size-4" />
                        ) : (
                          <CheckCircle2 aria-hidden="true" className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-[var(--ink)]">
                          {formatPaise(payment.amount_minor)} · {payment.method}
                        </p>
                        <p className="mt-1 break-words text-sm leading-5 text-[var(--muted-foreground)]">
                          Received{" "}
                          {formatDateTime(payment.received_at, summary.document_time_zone)}
                          {payment.external_reference
                            ? ` · Ref ${payment.external_reference}`
                            : ""}
                        </p>
                        <p className="mt-1 break-words text-xs text-[var(--muted-foreground)]">
                          Recorded{" "}
                          {formatDateTime(payment.recorded_at, summary.document_time_zone)}
                        </p>
                        {receipt ? (
                          <ReceiptTrail payment={payment} payments={summary.payments} />
                        ) : null}
                      </div>
                    </div>
                    {receipt ? (
                      <div className="min-w-0 pl-11 text-left sm:shrink-0 sm:pl-0 sm:text-right">
                        {payment.reversal ? (
                          <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                            Reversed · receipt void
                          </span>
                        ) : null}
                        <Link
                          className="mt-2 block break-all text-sm font-semibold text-[var(--brand)] underline"
                          href={`/receipts/${receipt.id}`}
                        >
                          {receipt.reference}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                  {payment.reversal ? (
                    <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm leading-5 text-red-900">
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
                    <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
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
          <p className="mt-4 rounded-xl bg-[var(--paper)] p-4 text-sm text-[var(--muted-foreground)]">
            No payments have been recorded.
          </p>
        )}
      </div>
    </section>
  );
}
