"use client";

import { useActionState } from "react";
import {
  type PublicResponseState,
  respondToQuotationAction,
} from "@/server/modules/quotations/public-actions";

const initialState: PublicResponseState = {};
export function PublicResponseForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(respondToQuotationAction, initialState);
  return (
    <form
      action={action}
      className="mt-6 space-y-4 rounded-2xl border border-[var(--line)] bg-white p-5"
    >
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium">
        Your name (optional)
        <input
          name="respondentName"
          maxLength={200}
          autoComplete="name"
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5"
        />
      </label>
      <label className="block text-sm font-medium">
        Note (optional)
        <textarea
          name="customerNote"
          maxLength={2000}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-green-800">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="kind"
          value="approved"
          disabled={pending}
          className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Sending…" : "Approve quotation"}
        </button>
        <button
          type="submit"
          name="kind"
          value="change_requested"
          disabled={pending}
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold disabled:opacity-60"
        >
          Request changes
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Your name is self-reported and is not a verified signature. Only one response can be
        recorded for this version.
      </p>
    </form>
  );
}
