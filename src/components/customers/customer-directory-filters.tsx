"use client";

import { ArrowDownUp, Filter, Search } from "lucide-react";
import { indianStates, stateLabel } from "@/server/modules/business/states";

export type CustomerDirectoryFilterValues = {
  search: string;
  customerStatus: "all" | "active" | "archived";
  gstinStatus: "all" | "applicable" | "not_applicable";
  stateCode: string;
  sort: "name_asc" | "name_desc";
};

export function CustomerDirectoryFilters({
  values,
}: {
  values: CustomerDirectoryFilterValues;
}) {
  return (
    <form
      action="/customers"
      className="grid gap-2.5 border-b border-[var(--line)] p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(260px,1fr)_repeat(4,minmax(150px,auto))]"
      method="get"
    >
      <label className="relative min-w-0 sm:col-span-2 xl:col-span-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
        <span className="sr-only">Search customers by name, phone, or email</span>
        <input
          className="h-11 w-full rounded-lg border border-[var(--line)] bg-white pl-10 pr-3 text-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/15"
          maxLength={100}
          name="q"
          placeholder="Search name, phone, or email..."
          type="search"
          defaultValue={values.search}
        />
      </label>

      <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-sm">
        <Filter
          aria-hidden="true"
          className="size-4 shrink-0 text-[var(--muted-foreground)]"
        />
        <span className="sr-only">Customer status</span>
        <select
          aria-label="Customer status"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
          defaultValue={values.customerStatus}
          name="status"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="all">All customers</option>
          <option value="active">Active customers</option>
          <option value="archived">Archived customers</option>
        </select>
      </label>

      <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-sm">
        <span className="sr-only">GSTIN status</span>
        <select
          aria-label="GSTIN status"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
          defaultValue={values.gstinStatus}
          name="gstin"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="all">Any GSTIN status</option>
          <option value="applicable">GSTIN applicable</option>
          <option value="not_applicable">No GSTIN</option>
        </select>
      </label>

      <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-sm">
        <span className="sr-only">Filter by state</span>
        <select
          aria-label="State"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
          defaultValue={values.stateCode}
          name="state"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="">All states</option>
          {indianStates.map(([code]) => (
            <option key={code} value={code}>
              {stateLabel(code)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-sm">
        <ArrowDownUp
          aria-hidden="true"
          className="size-4 shrink-0 text-[var(--muted-foreground)]"
        />
        <span className="sr-only">Sort customers</span>
        <select
          aria-label="Sort customers"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
          defaultValue={values.sort}
          name="sort"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="name_asc">Name (A–Z)</option>
          <option value="name_desc">Name (Z–A)</option>
        </select>
      </label>
    </form>
  );
}
