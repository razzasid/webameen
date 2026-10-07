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
    <section>
      <Link
        href={`/customers/${customer.id}`}
        className="text-sm font-medium text-[var(--brand)] hover:underline"
      >
        ← Customer details
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Edit customer</h1>
      <CustomerForm action={action} initial={initial} submitLabel="Save changes" />
    </section>
  );
}
