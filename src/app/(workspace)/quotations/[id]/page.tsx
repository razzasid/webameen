import { randomUUID } from "node:crypto";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CircleAlert,
  FileDown,
  FileText,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { QuotationInvoiceConversion } from "@/components/invoices/quotation-invoice-conversion";
import { QuotationDraftEditor } from "@/components/quotations/quotation-draft-editor";
import { QuotationLineComponents } from "@/components/quotations/quotation-line-components";
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
import { resolveQuotationHeadings } from "@/server/modules/quotations/template-headings";
import {
  getQuoteShareBlockers,
  savedLineToInput,
  snapshotToInput,
} from "@/server/modules/quotations/validation";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Approved",
    change_requested: "Change requested",
    draft: "Draft",
    shared: "Awaiting response",
    superseded: "Replaced",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "change_requested") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "shared") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-[var(--line)] bg-[var(--canvas)] text-[var(--muted-foreground)]";
}

function formatResponseDate(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
}

function SnapshotField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string | boolean | null | undefined;
}) {
  return (
    <div className="flex min-w-0 gap-3 py-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--brand)]" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium text-[var(--ink)]">
          {typeof value === "string" && value.trim() ? value : "—"}
        </p>
      </div>
    </div>
  );
}

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
  const headings = resolveQuotationHeadings(quote.template_headings);
  const [{ profile }, catalog, rateOptions, existingInvoice] = await Promise.all([
    getBusinessSettings(),
    listQuotationCatalogChoices(),
    listGstRateOptions(),
    getInvoiceForQuotation(id),
  ]);
  const shareBlockers = getQuoteShareBlockers(
    snapshotToInput(quote.snapshot),
    quote.lines.map(savedLineToInput),
    rateOptions.map((option) => option.rate),
  );
  const currentVersion = workflow.versions.find(
    (version) => version.id === workflow.current_version_id,
  );
  const currentStatus =
    currentVersion?.response?.kind === "change_requested"
      ? "change_requested"
      : (currentVersion?.state ?? quote.state);
  const changeRequest =
    currentVersion?.response?.kind === "change_requested" ? currentVersion.response : null;
  const title = quote.state === "draft" ? "New quotation" : quote.reference;
  const description =
    currentStatus === "change_requested"
      ? "Review the customer’s feedback and prepare a revised quotation when you’re ready."
      : quote.state === "draft"
        ? "Create a quotation for your customer. Their details are copied into this draft for your review."
        : "Review the saved quotation and its customer response.";
  return (
    <section className="mx-auto w-full max-w-[1440px] min-w-0 space-y-5 sm:space-y-6">
      {quote.state !== "draft" ? (
        <Link
          href="/quotations"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-[var(--muted-foreground)] transition hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Quotations
        </Link>
      ) : null}
      <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {quote.state !== "draft" ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold ${statusTone(currentStatus)}`}
              >
                {statusLabel(currentStatus)}
              </span>
              {currentVersion ? (
                <span className="text-xs text-[var(--muted-foreground)]">
                  Version {currentVersion.version_number}
                </span>
              ) : null}
            </div>
          ) : null}
          <h1 className="break-words text-3xl font-bold leading-tight tracking-[-0.04em] text-[var(--ink)] sm:text-4xl lg:text-[2.75rem]">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
            {description}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {quote.state === "draft" ? (
            <>
              <button
                form="quotation-draft-form"
                type="submit"
                name="intent"
                value="preview"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-4 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:text-sm"
              >
                Preview calculation
              </button>
              <button
                form="quotation-draft-form"
                type="submit"
                name="intent"
                value="save"
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--brand)] px-4 text-xs font-semibold text-white hover:bg-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:text-sm"
              >
                Save draft
              </button>
            </>
          ) : workflow.versions.some((version) => version.shared_at !== null) ? (
            <a
              href={`/quotations/${id}/pdf`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:w-auto"
            >
              <FileDown aria-hidden="true" className="size-4" />
              Download latest shared PDF
            </a>
          ) : null}
        </div>
      </header>
      {saved === "1" ? (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
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
        <div className="min-w-0 space-y-5 sm:space-y-6">
          {changeRequest ? (
            <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.03)]">
              <div className="flex gap-3 border-b border-amber-200 bg-amber-50/80 p-4 sm:p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                  <CircleAlert aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-bold text-amber-950">Customer requested a change</h2>
                  <p className="mt-1 text-sm leading-5 text-amber-900/80">
                    {changeRequest.respondent_name?.trim()
                      ? `${changeRequest.respondent_name.trim()} sent feedback`
                      : "Your customer sent feedback"}
                    {changeRequest.responded_at
                      ? ` · ${formatResponseDate(changeRequest.responded_at, String(quote.snapshot.document_time_zone || "Asia/Kolkata"))}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70">
                  Customer note
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--ink)]">
                  {changeRequest.customer_note?.trim() ||
                    "No additional note was provided. Create a revision to update the quotation."}
                </p>
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgb(15_23_42/0.03)]">
            <div className="flex flex-col gap-2 border-b border-[var(--line)] bg-[linear-gradient(105deg,#f0f8f4_0%,#ffffff_72%)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
                  <FileText aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h2 className="font-bold text-[var(--ink)]">
                    Saved quotation · Version {quote.version_number}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    This version is frozen. Create a revision before making changes.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 sm:ml-4">
                <ReceiptText aria-hidden="true" className="size-4 text-[var(--brand)]" />
                <div>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Quotation total
                  </p>
                  <p className="text-sm font-bold tabular-nums text-[var(--ink)]">
                    {formatPaise(quote.totals.total_minor)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 p-4 sm:p-6 lg:grid-cols-2">
              <article className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
                <div className="flex items-center gap-3 border-b border-[var(--line)] pb-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
                    <Building2 aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--muted-foreground)]">
                      From (Seller)
                    </p>
                    <h3 className="break-words font-bold text-[var(--ink)]">
                      {quote.snapshot.seller_display_name || "—"}
                    </h3>
                  </div>
                </div>
                <div className="grid min-w-0 gap-x-5 divide-y divide-[var(--line)] sm:grid-cols-2 sm:divide-y-0">
                  <SnapshotField
                    icon={MapPin}
                    label="Address"
                    value={quote.snapshot.seller_postal_address}
                  />
                  <SnapshotField
                    icon={Mail}
                    label="Email"
                    value={quote.snapshot.seller_contact_email}
                  />
                  <SnapshotField
                    icon={Phone}
                    label="Phone"
                    value={quote.snapshot.seller_contact_phone}
                  />
                  <SnapshotField
                    icon={Building2}
                    label="State"
                    value={quote.snapshot.seller_state_code}
                  />
                  {quote.snapshot.seller_gst_registered ? (
                    <SnapshotField
                      icon={ReceiptText}
                      label="GSTIN"
                      value={quote.snapshot.seller_gstin}
                    />
                  ) : null}
                </div>
              </article>

              <article className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
                <div className="flex items-center gap-3 border-b border-[var(--line)] pb-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
                    <UserRound aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--muted-foreground)]">
                      Bill to (Customer)
                    </p>
                    <h3 className="break-words font-bold text-[var(--ink)]">
                      {quote.snapshot.buyer_display_name || "—"}
                    </h3>
                  </div>
                </div>
                <div className="grid min-w-0 gap-x-5 divide-y divide-[var(--line)] sm:grid-cols-2 sm:divide-y-0">
                  <SnapshotField
                    icon={UserRound}
                    label="Contact"
                    value={quote.snapshot.buyer_contact_name}
                  />
                  <SnapshotField
                    icon={MapPin}
                    label="Address"
                    value={quote.snapshot.buyer_billing_address}
                  />
                  <SnapshotField
                    icon={Mail}
                    label="Email"
                    value={quote.snapshot.buyer_email}
                  />
                  <SnapshotField
                    icon={Phone}
                    label="Phone"
                    value={quote.snapshot.buyer_phone}
                  />
                  <SnapshotField
                    icon={Building2}
                    label="State"
                    value={quote.snapshot.buyer_state_code}
                  />
                  {quote.snapshot.buyer_gstin_applicable ? (
                    <SnapshotField
                      icon={ReceiptText}
                      label="GSTIN"
                      value={quote.snapshot.buyer_gstin}
                    />
                  ) : null}
                </div>
              </article>
            </div>

            <div className="border-t border-[var(--line)] px-4 py-4 sm:px-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <CalendarDays aria-hidden="true" className="size-4 text-[var(--brand)]" />
                <h3 className="break-words font-bold text-[var(--ink)]">
                  {headings.itemDescription}
                </h3>
                <p className="ml-auto text-sm font-semibold text-[var(--brand)]">
                  {headings.totalTitle}: {formatPaise(quote.totals.total_minor)}
                </p>
              </div>
              <div className="space-y-3 sm:hidden">
                {quote.lines.map((line) => (
                  <article
                    key={line.id}
                    className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                          Line {line.position}
                        </p>
                        <h4 className="mt-1 break-words text-sm font-semibold text-[var(--ink)]">
                          {line.description}
                        </h4>
                        {line.hsn_sac ? (
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            HSN/SAC {line.hsn_sac}
                          </p>
                        ) : null}
                        <QuotationLineComponents components={line.components} />
                      </div>
                      <p className="shrink-0 text-right text-sm font-bold tabular-nums">
                        {formatPaise(line.line_total_minor)}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3 text-xs">
                      <p>
                        <span className="block text-[var(--muted-foreground)]">
                          Quantity
                        </span>
                        <span className="mt-1 block font-medium">
                          {line.quantity} {line.unit_label}
                        </span>
                      </p>
                      <p>
                        <span className="block text-[var(--muted-foreground)]">
                          Unit price
                        </span>
                        <span className="mt-1 block font-medium tabular-nums">
                          {formatPaise(line.unit_price_minor)}
                        </span>
                      </p>
                      <p>
                        <span className="block text-[var(--muted-foreground)]">GST</span>
                        <span className="mt-1 block font-medium">
                          {line.gst_category.replaceAll("_", " ")}
                          {line.gst_rate ? ` · ${line.gst_rate}%` : ""}
                        </span>
                      </p>
                      <p>
                        <span className="block text-[var(--muted-foreground)]">
                          Line total
                        </span>
                        <span className="mt-1 block font-semibold tabular-nums">
                          {formatPaise(line.line_total_minor)}
                        </span>
                      </p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto rounded-xl border border-[var(--line)] sm:block">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-[var(--canvas)] text-xs text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Line</th>
                      <th className="px-4 py-3 font-semibold">Qty</th>
                      <th className="px-4 py-3 font-semibold">Unit price</th>
                      <th className="px-4 py-3 font-semibold">GST</th>
                      <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {quote.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--ink)]">
                            {line.position}. {line.description}
                          </p>
                          {line.hsn_sac ? (
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                              HSN/SAC {line.hsn_sac}
                            </p>
                          ) : null}
                          <QuotationLineComponents components={line.components} />
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {line.quantity} {line.unit_label}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {formatPaise(line.unit_price_minor)}
                        </td>
                        <td className="px-4 py-3">
                          {line.gst_category.replaceAll("_", " ")}
                          {line.gst_rate ? ` · ${line.gst_rate}%` : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {formatPaise(line.line_total_minor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ml-auto mt-4 w-full max-w-sm space-y-2 rounded-xl bg-[var(--paper)] p-4 text-sm">
                <div className="flex justify-between gap-3 text-[var(--muted-foreground)]">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    {formatPaise(quote.totals.subtotal_minor)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-[var(--muted-foreground)]">
                  <span>GST total</span>
                  <span className="tabular-nums">
                    {formatPaise(quote.totals.gst_total_minor)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-2 font-bold text-[var(--ink)]">
                  <span>Quotation total</span>
                  <span className="tabular-nums">
                    {formatPaise(quote.totals.total_minor)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      <QuotationWorkflowPanel
        workflow={workflow}
        shareRequestKey={randomUUID()}
        rotateRequestKey={randomUUID()}
        shareBlockers={shareBlockers}
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
