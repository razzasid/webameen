"use client";

import { Box, FileText, IndianRupee, Lightbulb, PackageCheck, Wrench } from "lucide-react";
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
  variant?: "create" | "edit";
};

type CatalogValues = Record<CatalogField, string>;

const inputClass =
  "mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none transition focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

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

const tips = [
  "Use a clear, specific item name.",
  "Add a short description to help identify the item.",
  "Enter the HSN or SAC code when you have it.",
  "Choose the GST category and rate that apply.",
];

function initialCatalogValues(
  initial?: Partial<Record<CatalogField, string>>,
): CatalogValues {
  return {
    kind: initial?.kind ?? "product",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    unitLabel: initial?.unitLabel ?? "",
    defaultPrice: initial?.defaultPrice ?? "",
    gstCategory: initial?.gstCategory ?? "taxable",
    gstRate: initial?.gstRate ?? "",
    hsnSac: initial?.hsnSac ?? "",
  };
}

function previewPrice(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return `₹${normalized}`;
  const rupees = BigInt(match[1]).toLocaleString("en-IN");
  const paise = (match[2] ?? "").padEnd(2, "0");
  return `₹${rupees}.${paise}`;
}

export function CatalogForm({
  action,
  initial,
  rates,
  submitLabel,
  variant = "create",
}: Props) {
  const isEdit = variant === "edit";
  const initialValues = initialCatalogValues(initial);
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
  });
  const [values, setValues] = useState<CatalogValues>(initialValues);
  const { dismissField, fieldError, generalError } = useFieldErrors<CatalogField>(state);

  useEffect(() => {
    if (state.values) {
      setValues((current) => ({ ...current, ...state.values }));
    }
  }, [state.values]);

  const setValue = (key: CatalogField, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };
  const category = values.gstCategory || "taxable";
  const taxable = category === "taxable";
  const kind = values.kind === "service" ? "service" : "product";
  const ItemIcon = kind === "product" ? Box : Wrench;
  const price = previewPrice(values.defaultPrice);
  const gstCategoryLabel =
    category === "exempt" ? "Exempt" : category === "no_gst" ? "No GST" : "Taxable";

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,0.85fr)]">
      <form
        action={formAction}
        onReset={(event) => event.preventDefault()}
        className="min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgb(15_45_36/4%)]"
        noValidate
      >
        <fieldset className="min-w-0">
          <div className="space-y-7 p-4 sm:p-6">
            {generalError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {generalError}
              </p>
            ) : null}

            <FormSection
              icon={ItemIcon}
              title="Basic information"
              description="Enter the essential details about this item."
            >
              <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
                <fieldset className="min-w-0">
                  <legend className="text-sm font-medium text-[var(--ink)]">
                    Item type <Required />
                  </legend>
                  <div className="mt-2 flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2">
                    {(["product", "service"] as CatalogKind[]).map((option) => (
                      <label
                        className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                        key={option}
                      >
                        <input
                          type="radio"
                          className="size-4 accent-[var(--brand)]"
                          name="kind"
                          value={option}
                          checked={kind === option}
                          onChange={() => {
                            setValue("kind", option);
                            dismissField("kind");
                          }}
                          required
                        />
                        {option === "product" ? "Product" : "Service"}
                      </label>
                    ))}
                  </div>
                  {fieldError("kind") ? <ErrorText>{fieldError("kind")}</ErrorText> : null}
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
                    placeholder="e.g. Desk Lamp"
                    value={values.name}
                    onChange={(event) => setValue("name", event.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    required
                  />
                </Field>
              </div>

              <Field
                label="Description"
                name="description"
                error={fieldError("description")}
                onChange={() => dismissField("description")}
              >
                <textarea
                  id="description"
                  name="description"
                  className={`${inputClass} min-h-24 resize-y`}
                  rows={3}
                  placeholder="Describe the product or service..."
                  value={values.description}
                  onChange={(event) => setValue("description", event.target.value)}
                />
                <span className="mt-1 block text-right text-xs font-normal text-[var(--muted-foreground)]">
                  {values.description.length} characters
                </span>
              </Field>
            </FormSection>

            <FormSection
              icon={IndianRupee}
              title="Pricing & unit"
              description="Set the default price and unit for this item."
            >
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
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
                    placeholder="e.g. piece, hour, visit"
                    value={values.unitLabel}
                    onChange={(event) => setValue("unitLabel", event.target.value)}
                    maxLength={40}
                  />
                  <datalist id="unit-label-suggestions">
                    {unitSuggestions.map((unit) => (
                      <option key={unit} value={unit} />
                    ))}
                  </datalist>
                  <HelperText>Choose a suggestion or enter your own.</HelperText>
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
                    value={values.defaultPrice}
                    onChange={(event) => setValue("defaultPrice", event.target.value)}
                  />
                  <HelperText>Optional. Enter up to two decimal places.</HelperText>
                </Field>
              </div>
            </FormSection>

            <FormSection
              icon={FileText}
              title="Tax & codes"
              description="Configure tax settings and item codes."
            >
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
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
                    placeholder="e.g. 940520"
                    value={values.hsnSac}
                    onChange={(event) => setValue("hsnSac", event.target.value)}
                    maxLength={40}
                  />
                  <HelperText>Optional. Use the code supplied for this item.</HelperText>
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
                    value={category}
                    onChange={(event) => {
                      setValue("gstCategory", event.currentTarget.value);
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

              {taxable ? (
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
                    value={values.gstRate}
                    onChange={(event) => {
                      setValue("gstRate", event.currentTarget.value);
                      dismissField("gstRate");
                    }}
                    required
                  >
                    {rates.length === 0 ? (
                      <option value="" disabled>
                        No GST rates configured
                      </option>
                    ) : (
                      <option value="">Select a configured rate</option>
                    )}
                    {initial?.gstRate &&
                    !rates.some((rate) => rate.rate === initial.gstRate) ? (
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
                    <HelperText>
                      No GST rates are configured yet. Ask your workspace operator to
                      configure the approved options, or choose Exempt / No GST if that is
                      the correct classification.
                    </HelperText>
                  ) : null}
                </Field>
              ) : (
                <input type="hidden" name="gstRate" value="" />
              )}
            </FormSection>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] bg-[var(--paper)]/55 px-4 py-4 sm:flex-row sm:px-6">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              type="submit"
              disabled={pending}
            >
              {pending ? "Saving item…" : submitLabel}
            </button>
            <Link
              href="/catalog"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-5 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Cancel
            </Link>
          </div>
        </fieldset>
      </form>

      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
        <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_1px_2px_rgb(15_45_36/4%)] sm:p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-[var(--ink)]">Item preview</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {isEdit
                ? "Preview updates as you edit this item."
                : "See how this item will appear in lists and invoices."}
            </p>
          </div>
          <div className="rounded-xl border border-[#e0eee8] bg-[linear-gradient(145deg,#f2faf6,#eaf6f1)] p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#def2e9] text-[var(--brand)]">
                <ItemIcon aria-hidden="true" className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex min-h-7 items-center rounded-full bg-[#d8f1e6] px-3 text-xs font-semibold capitalize text-[#176b52]">
                  {kind}
                </span>
                <h3 className="mt-2 break-words text-lg font-bold leading-6 text-[var(--ink)]">
                  {values.name.trim() || "Your item name"}
                </h3>
                <p className="mt-1 min-h-5 break-words text-sm leading-5 text-[var(--muted-foreground)]">
                  {values.description.trim() ||
                    "Add a description to show more about this item."}
                </p>
                <div className="mt-4 border-t border-[#d5e6de] pt-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-bold tabular-nums text-[var(--ink)]">
                      {price || "Price not set"}
                    </span>
                    {values.unitLabel.trim() ? (
                      <span className="text-sm text-[var(--muted-foreground)]">
                        / {values.unitLabel.trim()}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex min-h-7 items-center rounded-full bg-white/80 px-2.5 text-xs font-medium text-[var(--muted-foreground)] ring-1 ring-[#d8e6df]">
                      {gstCategoryLabel}
                      {taxable && values.gstRate ? ` · ${values.gstRate}%` : ""}
                    </span>
                    {values.hsnSac.trim() ? (
                      <span className="inline-flex min-h-7 max-w-full items-center break-all rounded-full bg-white/80 px-2.5 text-xs font-medium text-[var(--muted-foreground)] ring-1 ring-[#d8e6df]">
                        HSN / SAC {values.hsnSac.trim()}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-[#e5e9ef] bg-[#f6f8fb] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff1cf] text-[#9a5a00]">
              <Lightbulb aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-[var(--ink)]">Tips</h2>
              <ul className="mt-2 space-y-2 text-sm leading-5 text-[var(--muted-foreground)]">
                {tips.map((tip) => (
                  <li className="flex gap-2" key={tip}>
                    <span aria-hidden="true" className="shrink-0 text-[var(--brand)]">
                      ›
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-start gap-2 border-t border-[#e0e6ed] pt-3 text-xs leading-5 text-[var(--muted-foreground)]">
                <PackageCheck
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[var(--brand)]"
                />
                {isEdit
                  ? "Changes here will be used for future documents."
                  : "You can update these details later from the item page."}
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Box;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-[var(--ink)]">{title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-[var(--muted-foreground)]">
            {description}
          </p>
        </div>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
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
    <label className="block min-w-0 text-sm font-medium text-[var(--ink)]" htmlFor={name}>
      {label} {required ? <Required /> : null}
      <span onChange={onChange} className="block">
        {children}
      </span>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </label>
  );
}

function Required() {
  return (
    <span aria-hidden="true" className="text-red-600">
      *
    </span>
  );
}

function ErrorText({ children }: { children?: React.ReactNode }) {
  return <span className="mt-1 block text-sm font-normal text-red-700">{children}</span>;
}

function HelperText({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 block text-xs font-normal leading-5 text-[var(--muted-foreground)]">
      {children}
    </span>
  );
}
