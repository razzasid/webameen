import { randomUUID } from "node:crypto";
import Link from "next/link";
import { QuotationInvoiceConversion } from "@/components/invoices/quotation-invoice-conversion";
import { QuotationDraftEditor } from "@/components/quotations/quotation-draft-editor";
import { QuotationWorkflowPanel } from "@/components/quotations/quotation-workflow-panel";
import { getBusinessSettings } from "@/server/modules/business/settings-queries";
import { listGstRateOptions } from "@/server/modules/catalog/queries";
import { formatPaise } from "@/server/modules/catalog/validation";
import { getInvoiceForQuotation } from "@/server/modules/invoices/queries";
import { editQuotationDraftAction } from "@/server/modules/quotations/actions";
import {
  getQuotationDraft,
  getQuotationWorkflow,
  listQuotationCatalogChoices,
} from "@/server/modules/quotations/queries";

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const [quote, workflow] = await Promise.all([
    getQuotationDraft(id),
    getQuotationWorkflow(id),
  ]);
  const { saved } = await searchParams;
  const [{ profile }, catalog, rateOptions, existingInvoice] = await Promise.all([
    getBusinessSettings(),
    listQuotationCatalogChoices(),
    listGstRateOptions(),
    getInvoiceForQuotation(id),
  ]);
  const currentVersion = workflow.versions.find(
    (version) => version.id === workflow.current_version_id,
  );
  return (
    <section className="max-w-5xl">
      <Link href="/quotations" className="text-sm font-medium text-[var(--brand)]">
        ← Quotations
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Private quotation draft</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
            {quote.reference}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Version {quote.version_number} · {quote.state.replaceAll("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            {quote.totals.total_minor === null
              ? "Amount not calculated"
              : formatPaise(quote.totals.total_minor)}
          </p>
          {workflow.versions.some((version) => version.shared_at !== null) ? (
            <a
              href={`/quotations/${id}/pdf`}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
            >
              Download latest shared PDF
            </a>
          ) : null}
        </div>
      </div>
      {saved === "1" ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          Draft saved. The displayed amounts are the saved database calculation.
        </p>
      ) : null}
      {quote.state === "draft" ? (
        <QuotationDraftEditor
          quote={quote}
          catalog={catalog}
          rates={rateOptions.map((option) => option.rate)}
          paymentDefaults={profile}
          action={editQuotationDraftAction}
        />
      ) : (
        <div className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-6">
          <h2 className="text-lg font-semibold">This version is frozen</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Its saved content cannot be edited. Create a revision before making changes.
          </p>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <p>
              <strong>Seller:</strong> {quote.snapshot.seller_display_name}
            </p>
            <p>
              <strong>Customer:</strong> {quote.snapshot.buyer_display_name}
            </p>
            <p className="whitespace-pre-line">
              <strong>Seller address:</strong> {quote.snapshot.seller_postal_address}
            </p>
            <p className="whitespace-pre-line">
              <strong>Customer address:</strong> {quote.snapshot.buyer_billing_address}
            </p>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--muted)]">
                <tr>
                  <th className="py-2">Line</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((line) => (
                  <tr key={line.id} className="border-b border-[var(--line)]">
                    <td className="py-2">
                      {line.position}. {line.description}
                    </td>
                    <td>
                      {line.quantity} {line.unit_label}
                    </td>
                    <td>{formatPaise(line.unit_price_minor)}</td>
                    <td className="text-right">{formatPaise(line.line_total_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <QuotationWorkflowPanel
        workflow={workflow}
        shareRequestKey={randomUUID()}
        rotateRequestKey={randomUUID()}
      />
      <QuotationInvoiceConversion
        quotationId={id}
        versionId={workflow.current_version_id}
        versionState={currentVersion?.state ?? quote.state}
        responseKind={currentVersion?.response?.kind ?? null}
        reviewedManualTreatment={quote.snapshot.gst_treatment_override !== null}
        existingInvoice={existingInvoice}
      />
    </section>
  );
}
