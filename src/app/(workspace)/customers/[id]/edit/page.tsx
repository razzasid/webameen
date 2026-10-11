import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CustomerForm } from "@/components/customers/customer-form";
import { updateCustomerAction } from "@/server/modules/customers/actions";
import { getCustomer } from "@/server/modules/customers/queries";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  const initial = {
    displayName: customer.display_name,
    contactName: customer.contact_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    billingAddress: customer.billing_address ?? "",
    stateCode: customer.state_code ?? "",
    gstinApplicable: customer.gstin_applicable ? "yes" : "no",
    gstin: customer.gstin ?? "",
  };
  const action = updateCustomerAction.bind(null, customer.id);
  return (
    <section className="space-y-5 sm:space-y-6">
      <nav aria-label="Breadcrumb" className="flex min-h-10 items-center gap-2 text-sm">
        <Link
          href={`/customers/${customer.id}`}
          className="inline-flex min-h-10 items-center gap-2 font-medium text-[var(--brand)] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Customers
        </Link>
        <span aria-hidden="true" className="text-[var(--muted-foreground)]">
          /
        </span>
        <span className="font-medium text-[var(--ink)]">Edit customer</span>
      </nav>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
          Edit customer
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] sm:text-base">
          Update the customer details for your business.
        </p>
      </header>
      <CustomerForm
        action={action}
        initial={initial}
        submitLabel="Save changes"
        variant="edit"
      />
    </section>
  );
}
