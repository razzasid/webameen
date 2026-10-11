import { randomUUID } from "node:crypto";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  Download,
  Ellipsis,
  FileText,
  Hash,
  Link2,
  ScrollText,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { InvoiceSharePanel } from "@/components/invoices/invoice-share-panel";
import { WorkspaceInvoiceDocument } from "@/components/invoices/workspace-invoice-document";
import { InvoicePaymentPanel } from "@/components/payments/invoice-payment-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPaise } from "@/server/modules/catalog/validation";
import { toInvoiceDocument } from "@/server/modules/invoices/document-model";
import { getInvoice, listInvoicePublicLinks } from "@/server/modules/invoices/queries";
import { getInvoicePaymentSummary } from "@/server/modules/payments/queries";
import { getQuotationWorkflow } from "@/server/modules/quotations/queries";

function formatInvoiceDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function paymentStatusLabel(status: string, overdue: boolean) {
  if (overdue && status !== "paid") return "Overdue";
  if (status === "part_paid") return "Partially paid";
  if (status === "unpaid") return "Pending";
  return "Paid";
}

function SummaryItem({
  icon: Icon,
  label,
  value,
  tone = "green",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "green" | "blue" | "amber";
}) {
  const toneClasses = {
    green: "bg-[#e2f3eb] text-[#176b4c]",
    blue: "bg-[#e5f0fb] text-[#315b8a]",
    amber: "bg-[#fff1dd] text-[#8d5400]",
  }[tone];

  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClasses}`}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-[var(--ink)]">
          {value}
        </p>
      </div>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  const [paymentSummary, links, quotationWorkflow] = await Promise.all([
    getInvoicePaymentSummary(id),
    listInvoicePublicLinks(id),
    getQuotationWorkflow(invoice.quotation_id),
  ]);
  const issuedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: invoice.document_time_zone,
  }).format(new Date(invoice.issued_at));
  const status = paymentStatusLabel(paymentSummary.payment_status, paymentSummary.overdue);
  const sourceVersion = quotationWorkflow.versions.find(
    (version) => version.id === invoice.source_version_id,
  );
  const statusTone =
    paymentSummary.payment_status === "paid"
      ? "green"
      : paymentSummary.overdue
        ? "amber"
        : paymentSummary.payment_status === "part_paid"
          ? "blue"
          : "amber";

  return (
    <section className="mx-auto w-full max-w-[1120px] min-w-0 space-y-3 sm:space-y-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Link
          href="/invoices"
          className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--brand)]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Invoices
        </Link>
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          Invoice details
        </span>
      </div>

      <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--brand)] sm:size-14">
            <FileText aria-hidden="true" className="size-6 sm:size-7" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--brand)]">Issued invoice</p>
            <h1 className="break-words text-2xl font-bold leading-tight tracking-[-0.035em] text-[var(--ink)] sm:text-3xl">
              {invoice.reference}
            </h1>
            <p className="mt-1 break-words text-xs leading-5 text-[var(--muted-foreground)] sm:text-sm">
              Invoice date {formatInvoiceDate(invoice.invoice_date)} · Issued {issuedAt} (
              {invoice.document_time_zone})
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(150px,1fr)_auto] sm:items-center lg:w-auto lg:flex lg:justify-end">
          <div className="sm:text-right">
            <p className="text-xs text-[var(--muted-foreground)]">Total</p>
            <p className="text-2xl font-bold leading-tight tabular-nums tracking-tight text-[var(--ink)]">
              {formatPaise(invoice.total_minor)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {invoice.currency_code}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              asChild
              variant="outline"
              className="min-h-10 flex-1 gap-2 sm:flex-none"
            >
              <a href={`/invoices/${invoice.id}/pdf`}>
                <Download aria-hidden="true" />
                Download PDF
              </a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="min-h-10 flex-1 gap-2 sm:flex-none">
                  <Ellipsis aria-hidden="true" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem asChild>
                  <Link href={`/quotations/${invoice.quotation_id}`}>
                    <ScrollText aria-hidden="true" />
                    Open source quotation
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/customers/${invoice.customer_id}`}>
                    <UsersRound aria-hidden="true" />
                    View customer record
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="#customer-access">
                    <Link2 aria-hidden="true" />
                    Manage customer access
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <section className="grid min-w-0 overflow-hidden rounded-2xl border border-[#d9eee5] bg-[#eaf6f1] sm:grid-cols-2 lg:grid-cols-4">
        <SummaryItem icon={BadgeCheck} label="Status" value={status} tone={statusTone} />
        <SummaryItem
          icon={CalendarDays}
          label="Issue date"
          value={formatInvoiceDate(invoice.invoice_date)}
        />
        <SummaryItem
          icon={CircleDollarSign}
          label="Payment status"
          value={paymentSummary.payment_status === "paid" ? "Fully paid" : status}
          tone={paymentSummary.overdue ? "amber" : statusTone}
        />
        <SummaryItem
          icon={Hash}
          label="Numbering"
          value={`${invoice.numbering_period} (${invoice.sequence_number} from period)`}
        />
      </section>

      <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_1px_2px_rgb(15_45_36/4%)] sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
            <Link2 aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-[var(--ink)]">Approved source</h2>
              <Button asChild variant="outline" size="sm" className="min-h-9 gap-2">
                <Link href={`/quotations/${invoice.quotation_id}`}>
                  <ArrowUpRight aria-hidden="true" />
                  View quotation
                </Link>
              </Button>
            </div>
            <p className="mt-1 break-words text-xs leading-5 text-[var(--muted-foreground)]">
              Quotation {quotationWorkflow.reference} · version{" "}
              {sourceVersion?.version_number ?? "—"} · {invoice.source_version_id}
              <span className="hidden sm:inline">
                {" "}
                · Approval evidence {invoice.approved_response_id}
              </span>
            </p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              <Link
                className="font-semibold text-[var(--ink)] hover:text-[var(--brand)]"
                href={`/quotations/${invoice.quotation_id}`}
              >
                Open quotation history
              </Link>
              <span className="mx-2" aria-hidden="true">
                ·
              </span>
              Number {invoice.sequence_number} from owner-configured period “
              {invoice.numbering_period}”.
            </p>
            <p className="mt-1 break-all text-xs text-[var(--muted-foreground)] sm:hidden">
              Approval evidence {invoice.approved_response_id}
            </p>
          </div>
        </div>
      </section>

      <InvoiceSharePanel
        invoiceId={invoice.id}
        links={links}
        createRequestKey={randomUUID()}
        rotateRequestKey={randomUUID()}
        collapsible
      />

      <WorkspaceInvoiceDocument document={toInvoiceDocument(invoice)} />

      <InvoicePaymentPanel invoiceId={invoice.id} summary={paymentSummary} />

      <p className="flex min-w-0 items-start gap-2 rounded-xl border border-[#d7e7f4] bg-[#eff6fc] px-4 py-3 text-xs leading-5 text-[#355c7d]">
        <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          This issued invoice is an immutable copy of the approved quotation. Corrections to
          recorded payments are retained in the payment history.
        </span>
      </p>
    </section>
  );
}
