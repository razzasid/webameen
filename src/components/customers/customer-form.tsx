"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { indianStates } from "@/server/modules/business/states";
import type {
  CustomerActionState,
  CustomerField,
} from "@/server/modules/customers/validation";

type Props = {
  action: (state: CustomerActionState, formData: FormData) => Promise<CustomerActionState>;
  initial?: Partial<Record<CustomerField, string>>;
  submitLabel: string;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

export function CustomerForm({ action, initial, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    values: initial as CustomerActionState["values"],
  });
  const { dismissField, fieldError, generalError } = useFieldErrors<CustomerField>(state);
  const value = (key: CustomerField) => state.values?.[key] ?? initial?.[key] ?? "";

  return (
    <form action={formAction} className="mt-7 max-w-3xl space-y-5" noValidate>
      {generalError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {generalError}
        </p>
      ) : null}
      <Field
        label="Customer name"
        name="displayName"
        required
        error={fieldError("displayName")}
        onChange={() => dismissField("displayName")}
      >
        <input
          id="displayName"
          className={inputClass}
          name="displayName"
          defaultValue={value("displayName")}
          autoComplete="organization"
          required
        />
      </Field>
      <Field
        label="Contact name"
        name="contactName"
        error={fieldError("contactName")}
        onChange={() => dismissField("contactName")}
      >
        <input
          id="contactName"
          className={inputClass}
          name="contactName"
          defaultValue={value("contactName")}
          autoComplete="name"
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Email"
          name="email"
          error={fieldError("email")}
          onChange={() => dismissField("email")}
        >
          <input
            id="email"
            className={inputClass}
            name="email"
            type="email"
            defaultValue={value("email")}
            autoComplete="email"
          />
        </Field>
        <Field
          label="Phone"
          name="phone"
          error={fieldError("phone")}
          onChange={() => dismissField("phone")}
        >
          <input
            id="phone"
            className={inputClass}
            name="phone"
            type="tel"
            defaultValue={value("phone")}
            autoComplete="tel"
          />
        </Field>
      </div>
      <Field
        label="Address"
        name="billingAddress"
        error={fieldError("billingAddress")}
        onChange={() => dismissField("billingAddress")}
      >
        <textarea
          id="billingAddress"
          className={inputClass}
          name="billingAddress"
          rows={3}
          defaultValue={value("billingAddress")}
        />
      </Field>
      <Field
        label="State or territory"
        name="stateCode"
        required
        error={fieldError("stateCode")}
        onChange={() => dismissField("stateCode")}
      >
        <select
          id="stateCode"
          className={inputClass}
          name="stateCode"
          defaultValue={value("stateCode")}
          required
        >
          <option value="">Select a state or territory</option>
          {indianStates.map(([code, label]) => (
            <option key={code} value={code}>
              {label} ({code})
            </option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend className="text-sm font-medium">
          GSTIN applicable? <span aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 flex gap-6 text-sm">
          {[
            ["yes", "Yes"],
            ["no", "No"],
          ].map(([answer, label]) => (
            <label className="flex items-center gap-2" key={answer}>
              <input
                type="radio"
                name="gstinApplicable"
                value={answer}
                defaultChecked={
                  value("gstinApplicable") === answer ||
                  (!value("gstinApplicable") && answer === "no")
                }
                onChange={() => dismissField("gstinApplicable")}
                required
              />{" "}
              {label}
            </label>
          ))}
        </div>
        {fieldError("gstinApplicable") ? (
          <p className="mt-1 text-sm text-red-700">{fieldError("gstinApplicable")}</p>
        ) : null}
      </fieldset>
      <div className="customer-gstin-field">
        <Field
          label="GSTIN"
          name="gstin"
          error={fieldError("gstin")}
          onChange={() => dismissField("gstin")}
        >
          <input
            id="gstin"
            className={inputClass}
            name="gstin"
            defaultValue={value("gstin")}
            autoCapitalize="characters"
            maxLength={15}
          />
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
            Basic format check only; no online verification.
          </span>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving customer…" : submitLabel}
        </button>
        <Link
          href="/customers"
          className="rounded-xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-medium hover:bg-[var(--paper)]"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  error,
  onChange,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium" htmlFor={name}>
      {label} {required ? <span aria-hidden="true">*</span> : null}
      <span onChange={onChange} className="block">
        {children}
      </span>
      {error ? (
        <span className="mt-1 block text-sm font-normal text-red-700">{error}</span>
      ) : null}
    </label>
  );
}
