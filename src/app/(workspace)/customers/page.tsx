import Link from "next/link";
import { CustomerSearch } from "@/components/customers/customer-search";
import { stateLabel } from "@/server/modules/business/states";
import { CUSTOMERS_PER_PAGE, listCustomers } from "@/server/modules/customers/queries";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const { q = "", page: pageParam = "1" } = await searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const requestedPage =
    typeof pageParam === "string" && /^\d{1,6}$/.test(pageParam) ? Number(pageParam) : 1;
  const { customers, page, total, totalPages } = await listCustomers(search, requestedPage);
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(targetPage));
    return `/customers?${params.toString()}`;
  }
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Customers</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Manage the customer records for your business.
          </p>
        </div>
        <Link
          href="/customers/new"
          className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          Add customer
        </Link>
      </div>

      <CustomerSearch initialSearch={search} />

      {customers.length ? (
        <div className="mt-5">
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <ul className="divide-y divide-[var(--line)]">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-[#f8fbf9] md:px-5"
                  >
                    <span className="min-w-48 flex-1">
                      <strong className="block text-sm font-semibold">
                        {customer.display_name}
                      </strong>
                      <span className="mt-1 block text-sm text-[var(--muted)]">
                        {[customer.phone, customer.email].filter(Boolean).join(" · ") ||
                          "No phone or email"}
                      </span>
                    </span>
                    <span className="text-sm text-[var(--muted)]">
                      {customer.state_code
                        ? stateLabel(customer.state_code)
                        : "State not set"}
                    </span>
                    <span className="rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[#22584d]">
                      {customer.gstin_applicable ? "GSTIN applicable" : "No GSTIN"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <nav
            aria-label="Customer pages"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <p className="text-[var(--muted)]">
              Showing {(page - 1) * CUSTOMERS_PER_PAGE + 1}–
              {Math.min(page * CUSTOMERS_PER_PAGE, total)} of {total} customers
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-3">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-medium hover:bg-[var(--paper)]"
                  >
                    Previous
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="rounded-xl border border-[var(--line)] px-4 py-2 text-[var(--muted)]"
                  >
                    Previous
                  </span>
                )}
                <span>
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-medium hover:bg-[var(--paper)]"
                  >
                    Next
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="rounded-xl border border-[var(--line)] px-4 py-2 text-[var(--muted)]"
                  >
                    Next
                  </span>
                )}
              </div>
            ) : null}
          </nav>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">
            {search ? "No customers found" : "No customers yet"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {search
              ? "Try a different name, phone number, or email."
              : "Add a customer to keep their contact and GST details together."}
          </p>
          {!search ? (
            <Link
              href="/customers/new"
              className="mt-5 inline-block rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white"
            >
              Add your first customer
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
