"use client";

import { useActionState, useState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { recordInvoicePaymentAction } from "@/server/modules/payments/actions";
import type {
  PaymentActionState,
  PaymentFormValues,
} from "@/server/modules/payments/validation";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

type Props = {
  invoiceId: string;
  requestKey: string;
  initialAmount: string;
  receivedAt: string;
  replacesPaymentId?: string;
  heading?: string;
};

export function PaymentEntryForm({
  invoiceId,
  requestKey,
  initialAmount,
  receivedAt,
  replacesPaymentId = "",
  heading = "Record payment",
}: Props) {
  const action = recordInvoicePaymentAction.bind(null, invoiceId);
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(
    action,
    {},
  );
  const [values, setValues] = useState<PaymentFormValues>({
    requestKey,
    amount: initialAmount,
    receivedAt,
    method: "",
    externalReference: "",
    replacesPaymentId,
  });
  const { dismissField, fieldError, generalError } = useFieldErrors(state);
  const update = (key: keyof PaymentFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    dismissField(key);
  };

  return (
    <form
      action={formAction}
      noValidate
      onReset={(event) => event.preventDefault()}
      className="space-y-4"
    >
      <h3 className="font-semibold">{heading}</h3>
      {generalError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {generalError}
        </p>
      ) : null}
      <input type="hidden" name="requestKey" value={values.requestKey} />
      <input type="hidden" name="replacesPaymentId" value={values.replacesPaymentId} />
      <label className="block text-sm font-medium" htmlFor={`payment-amount-${requestKey}`}>
        Amount received (₹)
        <input
          id={`payment-amount-${requestKey}`}
          className={inputClass}
          name="amount"
          inputMode="decimal"
          value={values.amount}
          onChange={(event) => update("amount", event.target.value)}
          aria-invalid={Boolean(fieldError("amount"))}
          aria-describedby={
            fieldError("amount") ? `payment-amount-error-${requestKey}` : undefined
          }
        />
        {fieldError("amount") ? (
          <span
            className="mt-1 block text-sm text-red-700"
            id={`payment-amount-error-${requestKey}`}
            role="alert"
          >
            {fieldError("amount")}
          </span>
        ) : null}
      </label>
      <label className="block text-sm font-medium" htmlFor={`payment-time-${requestKey}`}>
        Date and time received
        <input
          id={`payment-time-${requestKey}`}
          className={inputClass}
          name="receivedAt"
          type="datetime-local"
          step="0.001"
          value={values.receivedAt}
          onChange={(event) => update("receivedAt", event.target.value)}
          aria-invalid={Boolean(fieldError("receivedAt"))}
          aria-describedby={
            fieldError("receivedAt") ? `payment-time-error-${requestKey}` : undefined
          }
        />
        {fieldError("receivedAt") ? (
          <span
            className="mt-1 block text-sm text-red-700"
            id={`payment-time-error-${requestKey}`}
            role="alert"
          >
            {fieldError("receivedAt")}
          </span>
        ) : null}
      </label>
      <label className="block text-sm font-medium" htmlFor={`payment-method-${requestKey}`}>
        Payment method
        <input
          id={`payment-method-${requestKey}`}
          className={inputClass}
          name="method"
          list={`payment-method-options-${requestKey}`}
          maxLength={80}
          value={values.method}
          onChange={(event) => update("method", event.target.value)}
          aria-invalid={Boolean(fieldError("method"))}
          aria-describedby={
            fieldError("method") ? `payment-method-error-${requestKey}` : undefined
          }
        />
        <datalist id={`payment-method-options-${requestKey}`}>
          <option value="Cash" />
          <option value="UPI" />
          <option value="Bank transfer" />
          <option value="Card" />
          <option value="Cheque" />
        </datalist>
        {fieldError("method") ? (
          <span
            className="mt-1 block text-sm text-red-700"
            id={`payment-method-error-${requestKey}`}
            role="alert"
          >
            {fieldError("method")}
          </span>
        ) : null}
      </label>
      <label
        className="block text-sm font-medium"
        htmlFor={`payment-reference-${requestKey}`}
      >
        Reference <span className="font-normal text-[var(--muted)]">(optional)</span>
        <input
          id={`payment-reference-${requestKey}`}
          className={inputClass}
          name="externalReference"
          maxLength={200}
          value={values.externalReference}
          onChange={(event) => update("externalReference", event.target.value)}
          aria-invalid={Boolean(fieldError("externalReference"))}
          aria-describedby={
            fieldError("externalReference")
              ? `payment-reference-error-${requestKey}`
              : undefined
          }
        />
        {fieldError("externalReference") ? (
          <span
            className="mt-1 block text-sm text-red-700"
            id={`payment-reference-error-${requestKey}`}
            role="alert"
          >
            {fieldError("externalReference")}
          </span>
        ) : null}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving payment…" : heading}
      </button>
    </form>
  );
}
