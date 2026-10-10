import Link from "next/link";
import { formatPaise } from "@/server/modules/catalog/validation";
import { listInvoices } from "@/server/modules/invoices/queries";

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Invoices</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Immutable invoices issued from customer approved quotation versions.
          </p>
        </div>
        <Link
          href="/settings"
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold"
        >
          Numbering settings
        </Link>
      </div>
      {invoices.length ? (
        <ul className="mt-6 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={`/invoices/${invoice.id}`}
                className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-[#f8fbf9]"
              >
                <span>
                  <strong className="block text-sm">{invoice.reference}</strong>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {invoice.buyer_display_name} · {invoice.invoice_date}
                    {invoice.due_on ? ` · Due ${invoice.due_on}` : ""}
                  </span>
                </span>
                <span className="text-sm capitalize">{invoice.numbering_period}</span>
                <strong className="text-sm">{formatPaise(invoice.total_minor)}</strong>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">No invoices yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Configure a numbering period, then issue an invoice from a currently approved
            quotation.
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-block text-sm font-semibold text-[var(--brand)] underline"
          >
            Configure invoice numbering
          </Link>
        </div>
      )}
    </section>
  );
}
