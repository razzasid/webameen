"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Search,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/server/modules/catalog/validation";
import type {
  BusinessPaymentDashboard,
  BusinessPaymentHistoryEntry,
} from "@/server/modules/payments/queries";

type PaymentStatusFilter = "all" | "paid" | "part_paid" | "pending" | "reversed";
type PaymentDateFilter = "all" | "30days" | "90days" | "year";
type PaymentSort = "date_newest" | "date_oldest" | "amount_high";

function paymentStatus(
  payment: BusinessPaymentHistoryEntry,
): Exclude<PaymentStatusFilter, "all"> {
  if (payment.payment.reversal) return "reversed";
  if (payment.payment_status === "paid") return "paid";
  if (payment.payment_status === "part_paid") return "part_paid";
  return "pending";
}

const statusLabels: Record<Exclude<PaymentStatusFilter, "all">, string> = {
  paid: "Paid",
  part_paid: "Partially paid",
  pending: "Pending",
  reversed: "Reversed",
};

function statusClasses(status: Exclude<PaymentStatusFilter, "all">) {
  switch (status) {
    case "paid":
      return "bg-[#e2f3eb] text-[#176b4c]";
    case "part_paid":
      return "bg-[#e5f0fb] text-[#315b8a]";
    case "reversed":
      return "bg-[#fde8e8] text-[#a32e32]";
    default:
      return "bg-[#fff1dd] text-[#8d5400]";
  }
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "mint" | "blue" | "amber";
}) {
  const iconTone = {
    mint: "bg-[#e2f2eb] text-[#176b4c]",
    blue: "bg-[#e5f0fb] text-[#315b8a]",
    amber: "bg-[#fff1dd] text-[#9a5a00]",
  }[tone];

  return (
    <article className="flex min-w-0 items-center gap-4 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
      <span
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--muted-foreground)]">
          {label}
        </p>
        <p className="mt-0.5 truncate text-2xl font-semibold tabular-nums tracking-tight text-[var(--ink)]">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{detail}</p>
      </div>
    </article>
  );
}

export function PaymentDirectory({ payments, stats }: BusinessPaymentDashboard) {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [dateFilter, setDateFilter] = useState<PaymentDateFilter>("all");
  const [status, setStatus] = useState<PaymentStatusFilter>("all");
  const [sort, setSort] = useState<PaymentSort>("date_newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const methods = useMemo(
    () =>
      [...new Set(payments.map(({ payment }) => payment.method))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [payments],
  );

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayIso = today.toISOString();
    const thirtyDaysAgo = new Date(
      today.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ninetyDaysAgo = new Date(
      today.getTime() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const yearStart = `${now.getUTCFullYear()}-01-01T00:00:00.000Z`;

    const matching = payments.filter((entry) => {
      const matchesSearch =
        !query ||
        entry.invoice_reference.toLocaleLowerCase().includes(query) ||
        entry.customer_name.toLocaleLowerCase().includes(query) ||
        (entry.payment.external_reference ?? "").toLocaleLowerCase().includes(query);
      const matchesMethod = method === "all" || entry.payment.method === method;
      const currentStatus = paymentStatus(entry);
      const matchesStatus = status === "all" || currentStatus === status;
      const receivedAt = new Date(entry.payment.received_at).toISOString();
      const matchesDate =
        dateFilter === "all" ||
        (dateFilter === "30days" &&
          receivedAt >= thirtyDaysAgo &&
          receivedAt <= todayIso) ||
        (dateFilter === "90days" &&
          receivedAt >= ninetyDaysAgo &&
          receivedAt <= todayIso) ||
        (dateFilter === "year" && receivedAt >= yearStart && receivedAt <= todayIso);
      return matchesSearch && matchesMethod && matchesStatus && matchesDate;
    });

    return matching.sort((first, second) => {
      if (sort === "date_oldest") {
        return (
          new Date(first.payment.recorded_at).getTime() -
          new Date(second.payment.recorded_at).getTime()
        );
      }
      if (sort === "amount_high") {
        const firstAmount = BigInt(first.payment.amount_minor);
        const secondAmount = BigInt(second.payment.amount_minor);
        return firstAmount === secondAmount ? 0 : firstAmount > secondAmount ? -1 : 1;
      }
      return (
        new Date(second.payment.recorded_at).getTime() -
        new Date(first.payment.recorded_at).getTime()
      );
    });
  }, [payments, search, method, dateFilter, status, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visiblePayments = filteredPayments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setMethod("all");
    setDateFilter("all");
    setStatus("all");
    setSort("date_newest");
    resetPage();
  }

  return (
    <section className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
            Money received
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-[2rem]">
            Payments
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Track recorded payments, receipts, and the balances on your issued invoices.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto" variant="outline">
          <Link href="/invoices">
            <FileText aria-hidden="true" />
            View invoices
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total received"
          value={formatPaise(stats.totalReceivedMinor)}
          detail="Net of reversed payments"
          icon={
            <span aria-hidden="true" className="text-2xl font-semibold">
              ₹
            </span>
          }
          tone="mint"
        />
        <MetricCard
          label="Payments"
          value={stats.paymentCount.toLocaleString("en-IN")}
          detail="Active recorded payments"
          icon={<CircleDollarSign aria-hidden="true" className="size-6" />}
          tone="mint"
        />
        <MetricCard
          label="Fully paid invoices"
          value={stats.fullyPaidInvoiceCount.toLocaleString("en-IN")}
          detail={`${stats.invoiceCount ? Math.round((stats.fullyPaidInvoiceCount / stats.invoiceCount) * 100) : 0}% of total invoices`}
          icon={<BadgeCheck aria-hidden="true" className="size-6" />}
          tone="blue"
        />
        <MetricCard
          label="Outstanding"
          value={formatPaise(stats.outstandingMinor)}
          detail={`${stats.outstandingInvoiceCount.toLocaleString("en-IN")} invoices still have a balance`}
          icon={<Wallet aria-hidden="true" className="size-6" />}
          tone="amber"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <div className="grid gap-2.5 border-b border-[var(--line)] p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(250px,1fr)_repeat(3,minmax(150px,auto))_auto]">
          <label className="relative min-w-0 sm:col-span-2 xl:col-span-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <span className="sr-only">
              Search by invoice number, customer, or reference
            </span>
            <input
              className="h-11 w-full rounded-lg border border-[var(--line)] bg-white pl-10 pr-3 text-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/15"
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Search invoice, customer, or reference..."
              type="search"
              value={search}
            />
          </label>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3">
            <span className="sr-only">Payment method</span>
            <select
              aria-label="Payment method"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => {
                setMethod(event.target.value);
                resetPage();
              }}
              value={method}
            >
              <option value="all">All methods</option>
              {methods.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3">
            <CalendarDays
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--muted-foreground)]"
            />
            <span className="sr-only">Received date</span>
            <select
              aria-label="Received date"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => {
                setDateFilter(event.target.value as PaymentDateFilter);
                resetPage();
              }}
              value={dateFilter}
            >
              <option value="all">All time</option>
              <option value="30days">Last 30 days</option>
              <option value="90days">Last 90 days</option>
              <option value="year">This year</option>
            </select>
          </label>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3">
            <span className="sr-only">Payment status</span>
            <select
              aria-label="Payment status"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => {
                setStatus(event.target.value as PaymentStatusFilter);
                resetPage();
              }}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid invoice</option>
              <option value="part_paid">Partially paid invoice</option>
              <option value="pending">Pending invoice</option>
              <option value="reversed">Reversed payment</option>
            </select>
          </label>
          <Button
            className="w-full sm:col-span-2 xl:col-span-1"
            onClick={clearFilters}
            variant="outline"
          >
            Clear filters
          </Button>
        </div>

        {visiblePayments.length ? (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead className="bg-[#f8faf9] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Payment method</th>
                    <th className="px-4 py-3 font-semibold">Received date</th>
                    <th className="px-4 py-3 font-semibold">Reference ID</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Invoice status</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {visiblePayments.map((entry) => {
                    const status = paymentStatus(entry);
                    return (
                      <tr
                        key={entry.payment.payment_id}
                        className="transition-colors hover:bg-[#f8fbf9]"
                      >
                        <td className="max-w-[180px] px-5 py-3.5">
                          <Link
                            className="block truncate font-semibold text-[var(--brand)] hover:underline"
                            href={`/invoices/${entry.invoice_id}`}
                          >
                            {entry.invoice_reference}
                          </Link>
                          <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                            {entry.invoice_date}
                          </span>
                        </td>
                        <td className="max-w-[210px] px-4 py-3.5">
                          <span className="block truncate font-semibold text-[var(--ink)]">
                            {entry.customer_name}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex max-w-[150px] truncate rounded-md bg-[#e2f2eb] px-2.5 py-1 text-xs font-semibold text-[#176b4c]">
                            {entry.payment.method}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[var(--muted-foreground)]">
                          {formatDateTime(
                            entry.payment.received_at,
                            entry.document_time_zone,
                          )}
                        </td>
                        <td className="max-w-[190px] px-4 py-3.5">
                          <span className="block truncate font-mono text-xs text-[var(--muted-foreground)]">
                            {entry.payment.external_reference || "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-[var(--ink)]">
                          {formatPaise(entry.payment.amount_minor)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${statusClasses(status)}`}
                          >
                            <span
                              aria-hidden="true"
                              className="size-1.5 rounded-full bg-current"
                            />
                            {statusLabels[status]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {entry.payment.receipt ? (
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/receipts/${entry.payment.receipt.id}`}>
                                {entry.payment.reversal ? "Void receipt" : "Receipt"}
                              </Link>
                            </Button>
                          ) : (
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/invoices/${entry.invoice_id}`}>Invoice</Link>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[var(--line)] xl:hidden">
              {visiblePayments.map((entry) => {
                const status = paymentStatus(entry);
                return (
                  <li key={entry.payment.payment_id}>
                    <div className="space-y-3 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            className="block truncate font-semibold text-[var(--brand)] hover:underline"
                            href={`/invoices/${entry.invoice_id}`}
                          >
                            {entry.invoice_reference}
                          </Link>
                          <p className="mt-1 truncate text-sm text-[var(--ink)]">
                            {entry.customer_name}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(status)}`}
                        >
                          {statusLabels[status]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <span className="text-[var(--muted-foreground)]">Method</span>
                        <span className="truncate text-right font-medium text-[var(--ink)]">
                          {entry.payment.method}
                        </span>
                        <span className="text-[var(--muted-foreground)]">Received</span>
                        <span className="text-right text-[var(--ink)]">
                          {formatDateTime(
                            entry.payment.received_at,
                            entry.document_time_zone,
                          )}
                        </span>
                        <span className="text-[var(--muted-foreground)]">Reference</span>
                        <span className="truncate text-right font-mono text-[var(--ink)]">
                          {entry.payment.external_reference || "—"}
                        </span>
                      </div>
                      {entry.payment.reversal ? (
                        <p className="break-words rounded-lg bg-[#fff5f5] px-3 py-2 text-xs text-[#8f2529]">
                          Reversed: {entry.payment.reversal.reason}
                        </p>
                      ) : null}
                      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                        <strong className="text-base tabular-nums text-[var(--ink)]">
                          {formatPaise(entry.payment.amount_minor)}
                        </strong>
                        {entry.payment.receipt ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/receipts/${entry.payment.receipt.id}`}>
                              {entry.payment.reversal
                                ? "Void receipt"
                                : entry.payment.receipt.reference}
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/invoices/${entry.invoice_id}`}>View invoice</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p
                aria-live="polite"
                className="text-xs text-[var(--muted-foreground)] sm:text-sm"
              >
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredPayments.length)} of{" "}
                {filteredPayments.length} payments
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-xs text-[var(--muted-foreground)]">
                  <span className="sr-only">Payments per page</span>
                  <select
                    aria-label="Payments per page"
                    className="h-full border-0 bg-transparent text-xs font-medium text-[var(--ink)] outline-none"
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      resetPage();
                    }}
                    value={pageSize}
                  >
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                  </select>
                </label>
                {totalPages > 1 ? (
                  <nav aria-label="Payment pages" className="flex items-center gap-2">
                    <Button
                      aria-label="Previous page"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                      size="icon-sm"
                      variant="outline"
                    >
                      <ArrowLeft aria-hidden="true" />
                    </Button>
                    <span className="px-2 text-sm font-semibold tabular-nums">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      aria-label="Next page"
                      disabled={currentPage === totalPages}
                      onClick={() => setPage(currentPage + 1)}
                      size="icon-sm"
                      variant="outline"
                    >
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </nav>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="px-5 py-12 text-center sm:py-16">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#e2f2eb] text-[var(--brand)]">
              <Wallet aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--ink)]">
              {payments.length ? "No matching payments" : "No payments yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
              {payments.length
                ? "Try changing your search or filters."
                : "Record a payment from an issued invoice to see its receipt and history here."}
            </p>
            {!payments.length ? (
              <Button asChild className="mt-5" variant="outline">
                <Link href="/invoices">View invoices</Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
