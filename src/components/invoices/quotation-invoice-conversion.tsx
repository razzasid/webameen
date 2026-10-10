import Link from "next/link";
import { InvoiceIssueForm } from "@/components/invoices/invoice-issue-form";

export function QuotationInvoiceConversion({
  quotationId,
  versionId,
  versionState,
  responseKind,
  reviewedManualTreatment,
  existingInvoice,
}: {
  quotationId: string;
  versionId: string;
  versionState: string;
  responseKind: string | null;
  reviewedManualTreatment: boolean;
  existingInvoice: { id: string; reference: string } | null;
}) {
  return (
    <section className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
      <p className="text-sm font-medium text-[var(--brand)]">Phase 9</p>
      <h2 className="mt-1 text-xl font-semibold">Invoice conversion</h2>
      {existingInvoice ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <p role="status" className="text-sm font-semibold text-green-900">
            Invoice {existingInvoice.reference} has been issued and is locked for this
            quotation.
          </p>
          <Link
            className="mt-2 inline-block text-sm font-semibold text-[var(--brand)] underline"
            href={`/invoices/${existingInvoice.id}`}
          >
            Open issued invoice
          </Link>
        </div>
      ) : versionState !== "approved" || responseKind !== "approved" ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          This quotation cannot be invoiced until its current version has customer approval.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              ✓ Current version {versionId} is approved and has recorded customer evidence.
            </li>
            <li>✓ Invoice content will be copied from this exact approved version.</li>
            <li>
              ✓ The issued invoice number, issue date, snapshot and lines cannot be edited.
            </li>
          </ul>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            {reviewedManualTreatment ? (
              <p>
                Review the manually selected GST treatment. It will be copied as approved
                without recalculation.
              </p>
            ) : (
              <p>
                Review the approved GST treatment and totals. Catalog and tax-rate changes
                do not change this invoice snapshot.
              </p>
            )}
            <p className="mt-2">
              The configured numbering period must cover the issue date. If it does not, add
              a period in Settings before issuing.
            </p>
          </div>
          <InvoiceIssueForm quotationId={quotationId} />
        </>
      )}
    </section>
  );
}
