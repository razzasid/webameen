"use client";

import { useActionState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { indianStates } from "@/server/modules/business/states";
import type {
  BusinessSetupActionState,
  BusinessSetupField,
} from "@/server/modules/business/validation";

type Props = {
  action: (
    state: BusinessSetupActionState,
    formData: FormData,
  ) => Promise<BusinessSetupActionState>;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

export function BusinessSetupForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const { dismissField, fieldError, generalError } =
    useFieldErrors<BusinessSetupField>(state);

  return (
    <form action={formAction} className="business-setup-form mt-7 space-y-5" noValidate>
      {generalError ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {generalError}
        </p>
      ) : null}
      {fieldError("gstin") ? (
        <p
          className="business-gstin-field rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {fieldError("gstin")}
        </p>
      ) : null}

      <label className="block text-sm font-medium">
        Business name <span aria-hidden="true">*</span>
        <input
          className={inputClass}
          name="displayName"
          autoComplete="organization"
          defaultValue={state.values?.displayName}
          aria-invalid={Boolean(fieldError("displayName"))}
          onChange={() => dismissField("displayName")}
          required
        />
        {fieldError("displayName") ? (
          <span className="mt-1 block text-red-700">{fieldError("displayName")}</span>
        ) : null}
      </label>
      <label className="block text-sm font-medium">
        Contact email <span aria-hidden="true">*</span>
        <input
          className={inputClass}
          name="contactEmail"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.contactEmail}
          aria-invalid={Boolean(fieldError("contactEmail"))}
          onChange={() => dismissField("contactEmail")}
          required
        />
        {fieldError("contactEmail") ? (
          <span className="mt-1 block text-red-700">{fieldError("contactEmail")}</span>
        ) : null}
      </label>
      <label className="block text-sm font-medium">
        Contact phone <span aria-hidden="true">*</span>
        <input
          className={inputClass}
          name="contactPhone"
          type="tel"
          autoComplete="tel"
          defaultValue={state.values?.contactPhone}
          aria-invalid={Boolean(fieldError("contactPhone"))}
          onChange={() => dismissField("contactPhone")}
          required
        />
        {fieldError("contactPhone") ? (
          <span className="mt-1 block text-red-700">{fieldError("contactPhone")}</span>
        ) : null}
      </label>
      <label className="block text-sm font-medium">
        Business address <span aria-hidden="true">*</span>
        <textarea
          className={inputClass}
          name="postalAddress"
          rows={3}
          defaultValue={state.values?.postalAddress}
          aria-invalid={Boolean(fieldError("postalAddress"))}
          onChange={() => dismissField("postalAddress")}
          required
        />
        {fieldError("postalAddress") ? (
          <span className="mt-1 block text-red-700">{fieldError("postalAddress")}</span>
        ) : null}
      </label>
      <label className="block text-sm font-medium">
        State or territory <span aria-hidden="true">*</span>
        <select
          className={inputClass}
          key={state.values?.stateCode ?? ""}
          name="stateCode"
          defaultValue={state.values?.stateCode ?? ""}
          aria-invalid={Boolean(fieldError("stateCode"))}
          onChange={() => dismissField("stateCode")}
          required
        >
          <option value="">Select a state or territory</option>
          {indianStates.map(([code, label]) => (
            <option key={code} value={code}>
              {label} ({code})
            </option>
          ))}
        </select>
        {fieldError("stateCode") ? (
          <span className="mt-1 block text-red-700">{fieldError("stateCode")}</span>
        ) : null}
      </label>

      <fieldset>
        <legend className="text-sm font-medium">
          GST registered? <span aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input
              name="gstRegistered"
              type="radio"
              value="yes"
              defaultChecked={state.values?.gstRegistered === "yes"}
              onChange={() => dismissField("gstRegistered")}
            />{" "}
            Yes
          </label>
          <label className="flex items-center gap-2">
            <input
              name="gstRegistered"
              type="radio"
              value="no"
              defaultChecked={state.values?.gstRegistered === "no"}
              onChange={() => dismissField("gstRegistered")}
            />{" "}
            No
          </label>
        </div>
        {fieldError("gstRegistered") ? (
          <span className="mt-1 block text-sm text-red-700">
            {fieldError("gstRegistered")}
          </span>
        ) : null}
      </fieldset>

      <div className="business-gstin-field">
        <label className="block text-sm font-medium">
          GSTIN <span aria-hidden="true">*</span>
          <input
            className={inputClass}
            name="gstin"
            defaultValue={state.values?.gstin}
            aria-invalid={Boolean(fieldError("gstin"))}
            onChange={() => dismissField("gstin")}
            autoCapitalize="characters"
            maxLength={15}
            required
          />
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
            Basic format check only. We do not verify GST registration online.
          </span>
        </label>
      </div>
      <p className="text-xs text-[var(--muted)]">Country: India · Currency: INR (₹)</p>
      <button
        className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Creating business…" : "Create business"}
      </button>
    </form>
  );
}
