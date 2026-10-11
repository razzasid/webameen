import { FileCheck2, MapPinned, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { CustomerDirectoryFilters } from "@/components/customers/customer-directory-filters";
import { Button } from "@/components/ui/button";
import { isIndianStateCode, stateLabel } from "@/server/modules/business/states";
import {
  CUSTOMERS_PER_PAGE,
  type CustomerListFilters,
  listCustomers,
} from "@/server/modules/customers/queries";

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <article className="flex min-w-0 items-center gap-4 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#e2f2eb] text-[#176b4c]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--muted-foreground)]">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-[var(--ink)]">
          {value.toLocaleString("en-IN")}
        </p>
      </div>
    </article>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    status?: string | string[];
    gstin?: string | string[];
    state?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const pageParam = typeof params.page === "string" ? params.page : "1";
  const requestedPage = /^\d{1,6}$/.test(pageParam) ? Number(pageParam) : 1;
  const rawCustomerStatus = typeof params.status === "string" ? params.status : "";
  const customerStatus: NonNullable<CustomerListFilters["customerStatus"]> = [
    "all",
    "active",
    "archived",
  ].includes(rawCustomerStatus)
    ? (rawCustomerStatus as NonNullable<CustomerListFilters["customerStatus"]>)
    : "all";
  const rawGstinStatus = typeof params.gstin === "string" ? params.gstin : "";
  const gstinStatus: NonNullable<CustomerListFilters["gstinStatus"]> = [
    "all",
    "applicable",
    "not_applicable",
  ].includes(rawGstinStatus)
    ? (rawGstinStatus as NonNullable<CustomerListFilters["gstinStatus"]>)
    : "all";
  const rawStateCode = typeof params.state === "string" ? params.state : "";
  const stateCode = isIndianStateCode(rawStateCode) ? rawStateCode : "";
  const sort = params.sort === "name_desc" ? "name_desc" : "name_asc";
  const filters: CustomerListFilters = { customerStatus, gstinStatus, stateCode, sort };
  const { customers, page, total, totalPages, summary } = await listCustomers(
    search,
    requestedPage,
    filters,
  );

  function pageHref(targetPage: number) {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (customerStatus !== "all") query.set("status", customerStatus);
    if (gstinStatus !== "all") query.set("gstin", gstinStatus);
    if (stateCode) query.set("state", stateCode);
    if (sort !== "name_asc") query.set("sort", sort);
    query.set("page", String(targetPage));
    return `/customers?${query.toString()}`;
  }

  return (
    <section className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
            Workspace directory
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-[2rem]">
            Customers
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Manage customer contacts, GSTIN details, and business locations.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/customers/new">
            <Plus aria-hidden="true" />
            Add customer
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Total customers"
          value={summary.total}
          icon={<UsersRound aria-hidden="true" className="size-6" />}
        />
        <SummaryCard
          label="GSTIN applicable"
          value={summary.gstinApplicable}
          icon={<FileCheck2 aria-hidden="true" className="size-6" />}
        />
        <SummaryCard
          label="States represented"
          value={summary.states}
          icon={<MapPinned aria-hidden="true" className="size-6" />}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <CustomerDirectoryFilters
          values={{ search, customerStatus, gstinStatus, stateCode, sort }}
        />

        {customers.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="bg-[#f8faf9] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">State</th>
                    <th className="px-4 py-3 font-semibold">GSTIN</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="transition-colors hover:bg-[#f8fbf9]">
                      <td className="max-w-[260px] px-5 py-3.5">
                        <span className="block truncate font-semibold text-[var(--ink)]">
                          {customer.display_name}
                        </span>
                        {customer.archived_at ? (
                          <span className="mt-1 inline-flex rounded-full bg-[#eef1f0] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                            Archived
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[260px] px-4 py-3.5">
                        <span className="block truncate text-[var(--ink)]">
                          {customer.phone || "No phone"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                          {customer.email ||
                            customer.contact_name ||
                            "No email or contact name"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                        {customer.state_code ? stateLabel(customer.state_code) : "Not set"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${customer.gstin_applicable ? "bg-[#e2f3eb] text-[#176b4c]" : "bg-[#eef1f0] text-[#53645d]"}`}
                        >
                          {customer.gstin_applicable ? "GSTIN on file" : "No GSTIN"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/customers/${customer.id}`}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[var(--line)] md:hidden">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <Link
                    aria-label={`Open customer ${customer.display_name}`}
                    className="block space-y-3 p-4 transition-colors hover:bg-[#f8fbf9] focus-visible:bg-[#f8fbf9]"
                    href={`/customers/${customer.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--ink)]">
                          {customer.display_name}
                        </p>
                        <p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">
                          {customer.phone ||
                            customer.email ||
                            customer.contact_name ||
                            "No contact details"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${customer.gstin_applicable ? "bg-[#e2f3eb] text-[#176b4c]" : "bg-[#eef1f0] text-[#53645d]"}`}
                      >
                        {customer.gstin_applicable ? "GSTIN on file" : "No GSTIN"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                      <span>
                        {customer.state_code
                          ? stateLabel(customer.state_code)
                          : "State not set"}
                      </span>
                      {customer.archived_at ? <span>Archived</span> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <nav
              aria-label="Customer pages"
              className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <p
                aria-live="polite"
                className="text-xs text-[var(--muted-foreground)] sm:text-sm"
              >
                Showing {(page - 1) * CUSTOMERS_PER_PAGE + 1}–
                {Math.min(page * CUSTOMERS_PER_PAGE, total)} of {total} customers
              </p>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={pageHref(page - 1)}>Previous</Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Previous
                    </Button>
                  )}
                  <span
                    aria-current="page"
                    className="px-2 text-sm font-semibold tabular-nums"
                  >
                    {page} / {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={pageHref(page + 1)}>Next</Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Next
                    </Button>
                  )}
                </div>
              ) : null}
            </nav>
          </>
        ) : (
          <div className="px-5 py-12 text-center sm:py-16">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#e2f2eb] text-[var(--brand)]">
              <UsersRound aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--ink)]">
              {search || customerStatus !== "all" || gstinStatus !== "all" || stateCode
                ? "No matching customers"
                : "No customers yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
              {search || customerStatus !== "all" || gstinStatus !== "all" || stateCode
                ? "Try changing your search or filters."
                : "Add a customer to keep their contact and GST details together."}
            </p>
            {!search && customerStatus === "all" && gstinStatus === "all" && !stateCode ? (
              <Button asChild className="mt-5">
                <Link href="/customers/new">
                  <Plus aria-hidden="true" />
                  Add customer
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
