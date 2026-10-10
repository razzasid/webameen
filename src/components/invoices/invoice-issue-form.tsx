"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  type IssueInvoiceActionState,
  issueApprovedQuotationAction,
} from "@/server/modules/invoices/actions";

const initialState: IssueInvoiceActionState = {};
const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

export function InvoiceIssueForm({ quotationId }: { quotationId: string }) {
  const [state, formAction, pending] = useActionState(
    issueApprovedQuotationAction,
    initialState,
  );
  const [dueOn, setDueOn] = useState(state.dueOn ?? "");
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    if (state.dueOn !== undefined) setDueOn(state.dueOn);
  }, [state.dueOn]);

  if (state.invoiceId) {
    return (
      <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
        <p role="status" className="text-sm font-semibold text-green-900">
          {state.created
            ? "Invoice issued and locked."
            : "This quotation already has an invoice."}
        </p>
        <Link
          className="mt-2 inline-block text-sm font-semibold text-[var(--brand)] underline"
          href={`/invoices/${state.invoiceId}`}
        >
          Open invoice
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="quotationId" value={quotationId} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      <label className="block max-w-xs text-sm font-medium" htmlFor="invoice-due-on">
        Due date <span className="font-normal text-[var(--muted)]">(optional)</span>
        <input
          id="invoice-due-on"
          className={inputClass}
          name="dueOn"
          type="date"
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          className="mt-1 size-4 accent-[var(--brand)]"
          type="checkbox"
          name="reviewed"
          required
          checked={reviewed}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        <span>
          I reviewed the approved quotation, tax treatment and payment terms. I understand
          this invoice is issued immediately and cannot be edited.
        </span>
      </label>
      <button
        type="submit"
        className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Issuing invoice…" : "Issue invoice"}
      </button>
    </form>
  );
}
