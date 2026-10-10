"use client";

import { useActionState, useState } from "react";
import {
  type ReversePaymentActionState,
  reverseInvoicePaymentAction,
} from "@/server/modules/payments/actions";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

export function ReversePaymentForm({
  invoiceId,
  paymentId,
}: {
  invoiceId: string;
  paymentId: string;
}) {
  const action = reverseInvoicePaymentAction.bind(null, invoiceId, paymentId);
  const [state, formAction, pending] = useActionState<ReversePaymentActionState, FormData>(
    action,
    {},
  );
  const [reason, setReason] = useState("");

  return (
    <form
      action={formAction}
      noValidate
      onReset={(event) => event.preventDefault()}
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <label className="block text-sm font-medium" htmlFor={`reversal-reason-${paymentId}`}>
        Correction reason
        <textarea
          id={`reversal-reason-${paymentId}`}
          className={inputClass}
          name="reason"
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(state.fieldError)}
          aria-describedby={state.fieldError ? `reversal-error-${paymentId}` : undefined}
        />
      </label>
      {state.fieldError ? (
        <p
          id={`reversal-error-${paymentId}`}
          role="alert"
          className="mt-1 text-sm text-red-700"
        >
          {state.fieldError}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
      >
        {pending ? "Reversing…" : "Reverse payment"}
      </button>
    </form>
  );
}
