"use client";

import { BadgeCheck, Building2, CreditCard, Settings2 } from "lucide-react";
import { useActionState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { Button } from "@/components/ui/button";
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
  "mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";

function SectionHeading({
  step,
  icon,
  title,
  description,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white">
        {step}
      </span>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2f2eb] text-[var(--brand)]">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-[var(--muted-foreground)] sm:text-sm">
          {description}
        </p>
      </div>
    </div>
  );
}

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
          <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
            {options.hint}
          </span>
        ) : null}
        {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
      </label>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
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
      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <SectionHeading
          step="1"
          icon={<Building2 aria-hidden="true" className="size-5" />}
          title="Business information"
          description="These details can appear on your quotations, invoices, and other documents."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
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
          <div className="sm:col-span-2">
            {input("postalAddress", "Business address", { rows: 3 })}
          </div>
          <p className="text-xs text-[var(--muted-foreground)] sm:col-span-2">
            Country: India · Currency: INR (₹). These values are fixed for this prototype.
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <SectionHeading
          step="2"
          icon={<BadgeCheck aria-hidden="true" className="size-5" />}
          title="GST registration"
          description="Your GST declaration and number are used for tax calculations and documents."
        />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
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
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs leading-5 text-blue-900 sm:text-sm">
            If you are not GST registered, choose “Not GST registered.” You can still create
            quotations and invoices; GST will not be applied.
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <SectionHeading
          step="3"
          icon={<Settings2 aria-hidden="true" className="size-5" />}
          title="Document defaults"
          description="Defaults are available when preparing new quotations and invoices."
        />
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            {input("timeZone", "Document time zone", {
              required: true,
              hint: "Use an IANA time zone, such as Asia/Kolkata.",
            })}
            {input("defaultTerms", "Default terms", { rows: 3 })}
          </div>
          <div className="border-t border-[var(--line)] pt-4">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard aria-hidden="true" className="size-4 text-[var(--brand)]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">Payment details</h3>
            </div>
            <p className="mb-4 text-xs leading-5 text-[var(--muted-foreground)]">
              Optional bank and UPI details can be included when you prepare a document.
              Updating these defaults does not change documents already issued or shared.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              {input("bankName", "Bank name")}
              {input("bankAccountName", "Account holder name")}
              {input("bankAccountNumber", "Bank account number")}
              {input("bankIfsc", "IFSC")}
              {input("upiId", "UPI ID")}
              {input("paymentInstructions", "Payment instructions", { rows: 3 })}
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          Changes apply to future document drafts. Existing documents keep their saved
          details.
        </p>
        <Button className="w-full sm:w-auto" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
