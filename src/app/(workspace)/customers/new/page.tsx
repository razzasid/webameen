import Link from "next/link";
import { CustomerForm } from "@/components/customers/customer-form";
import { createCustomerAction } from "@/server/modules/customers/actions";

export default function NewCustomerPage() {
  return (
    <section>
      <Link
        href="/customers"
        className="text-sm font-medium text-[var(--brand)] hover:underline"
      >
        ← Customers
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Add customer</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Add the customer details your business needs to keep on file.
      </p>
      <CustomerForm action={createCustomerAction} submitLabel="Create customer" />
    </section>
  );
}
