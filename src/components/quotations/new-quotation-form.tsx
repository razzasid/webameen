"use client";

import {
  Building2,
  FileText,
  Info,
  type LucideIcon,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { indianStates } from "@/server/modules/business/states";
import type { NewQuotationState } from "@/server/modules/quotations/actions";
import type { CustomerChoice } from "@/server/modules/quotations/queries";

export function NewQuotationForm({
  customers,
  requestKey,
  action,
}: {
  customers: CustomerChoice[];
  requestKey: string;
  action: (state: NewQuotationState, data: FormData) => Promise<NewQuotationState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [customerId, setCustomerId] = useState("");
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const customerState = selectedCustomer?.state_code
    ? indianStates.find(([code]) => code === selectedCustomer.state_code)
    : null;

  return (
    <form
      action={formAction}
      className="mt-6 max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm sm:mt-7 sm:rounded-3xl"
    >
      <input type="hidden" name="requestKey" value={requestKey} />
      <div className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-5 sm:px-6 sm:py-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
          <FileText aria-hidden="true" className="size-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)] sm:text-xl">
            Select customer
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Choose the customer for this quotation.
          </p>
        </div>
      </div>
      <div className="space-y-5 p-4 sm:p-6">
        {state.error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {state.error}
          </p>
        ) : null}
        <label className="block text-sm font-medium text-[var(--ink)]" htmlFor="customerId">
          Customer <span className="text-red-700">*</span>
          <select
            id="customerId"
            required
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-lg border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--mint)]"
          >
            <option value="">Select a customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.display_name}
              </option>
            ))}
          </select>
        </label>
        {selectedCustomer ? (
          <section
            aria-label="Selected customer details"
            className="rounded-2xl bg-[var(--canvas)]/80 p-4 sm:p-5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
                <Building2 aria-hidden="true" className="size-6" />
              </span>
              <div className="min-w-0">
                <h3 className="break-words font-semibold text-[var(--ink)]">
                  {selectedCustomer.display_name}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Customer selected for this quotation
                </p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <PreviewDetail icon={Phone} label="Phone" value={selectedCustomer.phone} />
              <PreviewDetail icon={Mail} label="Email" value={selectedCustomer.email} />
              <PreviewDetail
                icon={MapPin}
                label="State or territory"
                value={customerState ? `${customerState[1]} (${customerState[0]})` : null}
              />
            </dl>
          </section>
        ) : null}
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-sky-800" />
          <div className="text-sm">
            <p className="font-semibold text-[var(--ink)]">
              Customer details are copied into the draft.
            </p>
            <p className="mt-1 leading-5 text-[var(--muted-foreground)]">
              You can review and edit the quotation snapshot before sharing. Later changes
              to the customer record will not change this draft.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] bg-[var(--paper)]/60 px-4 py-4 sm:flex-row sm:px-6">
        <Link
          href="/quotations"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          Cancel
        </Link>
        <button
          disabled={pending || !customerId}
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileText aria-hidden="true" className="mr-2 size-4" />
          {pending ? "Creating draft…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

function PreviewDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--brand)]" />
      <div className="min-w-0">
        <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
        <dd className="mt-1 break-words font-medium text-[var(--ink)]">{value || "—"}</dd>
      </div>
    </div>
  );
}
