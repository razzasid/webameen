"use client";

import { useActionState } from "react";
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
  return (
    <form
      action={formAction}
      className="mt-7 max-w-xl space-y-5 rounded-2xl border border-[var(--line)] bg-white p-6"
    >
      <input type="hidden" name="requestKey" value={requestKey} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      <label className="block text-sm font-medium">
        Customer
        <select
          required
          name="customerId"
          defaultValue=""
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm"
        >
          <option value="">Select a customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.display_name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-[var(--muted)]">
        The selected customer remains fixed for this quotation. Its current details will be
        copied into the new draft for review.
      </p>
      <button
        disabled={pending}
        type="submit"
        className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
