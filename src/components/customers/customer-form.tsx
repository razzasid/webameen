"use client";

import { Building2, FileText, Mail, MapPin, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
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
  variant?: "default" | "create" | "edit";
};

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

export function CustomerForm({ action, initial, submitLabel, variant = "default" }: Props) {
  const isEdit = variant === "edit";
  const hasPreview = variant !== "default";
  const [state, formAction, pending] = useActionState(action, {
    values: initial as CustomerActionState["values"],
  });
  const [values, setValues] = useState<Record<CustomerField, string>>(() => ({
    displayName: initial?.displayName ?? "",
    contactName: initial?.contactName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    billingAddress: initial?.billingAddress ?? "",
    stateCode: initial?.stateCode ?? "",
    gstinApplicable: initial?.gstinApplicable ?? "no",
    gstin: initial?.gstin ?? "",
  }));
  const { dismissField, fieldError, generalError } = useFieldErrors<CustomerField>(state);
  const setValue = (key: CustomerField, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const previewRows = [
    { label: "Contact name", value: values.contactName, icon: UserRound },
    { label: "Email", value: values.email, icon: Mail },
    { label: "Phone", value: values.phone, icon: Phone },
    { label: "Address", value: values.billingAddress, icon: MapPin },
    {
      label: "State or territory",
      value: (() => {
        const selectedState = indianStates.find(([code]) => code === values.stateCode);
        return selectedState ? `${selectedState[1]} (${selectedState[0]})` : "—";
      })(),
      icon: Building2,
    },
    {
      label: "GSTIN applicable",
      value: values.gstinApplicable === "yes" ? "Yes" : "No",
      icon: FileText,
    },
  ];

  return (
    <div
      className={
        hasPreview
          ? "grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]"
          : ""
      }
    >
      <form
        action={formAction}
        onReset={(event) => {
          // Returning validation errors still completes a React form action and
          // requests a native reset. Keep the draft; successful saves redirect.
          event.preventDefault();
        }}
        className={
          hasPreview
            ? "min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm"
            : "max-w-3xl"
        }
        noValidate
      >
        {hasPreview ? (
          <div className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-5 sm:px-6">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
              <UserRound aria-hidden="true" className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold text-[var(--ink)]">Customer information</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {isEdit
                  ? "Edit the customer details below."
                  : "Enter the customer details below."}
              </p>
            </div>
          </div>
        ) : null}
        <div className={hasPreview ? "space-y-5 p-4 sm:p-6" : "mt-7 max-w-3xl space-y-5"}>
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
              value={values.displayName}
              onChange={(event) => setValue("displayName", event.target.value)}
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
              value={values.contactName}
              onChange={(event) => setValue("contactName", event.target.value)}
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
                value={values.email}
                onChange={(event) => setValue("email", event.target.value)}
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
                value={values.phone}
                onChange={(event) => setValue("phone", event.target.value)}
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
              value={values.billingAddress}
              onChange={(event) => setValue("billingAddress", event.target.value)}
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
              value={values.stateCode}
              onChange={(event) => setValue("stateCode", event.target.value)}
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
                <label className="inline-flex min-h-11 items-center gap-2" key={answer}>
                  <input
                    type="radio"
                    className="size-5 accent-[var(--brand)]"
                    name="gstinApplicable"
                    value={answer}
                    checked={values.gstinApplicable === answer}
                    onChange={() => {
                      setValue("gstinApplicable", answer);
                      dismissField("gstinApplicable");
                    }}
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
                value={values.gstin}
                onChange={(event) => setValue("gstin", event.target.value)}
                autoCapitalize="characters"
                maxLength={15}
              />
              <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
                Basic format check only; no online verification.
              </span>
            </Field>
          </div>
          {!hasPreview ? (
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
          ) : null}
        </div>
        {hasPreview ? (
          <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--paper)]/60 px-4 py-4 sm:flex-row sm:px-6">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              type="submit"
              disabled={pending}
            >
              {pending ? "Saving customer…" : submitLabel}
            </button>
            <Link
              href="/customers"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Cancel
            </Link>
          </div>
        ) : null}
      </form>
      {hasPreview ? (
        <aside className="h-fit min-w-0 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-4 border-b border-[var(--line)] pb-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
              <Building2 aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-[var(--ink)]">Customer details</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {isEdit
                  ? "Current information for this customer."
                  : "Preview updates as you add details."}
              </p>
            </div>
          </div>
          <dl className="divide-y divide-[var(--line)]">
            {previewRows.map(({ label, value, icon: Icon }) => (
              <div className="flex min-w-0 items-start gap-3 py-3.5" key={label}>
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-[var(--brand)]"
                />
                <div className="min-w-0">
                  <dt className="text-sm text-[var(--muted-foreground)]">{label}</dt>
                  <dd className="mt-1 break-words whitespace-pre-line text-sm font-medium text-[var(--ink)]">
                    {value || "—"}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </aside>
      ) : null}
    </div>
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
