"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import type { GstRateOption } from "@/server/modules/catalog/queries";
import type {
  CatalogActionState,
  CatalogField,
  CatalogKind,
} from "@/server/modules/catalog/validation";

type Props = {
  action: (state: CatalogActionState, formData: FormData) => Promise<CatalogActionState>;
  initial?: Partial<Record<CatalogField, string>>;
  rates: GstRateOption[];
  submitLabel: string;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

const unitSuggestions = [
  "nos",
  "kg",
  "g",
  "litre",
  "meter",
  "hour",
  "day",
  "month",
  "service",
  "box",
  "piece",
];

export function CatalogForm({ action, initial, rates, submitLabel }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [state, formAction, pending] = useActionState(action, {
    values: initial as CatalogActionState["values"],
  });
  const { dismissField, fieldError, generalError } = useFieldErrors<CatalogField>(state);
  const initialCategory = initial?.gstCategory ?? "taxable";
  const [category, setCategory] = useState(initialCategory);
  const value = (key: CatalogField) => state.values?.[key] ?? initial?.[key] ?? "";

  return (
    <form action={formAction} className="mt-7 max-w-3xl" noValidate>
      {/* Wait for hydration before accepting edits to server-rendered defaults. */}
      <fieldset disabled={!ready} className="min-w-0 space-y-5">
        {generalError ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {generalError}
          </p>
        ) : null}

        <fieldset>
          <legend className="text-sm font-medium">
            Item type <span aria-hidden="true">*</span>
          </legend>
          <div className="mt-2 flex gap-6 text-sm">
            {(["product", "service"] as CatalogKind[]).map((kind) => (
              <label className="flex items-center gap-2" key={kind}>
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  defaultChecked={
                    value("kind") === kind || (!value("kind") && kind === "product")
                  }
                  onChange={() => dismissField("kind")}
                  required
                />
                {kind === "product" ? "Product" : "Service"}
              </label>
            ))}
          </div>
          {fieldError("kind") ? (
            <p className="mt-1 text-sm text-red-700">{fieldError("kind")}</p>
          ) : null}
        </fieldset>

        <Field
          label="Name"
          name="name"
          required
          error={fieldError("name")}
          onChange={() => dismissField("name")}
        >
          <input
            id="name"
            name="name"
            className={inputClass}
            defaultValue={value("name")}
            maxLength={200}
            required
          />
        </Field>
        <Field
          label="Description"
          name="description"
          error={fieldError("description")}
          onChange={() => dismissField("description")}
        >
          <textarea
            id="description"
            name="description"
            className={inputClass}
            rows={3}
            defaultValue={value("description")}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Unit label"
            name="unitLabel"
            error={fieldError("unitLabel")}
            onChange={() => dismissField("unitLabel")}
          >
            <input
              id="unitLabel"
              name="unitLabel"
              className={inputClass}
              list="unit-label-suggestions"
              placeholder="Choose a suggestion or enter your own"
              defaultValue={value("unitLabel")}
              maxLength={40}
            />
            <datalist id="unit-label-suggestions">
              {unitSuggestions.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Default unit price (₹)"
            name="defaultPrice"
            error={fieldError("defaultPrice")}
            onChange={() => dismissField("defaultPrice")}
          >
            <input
              id="defaultPrice"
              name="defaultPrice"
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder="e.g. 1250.00"
              defaultValue={value("defaultPrice")}
            />
            <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
              Optional. Enter up to two paise decimal places.
            </span>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="HSN / SAC"
            name="hsnSac"
            error={fieldError("hsnSac")}
            onChange={() => dismissField("hsnSac")}
          >
            <input
              id="hsnSac"
              name="hsnSac"
              className={inputClass}
              defaultValue={value("hsnSac")}
              maxLength={40}
            />
            <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
              Optional. Enter the code supplied for this item.
            </span>
          </Field>
          <Field
            label="Default GST category"
            name="gstCategory"
            required
            error={fieldError("gstCategory")}
            onChange={() => dismissField("gstCategory")}
          >
            <select
              id="gstCategory"
              name="gstCategory"
              className={inputClass}
              defaultValue={value("gstCategory") || "taxable"}
              onChange={(event) => {
                setCategory(event.currentTarget.value);
                dismissField("gstCategory");
                dismissField("gstRate");
              }}
              required
            >
              <option value="taxable">Taxable</option>
              <option value="exempt">Exempt</option>
              <option value="no_gst">No GST</option>
            </select>
          </Field>
        </div>

        {category === "taxable" ? (
          <Field
            label="Default GST rate"
            name="gstRate"
            required
            error={fieldError("gstRate")}
            onChange={() => dismissField("gstRate")}
          >
            <select
              id="gstRate"
              name="gstRate"
              className={inputClass}
              defaultValue={value("gstRate")}
              required
            >
              {rates.length === 0 ? (
                <option value="" disabled>
                  No GST rates configured
                </option>
              ) : (
                <option value="">Select a configured rate</option>
              )}
              {initial?.gstRate && !rates.some((rate) => rate.rate === initial.gstRate) ? (
                <option value={initial.gstRate}>
                  {initial.gstRate}% (retired; keep current default)
                </option>
              ) : null}
              {rates.map(({ rate }) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
            {rates.length === 0 ? (
              <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                No GST rates are configured yet. Ask your workspace operator to configure
                the approved options, or choose Exempt / No GST if that is the correct
                classification.
              </span>
            ) : null}
          </Field>
        ) : (
          <input type="hidden" name="gstRate" value="" />
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={pending}
          >
            {pending ? "Saving item…" : submitLabel}
          </button>
          <Link
            href="/catalog"
            className="rounded-xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-medium hover:bg-[var(--paper)]"
          >
            Cancel
          </Link>
        </div>
      </fieldset>
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
