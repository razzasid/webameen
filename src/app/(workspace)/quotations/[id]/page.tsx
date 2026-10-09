import Link from "next/link";
import { QuotationDraftEditor } from "@/components/quotations/quotation-draft-editor";
import { getBusinessSettings } from "@/server/modules/business/settings-queries";
import { listGstRateOptions } from "@/server/modules/catalog/queries";
import { formatPaise } from "@/server/modules/catalog/validation";
import { editQuotationDraftAction } from "@/server/modules/quotations/actions";
import {
  getQuotationDraft,
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
  const quote = await getQuotationDraft(id);
  const { saved } = await searchParams;
  const [{ profile }, catalog, rateOptions] = await Promise.all([
    getBusinessSettings(),
    listQuotationCatalogChoices(),
    listGstRateOptions(),
  ]);
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
        <p className="text-sm">
          {quote.totals.total_minor === null
            ? "Amount not calculated"
            : formatPaise(quote.totals.total_minor)}
        </p>
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
            Its saved content cannot be edited. Sharing and revision controls will be added
            in the next phase.
          </p>
        </div>
      )}
    </section>
  );
}
