import Link from "next/link";
import { notFound } from "next/navigation";
import { stateLabel } from "@/server/modules/business/states";
import { gstinStateWarning } from "@/server/modules/business/validation";
import { getCustomer } from "@/server/modules/customers/queries";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await getCustomer(id);
  const gstinWarning = customer.state_code
    ? gstinStateWarning(customer.gstin, customer.state_code)
    : null;
  const rows = [
    ["Contact name", customer.contact_name],
    ["Phone", customer.phone],
    ["Email", customer.email],
    ["Address", customer.billing_address],
    ["State", customer.state_code ? stateLabel(customer.state_code) : null],
    [
      "GSTIN applicable",
      customer.gstin_applicable === null ? null : customer.gstin_applicable ? "Yes" : "No",
    ],
    ["GSTIN", customer.gstin],
  ] as const;
  return (
    <section>
      <Link
        href="/customers"
        className="text-sm font-medium text-[var(--brand)] hover:underline"
      >
        ← Customers
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Customer</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
            {customer.display_name}
          </h1>
        </div>
        <Link
          href={`/customers/${customer.id}/edit`}
          className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white"
        >
          Edit customer
        </Link>
      </div>
      {customer.archived_at ? (
        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          This customer is archived.
        </p>
      ) : null}
      {gstinWarning ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {gstinWarning}
        </p>
      ) : null}
      <dl className="mt-7 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-white p-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {label}
            </dt>
            <dd className="mt-2 whitespace-pre-line text-sm">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-xs text-[var(--muted)]">
        Customer details are maintained as a master record. Future quotations will use their
        own saved customer snapshot.
      </p>
    </section>
  );
}
