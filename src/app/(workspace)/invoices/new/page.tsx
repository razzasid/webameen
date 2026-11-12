import { randomUUID } from "node:crypto";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { DirectInvoiceEditor } from "@/components/invoices/direct-invoice-editor";
import { Button } from "@/components/ui/button";
import { getBusinessSettings } from "@/server/modules/business/settings-queries";
import { listGstRateOptions } from "@/server/modules/catalog/queries";
import {
  listInvoiceCatalogChoices,
  listInvoiceCustomers,
  listInvoiceNumberPeriods,
} from "@/server/modules/invoices/queries";

export const metadata = {
  title: "New Invoice — Webameen",
  description: "Create a direct tax invoice for a customer.",
};

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams?: Promise<{ customerId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialCustomerId = resolvedSearchParams?.customerId;

  const [customers, catalog, rates, { profile }, periods] = await Promise.all([
    listInvoiceCustomers(),
    listInvoiceCatalogChoices(),
    listGstRateOptions(),
    getBusinessSettings(),
    listInvoiceNumberPeriods(),
  ]);

  const requestKey = randomUUID();

  return (
    <section className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex min-h-9 items-center gap-2 text-sm">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 font-medium text-[var(--muted-foreground)] hover:text-[var(--brand)]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Invoices
        </Link>
        <span aria-hidden="true" className="text-[var(--muted-foreground)]">
          /
        </span>
        <span className="font-semibold text-[var(--ink)]">Create direct invoice</span>
      </nav>

      {/* Page Header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
          Create invoice
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Issue a sales invoice directly to an existing customer without a preceding
          quotation. Review items, pricing, and tax details below.
        </p>
      </header>

      {customers.length === 0 ? (
        <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white p-8 text-center sm:p-12">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--mint)] text-[var(--brand)]">
            <FileText aria-hidden="true" className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-[var(--ink)]">Add a customer first</h2>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted-foreground)]">
            Direct invoices require an existing customer record to capture verified billing
            and tax details.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link href="/customers/new">
              <Plus className="size-4" /> Add customer
            </Link>
          </Button>
        </div>
      ) : (
        <DirectInvoiceEditor
          customers={customers}
          catalog={catalog}
          rates={rates.map((r) => r.rate)}
          business={profile}
          periods={periods}
          requestKey={requestKey}
          initialCustomerId={initialCustomerId}
        />
      )}
    </section>
  );
}
