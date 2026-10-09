"use client";

import { useActionState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import type {
  BusinessSettingsActionState,
  BusinessSettingsField,
  BusinessSettingsValues,
} from "@/server/modules/business/settings-validation";
import { indianStates } from "@/server/modules/business/states";

type Props = {
  initialValues: BusinessSettingsValues;
  action: (
    state: BusinessSettingsActionState,
    formData: FormData,
  ) => Promise<BusinessSettingsActionState>;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

export function BusinessSettingsForm({ initialValues, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const { dismissField, fieldError, generalError } =
    useFieldErrors<BusinessSettingsField>(state);

  function input(
    field: BusinessSettingsField,
    label: string,
    options: { type?: string; required?: boolean; rows?: number; hint?: string } = {},
  ) {
    const error = fieldError(field);
    return (
      <label
        className="block text-sm font-medium"
        htmlFor={`business-${field}`}
        key={field}
      >
        {label}
        {options.required ? <span aria-hidden="true"> *</span> : null}
        {options.rows ? (
          <textarea
            id={`business-${field}`}
            className={inputClass}
            name={field}
            rows={options.rows}
            defaultValue={values[field]}
            aria-invalid={Boolean(error)}
            onChange={() => dismissField(field)}
          />
        ) : (
          <input
            id={`business-${field}`}
            className={inputClass}
            name={field}
            type={options.type ?? "text"}
            defaultValue={values[field]}
            aria-invalid={Boolean(error)}
            onChange={() => dismissField(field)}
            required={options.required}
          />
        )}
        {options.hint ? (
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
            {options.hint}
          </span>
        ) : null}
        {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
      </label>
    );
  }

  return (
    <form action={formAction} className="mt-5 space-y-7" noValidate>
      {generalError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {generalError}
        </p>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"
        >
          Business settings saved.
        </p>
      ) : null}
      <div className="grid gap-5 md:grid-cols-2">
        {input("displayName", "Business name", { required: true })}
        {input("contactEmail", "Contact email", { type: "email" })}
        {input("contactPhone", "Contact phone", { type: "tel" })}
        <label className="block text-sm font-medium">
          State or territory
          <select
            className={inputClass}
            name="stateCode"
            defaultValue={values.stateCode}
            onChange={() => dismissField("stateCode")}
            aria-invalid={Boolean(fieldError("stateCode"))}
          >
            <option value="">Select a state or territory</option>
            {indianStates.map(([code, label]) => (
              <option key={code} value={code}>
                {label} ({code})
              </option>
            ))}
          </select>
          {fieldError("stateCode") ? (
            <span className="mt-1 block text-sm text-red-700">
              {fieldError("stateCode")}
            </span>
          ) : null}
        </label>
      </div>
      {input("postalAddress", "Business address", { rows: 3 })}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium">
          GST registration declaration
          <select
            className={inputClass}
            name="gstRegistered"
            defaultValue={values.gstRegistered}
            onChange={() => dismissField("gstRegistered")}
          >
            <option value="unset">Not selected</option>
            <option value="yes">GST registered</option>
            <option value="no">Not GST registered</option>
          </select>
        </label>
        {input("gstin", "GSTIN", {
          hint: "Required if GST registered. Basic format only; registration is not verified online.",
        })}
      </div>
      <p className="text-sm text-[var(--muted)]">
        Country: India · Currency: INR (₹). These values are fixed for this prototype.
      </p>
      <div className="border-t border-[var(--line)] pt-6">
        <h3 className="font-semibold">Future document defaults</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Optional payment details and terms are copied only when you explicitly select them
          in a future document. Changing settings will not change existing documents.
        </p>
        <div className="mt-5 space-y-5">
          {input("timeZone", "Document time zone", {
            required: true,
            hint: "Use an IANA time zone, such as Asia/Kolkata.",
          })}
          {input("defaultTerms", "Default terms", { rows: 3 })}
          <div className="grid gap-5 md:grid-cols-2">
            {input("bankName", "Bank name")}
            {input("bankAccountName", "Account holder name")}
            {input("bankAccountNumber", "Bank account number")}
            {input("bankIfsc", "IFSC")}
            {input("upiId", "UPI ID")}
          </div>
          {input("paymentInstructions", "Payment instructions", { rows: 3 })}
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
