"use client";

import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  FileText,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { QuoteSummary } from "@/server/modules/quotations/queries";

const pageSize = 10;
const statusLabels: Record<string, string> = {
  draft: "Draft",
  shared: "Awaiting response",
  approved: "Approved",
  change_requested: "Change requested",
  superseded: "Replaced",
};

function formatAmount(value: string | null) {
  if (value === null) return "Not calculated";
  const minor = BigInt(value);
  const hundred = BigInt(100);
  const rupees = (minor / hundred).toLocaleString("en-IN");
  const paise = (minor % hundred).toString().padStart(2, "0");
  return `₹${rupees}.${paise}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusClasses(status: string) {
  switch (status) {
    case "approved":
      return "bg-[#e2f3eb] text-[#176b4c]";
    case "shared":
      return "bg-[#e5f0fb] text-[#315b8a]";
    case "change_requested":
      return "bg-[#fff1dd] text-[#8d5400]";
    default:
      return "bg-[#eef1f0] text-[#53645d]";
  }
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone: "mint" | "amber" | "blue" | "green";
}) {
  const iconTone = {
    mint: "bg-[#e2f2eb] text-[#176b4c]",
    amber: "bg-[#fff1dd] text-[#9a5a00]",
    blue: "bg-[#e5f0fb] text-[#315b8a]",
    green: "bg-[#e2f3eb] text-[#176b4c]",
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
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-[var(--ink)]">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{detail}</p>
      </div>
    </article>
  );
}

export function QuotationsList({ quotations }: { quotations: QuoteSummary[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return quotations.filter((quote) => {
      const matchesSearch =
        !query ||
        quote.customer_name.toLocaleLowerCase().includes(query) ||
        quote.reference.toLocaleLowerCase().includes(query) ||
        (statusLabels[quote.version_state] ?? quote.version_state)
          .toLocaleLowerCase()
          .includes(query);
      return matchesSearch && (status === "all" || quote.version_state === status);
    });
  }, [quotations, search, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const approvedCount = quotations.filter(
    (quote) => quote.version_state === "approved",
  ).length;
  const waitingCount = quotations.filter(
    (quote) => quote.version_state === "shared",
  ).length;
  const changeCount = quotations.filter(
    (quote) => quote.version_state === "change_requested",
  ).length;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatus(value: string) {
    setStatus(value);
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
            Quotations
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Prepare quotations, share them with customers, and follow each response.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/quotations/new">
            <Plus aria-hidden="true" />
            New quotation
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total quotations"
          value={quotations.length}
          detail="All current quotation versions"
          icon={<UsersRound aria-hidden="true" className="size-6" />}
          tone="mint"
        />
        <MetricCard
          label="Approved"
          value={approvedCount}
          detail={`${quotations.length ? Math.round((approvedCount / quotations.length) * 100) : 0}% of quotations`}
          icon={<Check aria-hidden="true" className="size-6" />}
          tone="green"
        />
        <MetricCard
          label="Awaiting response"
          value={waitingCount}
          detail="Shared with customers"
          icon={<Clock3 aria-hidden="true" className="size-6" />}
          tone="amber"
        />
        <MetricCard
          label="Change requested"
          value={changeCount}
          detail="Needs your follow-up"
          icon={<ArrowDownUp aria-hidden="true" className="size-6" />}
          tone="blue"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 sm:flex-row sm:items-center sm:p-4">
          <label className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <span className="sr-only">Search quotations</span>
            <input
              className="h-11 w-full rounded-lg border border-[var(--line)] bg-white pl-10 pr-3 text-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/15"
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Search customer or quotation ID..."
              type="search"
              value={search}
            />
          </label>
          <label className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-sm text-[var(--muted-foreground)] sm:w-52">
            <FileText aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Filter by quotation status</span>
            <select
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
              onChange={(event) => updateStatus(event.target.value)}
              value={status}
            >
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {pageItems.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#f8faf9] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Quotation ID</th>
                    <th className="px-4 py-3 font-semibold">Last updated</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {pageItems.map((quote) => (
                    <tr key={quote.id} className="transition-colors hover:bg-[#f8fbf9]">
                      <td className="max-w-[260px] px-5 py-3.5">
                        <span className="block truncate font-semibold text-[var(--ink)]">
                          {quote.customer_name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex max-w-44 truncate rounded-md border border-[var(--line)] bg-[#f8faf9] px-2 py-1 font-mono text-xs text-[var(--muted-foreground)]">
                          {quote.reference}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[var(--muted-foreground)]">
                        {formatDate(quote.updated_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${statusClasses(quote.version_state)}`}
                        >
                          <span
                            aria-hidden="true"
                            className="size-1.5 rounded-full bg-current"
                          />
                          {statusLabels[quote.version_state] ?? quote.version_state}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-[var(--ink)]">
                        {formatAmount(quote.total_minor)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/quotations/${quote.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[var(--line)] md:hidden">
              {pageItems.map((quote) => (
                <li key={quote.id}>
                  <Link
                    aria-label={`View quotation ${quote.reference} for ${quote.customer_name}`}
                    className="block space-y-3 p-4 transition-colors hover:bg-[#f8fbf9] focus-visible:bg-[#f8fbf9]"
                    href={`/quotations/${quote.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--ink)]">
                          {quote.customer_name}
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-[var(--muted-foreground)]">
                          {quote.reference}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(quote.version_state)}`}
                      >
                        {statusLabels[quote.version_state] ?? quote.version_state}
                      </span>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <span className="text-xs text-[var(--muted-foreground)]">
                        Updated {formatDate(quote.updated_at)}
                      </span>
                      <strong className="text-sm tabular-nums text-[var(--ink)]">
                        {formatAmount(quote.total_minor)}
                      </strong>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p
                aria-live="polite"
                className="text-xs text-[var(--muted-foreground)] sm:text-sm"
              >
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}{" "}
                quotations
              </p>
              {pageCount > 1 ? (
                <nav aria-label="Quotation pages" className="flex items-center gap-2">
                  <Button
                    aria-label="Previous page"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                    size="icon-sm"
                    variant="outline"
                  >
                    <ArrowLeft aria-hidden="true" />
                  </Button>
                  <span
                    aria-current="page"
                    className="px-2 text-sm font-semibold tabular-nums"
                  >
                    {currentPage} / {pageCount}
                  </span>
                  <Button
                    aria-label="Next page"
                    disabled={currentPage === pageCount}
                    onClick={() => setPage(currentPage + 1)}
                    size="icon-sm"
                    variant="outline"
                  >
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </nav>
              ) : null}
            </div>
          </>
        ) : (
          <div className="px-5 py-12 text-center sm:py-16">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#e2f2eb] text-[var(--brand)]">
              <FileText aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--ink)]">
              {quotations.length ? "No matching quotations" : "No quotations yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
              {quotations.length
                ? "Try another customer name, quotation ID, or status."
                : "Create a quotation draft to start preparing a document for a customer."}
            </p>
            {!quotations.length ? (
              <Button asChild className="mt-5">
                <Link href="/quotations/new">
                  <Plus aria-hidden="true" />
                  New quotation
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
