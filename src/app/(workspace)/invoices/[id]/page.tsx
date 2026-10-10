import { randomUUID } from "node:crypto";
import Link from "next/link";
import { InvoiceDocumentView } from "@/components/invoices/invoice-document-view";
import { InvoiceSharePanel } from "@/components/invoices/invoice-share-panel";
import { InvoicePaymentPanel } from "@/components/payments/invoice-payment-panel";
import { formatPaise } from "@/server/modules/catalog/validation";
import { toInvoiceDocument } from "@/server/modules/invoices/document-model";
import { getInvoice, listInvoicePublicLinks } from "@/server/modules/invoices/queries";
import { getInvoicePaymentSummary } from "@/server/modules/payments/queries";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  const [paymentSummary, links] = await Promise.all([
    getInvoicePaymentSummary(id),
    listInvoicePublicLinks(id),
  ]);
  const issuedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: invoice.document_time_zone,
  }).format(new Date(invoice.issued_at));

  return (
    <section className="mx-auto max-w-5xl">
      <Link href="/invoices" className="text-sm font-medium text-[var(--brand)]">
        ← Invoices
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Issued invoice</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
            {invoice.reference}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Invoice date {invoice.invoice_date}
            {invoice.due_on ? ` · Due ${invoice.due_on}` : ""}
            {" · Issued "}
            {issuedAt} ({invoice.document_time_zone})
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="text-right">
            <p className="text-xs text-[var(--muted)]">Total</p>
            <p className="text-2xl font-semibold">{formatPaise(invoice.total_minor)}</p>
            <p className="text-xs text-[var(--muted)]">{invoice.currency_code}</p>
          </div>
          <a
            href={`/invoices/${invoice.id}/pdf`}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold"
          >
            Download PDF
          </a>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <h2 className="text-lg font-semibold">Approved source</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Quotation {invoice.quotation_id} · version {invoice.source_version_id} · approval
          evidence {invoice.approved_response_id}
        </p>
        <Link
          href={`/quotations/${invoice.quotation_id}`}
          className="mt-2 inline-block text-sm font-semibold text-[var(--brand)] underline"
        >
          Open quotation history
        </Link>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Number {invoice.sequence_number} from owner configured period “
          {invoice.numbering_period}”.
        </p>
      </div>

      <InvoiceSharePanel
        invoiceId={invoice.id}
        links={links}
        createRequestKey={randomUUID()}
        rotateRequestKey={randomUUID()}
      />
      <section className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <InvoiceDocumentView document={toInvoiceDocument(invoice)} />
      </section>
      <InvoicePaymentPanel invoiceId={invoice.id} summary={paymentSummary} />
      <p className="mt-5 text-center text-xs text-[var(--muted)]">
        This issued invoice is an immutable copy of the approved quotation. Corrections to
        recorded payments are retained in the payment history.
      </p>
    </section>
  );
}
