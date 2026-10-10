"use client";

import { useActionState, useEffect, useState } from "react";
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
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";

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
    return (
      <label
        className="block text-sm font-medium"
        htmlFor={`invoice-period-${field}`}
        key={field}
      >
        {label}
        <input
          id={`invoice-period-${field}`}
          className={inputClass}
          name={field}
          type={type}
          value={values[field]}
          onChange={(event) => setValues({ ...values, [field]: event.target.value })}
          aria-invalid={Boolean(error)}
        />
        {hint ? (
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">{hint}</span>
        ) : null}
        {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
      </label>
    );
  }

  return (
    <div className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
      <h2 className="text-lg font-semibold">Invoice numbering periods</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Set the exact dates and number format your business uses. The end date is excluded.
        Use <code>{"{prefix}"}</code>, <code>{"{period}"}</code> and exactly one{" "}
        <code>{"{number}"}</code>. No dates or statutory format are chosen for you.
      </p>
      {periods.length ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[var(--canvas)] text-xs text-[var(--muted)]">
              <tr>
                <th className="p-3">Period</th>
                <th>Dates</th>
                <th>Format</th>
                <th>Next number</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr className="border-t border-[var(--line)]" key={period.period_key}>
                  <td className="p-3 font-medium">{period.period_key}</td>
                  <td>
                    {period.starts_on} to {period.ends_before} (end excluded)
                  </td>
                  <td>{period.format_template}</td>
                  <td>{period.last_issued_number ?? period.starting_number}</td>
                  <td>
                    {period.last_issued_number === null
                      ? "Unused; editable"
                      : "In use; locked"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-[var(--canvas)] p-4 text-sm">
          No numbering periods configured.
        </p>
      )}
      <form action={formAction} className="mt-6 space-y-4" noValidate>
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
        <div className="grid gap-4 md:grid-cols-2">
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
        <p className="text-xs text-[var(--muted)]">
          Submit an existing period name to change its settings while it is unused. Once an
          invoice uses a period, its date range and format are fixed.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save numbering period"}
        </button>
      </form>
    </div>
  );
}
