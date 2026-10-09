import { randomUUID } from "node:crypto";
import Link from "next/link";
import { NewQuotationForm } from "@/components/quotations/new-quotation-form";
import { createQuotationAction } from "@/server/modules/quotations/actions";
import { listQuotationCustomers } from "@/server/modules/quotations/queries";

export default async function NewQuotationPage() {
  const customers = await listQuotationCustomers();
  return (
    <section>
      <Link href="/quotations" className="text-sm font-medium text-[var(--brand)]">
        ← Quotations
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">New quotation</h1>
      {customers.length ? (
        <NewQuotationForm
          customers={customers}
          requestKey={randomUUID()}
          action={createQuotationAction}
        />
      ) : (
        <div className="mt-7 rounded-2xl border border-dashed border-[var(--line)] bg-white p-6">
          <p className="text-sm">Add a customer before creating a quotation.</p>
          <Link
            href="/customers/new"
            className="mt-4 inline-block font-medium text-[var(--brand)] underline"
          >
            Add customer
          </Link>
        </div>
      )}
    </section>
  );
}
