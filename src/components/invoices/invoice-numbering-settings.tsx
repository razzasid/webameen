"use client";

import { Hash, RefreshCw } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  InvoiceNumberPeriodActionState,
  InvoiceNumberPeriodValues,
} from "@/server/modules/invoices/actions";
import type { InvoiceNumberPeriod } from "@/server/modules/invoices/queries";

const emptyValues: InvoiceNumberPeriodValues = {
  periodKey: "",
  startsOn: "",
  endsBefore: "",
  prefix: "",
  formatTemplate: "{prefix}/{period}/{number}",
  minimumDigits: "4",
  startingNumber: "1",
};
const inputClass =
  "mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";

export function InvoiceNumberingSettings({
  periods,
  action,
}: {
  periods: InvoiceNumberPeriod[];
  action: (
    state: InvoiceNumberPeriodActionState,
    formData: FormData,
  ) => Promise<InvoiceNumberPeriodActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState(state.values ?? emptyValues);
  useEffect(() => {
    if (state.values) setValues(state.values);
  }, [state.values]);

  function input(
    field: keyof InvoiceNumberPeriodValues,
    label: string,
    type = "text",
    hint?: string,
  ) {
    const error = state.fieldErrors?.[field];
    const required = [
      "periodKey",
      "startsOn",
      "endsBefore",
      "formatTemplate",
      "minimumDigits",
      "startingNumber",
    ].includes(field);
    return (
      <label
        className="block text-sm font-medium"
        htmlFor={`invoice-period-${field}`}
        key={field}
      >
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        <input
          id={`invoice-period-${field}`}
          className={inputClass}
          name={field}
          type={type}
          value={values[field]}
          onChange={(event) => setValues({ ...values, [field]: event.target.value })}
          aria-invalid={Boolean(error)}
          required={required}
        />
        {hint ? (
          <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
            {hint}
          </span>
        ) : null}
        {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
      </label>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white">
          4
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2f2eb] text-[var(--brand)]">
          <Hash aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--ink)]">
            Invoice numbering periods
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--muted-foreground)] sm:text-sm">
            Set the exact dates and number format used when an approved quotation becomes an
            invoice.
          </p>
        </div>
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        {periods.length ? (
          <>
            <div className="hidden overflow-x-auto rounded-lg border border-[var(--line)] md:block">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-[#f8faf9] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="p-3 font-semibold">Period</th>
                    <th className="p-3 font-semibold">Dates</th>
                    <th className="p-3 font-semibold">Format</th>
                    <th className="p-3 font-semibold">Next number</th>
                    <th className="p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr className="border-t border-[var(--line)]" key={period.period_key}>
                      <td className="p-3 font-medium text-[var(--ink)]">
                        {period.period_key}
                      </td>
                      <td className="p-3 text-[var(--muted-foreground)]">
                        {period.starts_on} – {period.ends_before} (end excluded)
                      </td>
                      <td className="p-3 font-mono text-xs">{period.format_template}</td>
                      <td className="p-3 tabular-nums">
                        {period.last_issued_number ?? period.starting_number}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${period.last_issued_number === null ? "bg-[#e2f3eb] text-[#176b4c]" : "bg-[#eef1f0] text-[#53645d]"}`}
                        >
                          {period.last_issued_number === null
                            ? "Unused · editable"
                            : "In use · locked"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] md:hidden">
              {periods.map((period) => (
                <li className="space-y-2 p-4" key={period.period_key}>
                  <div className="flex items-start justify-between gap-2">
                    <strong className="break-words text-sm text-[var(--ink)]">
                      {period.period_key}
                    </strong>
                    <span className="shrink-0 rounded-full bg-[var(--canvas)] px-2 py-1 text-[11px] font-semibold text-[var(--muted-foreground)]">
                      {period.last_issued_number === null ? "Unused" : "Locked"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {period.starts_on} – {period.ends_before} (end excluded)
                  </p>
                  <p className="break-all font-mono text-xs">{period.format_template}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Next number: {period.last_issued_number ?? period.starting_number}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--paper)] p-4 text-sm text-[var(--muted-foreground)]">
            No numbering periods configured yet. Add the period dates and format your
            business uses.
          </p>
        )}
        <form
          action={formAction}
          className="space-y-4 rounded-xl border border-[#d5ece2] bg-[#f4faf7] p-4 sm:p-5"
          noValidate
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--brand)]">
              <RefreshCw aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                Add or edit numbering period
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                Use the period name your business chooses. The end date is excluded. Include{" "}
                <code>{"{number}"}</code> exactly once in the format.
              </p>
            </div>
          </div>
          {state.error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {state.error}
            </p>
          ) : null}
          {state.saved ? (
            <p
              role="status"
              className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"
            >
              Numbering period saved.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {input("periodKey", "Period name")}
            {input("prefix", "Prefix")}
            {input("startsOn", "Start date", "date")}
            {input("endsBefore", "End date (excluded)", "date")}
            {input(
              "formatTemplate",
              "Invoice number format",
              "text",
              "Example: {prefix}/{period}/{number}",
            )}
            {input("minimumDigits", "Minimum number digits", "number")}
            {input("startingNumber", "Starting number", "number")}
          </div>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">
            Submitting an existing period name updates it only while unused. Once an invoice
            uses a period, its dates and format are locked.
          </p>
          <Button disabled={pending} type="submit">
            {pending ? "Saving…" : "Save numbering period"}
          </Button>
        </form>
      </div>
    </section>
  );
}
