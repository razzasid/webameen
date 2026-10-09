import Link from "next/link";
import { formatPaise } from "@/server/modules/catalog/validation";
import { listQuotationDrafts } from "@/server/modules/quotations/queries";

export default async function QuotationsPage() {
  const quotes = await listQuotationDrafts();
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Quotations</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Prepare, share and track customer responses for exact quotation versions.
          </p>
        </div>
        <Link
          href="/quotations/new"
          className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white"
        >
          New quotation
        </Link>
      </div>
      {quotes.length ? (
        <ul className="mt-6 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/quotations/${quote.id}`}
                className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-[#f8fbf9]"
              >
                <span>
                  <strong className="block text-sm">{quote.customer_name}</strong>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {quote.reference}
                  </span>
                </span>
                <span className="text-sm capitalize">
                  {quote.version_state.replaceAll("_", " ")}
                </span>
                <strong className="text-sm">
                  {quote.total_minor === null
                    ? "Not calculated"
                    : formatPaise(quote.total_minor)}
                </strong>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">No quotations yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Select a customer to start a quotation draft.
          </p>
        </div>
      )}
    </section>
  );
}
