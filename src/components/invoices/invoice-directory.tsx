"use client";

import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  FileText,
  Plus,
  Search,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/server/modules/catalog/validation";
import type { InvoiceSummary } from "@/server/modules/invoices/queries";
import type { InvoicePaymentSummary } from "@/server/modules/payments/queries";

type InvoiceListRow = InvoiceSummary & {
  payment: Pick<
    InvoicePaymentSummary,
    "payment_status" | "paid_minor" | "outstanding_minor" | "overdue"
  >;
};

type InvoiceStatus = "all" | "paid" | "pending" | "part_paid" | "overdue";
type InvoiceDateFilter = "all" | "month" | "90days" | "year";
type InvoiceSort = "date_newest" | "date_oldest" | "customer_az" | "amount_high";

const statusLabels: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  part_paid: "Part paid",
  overdue: "Overdue",
};

function invoiceStatus(invoice: InvoiceListRow): Exclude<InvoiceStatus, "all"> {
  if (invoice.payment.payment_status === "paid") return "paid";
  if (invoice.payment.overdue && BigInt(invoice.payment.outstanding_minor) > BigInt(0)) {
    return "overdue";
  }
  if (invoice.payment.payment_status === "part_paid") return "part_paid";
  return "pending";
}

function statusClasses(status: Exclude<InvoiceStatus, "all">) {
  switch (status) {
    case "paid":
      return "bg-[#e2f3eb] text-[#176b4c]";
    case "overdue":
      return "bg-[#fde8e8] text-[#a32e32]";
    case "part_paid":
      return "bg-[#e5f0fb] text-[#315b8a]";
    default:
      return "bg-[#fff1dd] text-[#8d5400]";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function sumAmounts(values: string[]) {
  return values.reduce((total, value) => total + BigInt(value), BigInt(0)).toString();
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

export function InvoiceDirectory({ invoices }: { invoices: InvoiceListRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("all");
  const [dateFilter, setDateFilter] = useState<InvoiceDateFilter>("all");
  const [customerId, setCustomerId] = useState("all");
  const [sort, setSort] = useState<InvoiceSort>("date_newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const customers = useMemo(() => {
    const map = new Map<string, string>();
    for (const invoice of invoices)
      map.set(invoice.customer_id, invoice.buyer_display_name);
    return [...map.entries()].sort((first, second) =>
      first[1].localeCompare(second[1], "en-IN"),
    );
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const yearStart = `${now.getUTCFullYear()}-01-01`;
    const todayIso = today.toISOString().slice(0, 10);
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const matches = invoices.filter((invoice) => {
      const matchesSearch =
        !query ||
        invoice.reference.toLocaleLowerCase().includes(query) ||
        invoice.buyer_display_name.toLocaleLowerCase().includes(query);
      const matchesStatus = status === "all" || invoiceStatus(invoice) === status;
      const matchesCustomer = customerId === "all" || invoice.customer_id === customerId;
      const matchesDate =
        dateFilter === "all" ||
        (dateFilter === "month" &&
          invoice.invoice_date >= monthStart &&
          invoice.invoice_date <= todayIso) ||
        (dateFilter === "90days" &&
          invoice.invoice_date >= ninetyDaysAgo &&
          invoice.invoice_date <= todayIso) ||
        (dateFilter === "year" &&
          invoice.invoice_date >= yearStart &&
          invoice.invoice_date <= todayIso);
      return matchesSearch && matchesStatus && matchesCustomer && matchesDate;
    });

    return matches.sort((first, second) => {
      if (sort === "date_oldest")
        return first.invoice_date.localeCompare(second.invoice_date);
      if (sort === "customer_az") {
        return first.buyer_display_name.localeCompare(second.buyer_display_name, "en-IN");
      }
      if (sort === "amount_high") {
        const firstAmount = BigInt(first.total_minor);
        const secondAmount = BigInt(second.total_minor);
        return firstAmount === secondAmount ? 0 : firstAmount > secondAmount ? -1 : 1;
      }
      return second.invoice_date.localeCompare(first.invoice_date);
    });
  }, [invoices, search, status, dateFilter, customerId, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const paidCount = invoices.filter(
    (invoice) => invoice.payment.payment_status === "paid",
  ).length;
  const outstandingCount = invoices.filter(
    (invoice) => BigInt(invoice.payment.outstanding_minor) > BigInt(0),
  ).length;
  const invoiceTotal = sumAmounts(invoices.map((invoice) => invoice.total_minor));
  const outstandingTotal = sumAmounts(
    invoices.map((invoice) => invoice.payment.outstanding_minor),
  );

  function resetPage() {
    setPage(1);
  }

  return (
    <section className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
            Sales documents
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-[2rem]">
            Invoices
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Issued invoices are immutable copies of approved quotations. Track due dates and
            payments here.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Button asChild className="w-full" variant="outline">
            <Link href="/settings">
              <CalendarDays aria-hidden="true" />
              Numbering settings
            </Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/quotations">
              <Plus aria-hidden="true" />
              Create invoice
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total invoices"
          value={invoices.length.toLocaleString("en-IN")}
          detail="Issued in this workspace"
          icon={<FileText aria-hidden="true" className="size-6" />}
          tone="mint"
        />
        <MetricCard
          label="Total amount"
          value={formatPaise(invoiceTotal)}
          detail="Across issued invoices"
          icon={
            <span aria-hidden="true" className="text-2xl font-semibold">
              ₹
            </span>
          }
          tone="mint"
        />
        <MetricCard
          label="Paid"
          value={paidCount.toLocaleString("en-IN")}
          detail={`${invoices.length ? Math.round((paidCount / invoices.length) * 100) : 0}% of invoices`}
          icon={<BadgeCheck aria-hidden="true" className="size-6" />}
          tone="blue"
        />
        <MetricCard
          label="Outstanding"
          value={outstandingCount.toLocaleString("en-IN")}
          detail={`${formatPaise(outstandingTotal)} remaining`}
          icon={<Wallet aria-hidden="true" className="size-6" />}
          tone="amber"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <div className="grid gap-2.5 border-b border-[var(--line)] p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(250px,1fr)_repeat(4,minmax(145px,auto))]">
          <label className="relative min-w-0 sm:col-span-2 xl:col-span-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <span className="sr-only">Search invoices by number or customer</span>
            <input
              className="h-11 w-full rounded-lg border border-[var(--line)] bg-white pl-10 pr-3 text-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/15"
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Search invoice or customer..."
              type="search"
              value={search}
            />
          </label>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3">
            <span className="sr-only">Invoice status</span>
            <select
              aria-label="Invoice status"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => {
                setStatus(event.target.value as InvoiceStatus);
                resetPage();
              }}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="part_paid">Part paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3">
            <CalendarDays
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--muted-foreground)]"
            />
            <span className="sr-only">Invoice date</span>
            <select
              aria-label="Invoice date"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => {
                setDateFilter(event.target.value as InvoiceDateFilter);
                resetPage();
              }}
              value={dateFilter}
            >
              <option value="all">All dates</option>
              <option value="month">This month</option>
              <option value="90days">Last 90 days</option>
              <option value="year">This year</option>
            </select>
          </label>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3">
            <UserRound
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--muted-foreground)]"
            />
            <span className="sr-only">Customer</span>
            <select
              aria-label="Customer"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => {
                setCustomerId(event.target.value);
                resetPage();
              }}
              value={customerId}
            >
              <option value="all">All customers</option>
              {customers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3">
            <ArrowDownUp
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--muted-foreground)]"
            />
            <span className="sr-only">Sort invoices</span>
            <select
              aria-label="Sort invoices"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => {
                setSort(event.target.value as InvoiceSort);
                resetPage();
              }}
              value={sort}
            >
              <option value="date_newest">Newest first</option>
              <option value="date_oldest">Oldest first</option>
              <option value="customer_az">Customer (A–Z)</option>
              <option value="amount_high">Amount (high to low)</option>
            </select>
          </label>
        </div>

        {visibleInvoices.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="bg-[#f8faf9] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Invoice number</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {visibleInvoices.map((invoice) => {
                    const status = invoiceStatus(invoice);
                    return (
                      <tr key={invoice.id} className="transition-colors hover:bg-[#f8fbf9]">
                        <td className="max-w-[220px] px-5 py-3.5">
                          <span className="block truncate font-semibold text-[var(--ink)]">
                            {invoice.reference}
                          </span>
                          <span className="mt-1 block truncate text-xs text-[var(--muted-foreground)]">
                            {invoice.numbering_period}
                          </span>
                        </td>
                        <td className="max-w-[250px] px-4 py-3.5">
                          <span className="block truncate font-semibold text-[var(--ink)]">
                            {invoice.buyer_display_name}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[var(--muted-foreground)]">
                          {formatDate(invoice.invoice_date)}
                          {invoice.due_on ? (
                            <span className="mt-1 block text-xs">
                              Due {formatDate(invoice.due_on)}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-[var(--ink)]">
                          {formatPaise(invoice.total_minor)}
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
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/invoices/${invoice.id}`}>View</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[var(--line)] md:hidden">
              {visibleInvoices.map((invoice) => {
                const status = invoiceStatus(invoice);
                return (
                  <li key={invoice.id}>
                    <Link
                      aria-label={`View invoice ${invoice.reference} for ${invoice.buyer_display_name}`}
                      className="block space-y-3 p-4 transition-colors hover:bg-[#f8fbf9] focus-visible:bg-[#f8fbf9]"
                      href={`/invoices/${invoice.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--ink)]">
                            {invoice.reference}
                          </p>
                          <p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">
                            {invoice.buyer_display_name}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(status)}`}
                        >
                          {statusLabels[status]}
                        </span>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {formatDate(invoice.invoice_date)}
                          {invoice.due_on ? ` · Due ${formatDate(invoice.due_on)}` : ""}
                        </span>
                        <strong className="text-sm tabular-nums text-[var(--ink)]">
                          {formatPaise(invoice.total_minor)}
                        </strong>
                      </div>
                    </Link>
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
                {Math.min(currentPage * pageSize, filteredInvoices.length)} of{" "}
                {filteredInvoices.length} invoices
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-xs text-[var(--muted-foreground)]">
                  <span className="sr-only">Invoices per page</span>
                  <select
                    aria-label="Invoices per page"
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
                  <nav aria-label="Invoice pages" className="flex items-center gap-2">
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
              <FileText aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--ink)]">
              {invoices.length ? "No matching invoices" : "No invoices yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
              {invoices.length
                ? "Try changing your search or filters."
                : "Invoices are issued from approved quotations after numbering is configured."}
            </p>
            {!invoices.length ? (
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <Button asChild variant="outline">
                  <Link href="/settings">Numbering settings</Link>
                </Button>
                <Button asChild>
                  <Link href="/quotations">
                    <Plus aria-hidden="true" />
                    Create invoice
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
