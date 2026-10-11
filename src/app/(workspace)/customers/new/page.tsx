import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CustomerForm } from "@/components/customers/customer-form";
import { createCustomerAction } from "@/server/modules/customers/actions";

export default function NewCustomerPage() {
  return (
    <section className="space-y-5 sm:space-y-6">
      <nav aria-label="Breadcrumb" className="flex min-h-10 items-center gap-2 text-sm">
        <Link
          href="/customers"
          className="inline-flex min-h-10 items-center gap-2 font-medium text-[var(--brand)] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Customers
        </Link>
        <span aria-hidden="true" className="text-[var(--muted-foreground)]">
          /
        </span>
        <span className="font-medium text-[var(--ink)]">Add customer</span>
      </nav>
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
          Add customer
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] sm:text-base">
          Add the customer details your business needs to keep on file.
        </p>
      </header>
      <CustomerForm
        action={createCustomerAction}
        submitLabel="Create customer"
        variant="create"
      />
    </section>
  );
}
