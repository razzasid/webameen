import { randomUUID } from "node:crypto";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { QuotationDraftEditor } from "@/components/quotations/quotation-draft-editor";
import { getBusinessSettings } from "@/server/modules/business/settings-queries";
import { listGstRateOptions } from "@/server/modules/catalog/queries";
import { saveNewQuotationAction } from "@/server/modules/quotations/actions";
import { newQuotationDraft } from "@/server/modules/quotations/new-draft";
import {
  listQuotationCatalogChoices,
  listQuotationCustomers,
} from "@/server/modules/quotations/queries";

export default async function NewQuotationPage() {
  const [customers, catalog, rates, { profile }] = await Promise.all([
    listQuotationCustomers(),
    listQuotationCatalogChoices(),
    listGstRateOptions(),
    getBusinessSettings(),
  ]);
  const quote = newQuotationDraft(profile, randomUUID());
  return (
    <section className="space-y-5 sm:space-y-6">
      <nav aria-label="Breadcrumb" className="flex min-h-10 items-center gap-2 text-sm">
        <Link
          href="/quotations"
          className="inline-flex min-h-10 items-center gap-2 font-medium text-[var(--brand)] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Quotations
        </Link>
        <span aria-hidden="true" className="text-[var(--muted-foreground)]">
          /
        </span>
        <span className="font-medium text-[var(--ink)]">New quotation</span>
      </nav>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
          New quotation
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
          Choose a customer, add your items, and save your quotation below.
        </p>
      </header>
      {customers.length ? (
        <QuotationDraftEditor
          quote={quote}
          customers={customers}
          catalog={catalog}
          rates={rates.map((rate) => rate.rate)}
          paymentDefaults={profile}
          action={saveNewQuotationAction}
        />
      ) : (
        <div className="flex max-w-3xl flex-col items-start gap-4 rounded-2xl border border-dashed border-[var(--line)] bg-white p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
            <FileText aria-hidden="true" className="size-6" />
          </span>
          <div>
            <p className="font-semibold text-[var(--ink)]">Add a customer first</p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              A customer is needed to create a quotation draft.
            </p>
          </div>
          <Link
            href="/customers/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 sm:ml-auto"
          >
            Add customer
          </Link>
        </div>
      )}
    </section>
  );
}
