"use client";

import { useActionState, useState } from "react";
import type { BusinessProfile } from "@/server/modules/business/settings-validation";
import { indianStates } from "@/server/modules/business/states";
import { gstinStateWarning } from "@/server/modules/business/validation";
import { formatPaise, paiseToRupees } from "@/server/modules/catalog/validation";
import type { DraftActionState } from "@/server/modules/quotations/actions";
import type { CatalogChoice, QuoteDraft } from "@/server/modules/quotations/queries";
import {
  type CalculatedLine,
  type QuoteLineInput,
  type QuoteSnapshotInput,
  type QuoteTotals,
  savedLineToInput,
  snapshotToInput,
} from "@/server/modules/quotations/validation";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]";
const emptyLine = (): QuoteLineInput => ({
  clientId: crypto.randomUUID(),
  sourceCatalogItemId: "",
  description: "",
  unitLabel: "",
  hsnSac: "",
  quantity: "1",
  unitPriceRupees: "",
  gstCategory: "taxable",
  gstRate: "",
});

function Totals({ totals, title }: { totals: QuoteTotals; title: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--mint)] p-5">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:max-w-sm">
        <dt>Subtotal</dt>
        <dd className="text-right">{formatPaise(totals.subtotal_minor)}</dd>
        <dt>Taxable base</dt>
        <dd className="text-right">{formatPaise(totals.taxable_subtotal_minor)}</dd>
        <dt>CGST</dt>
        <dd className="text-right">{formatPaise(totals.cgst_total_minor)}</dd>
        <dt>SGST</dt>
        <dd className="text-right">{formatPaise(totals.sgst_total_minor)}</dd>
        <dt>IGST</dt>
        <dd className="text-right">{formatPaise(totals.igst_total_minor)}</dd>
        <dt>GST total</dt>
        <dd className="text-right">{formatPaise(totals.gst_total_minor)}</dd>
        <dt className="border-t border-[#b8d7cc] pt-2 font-semibold">Total</dt>
        <dd className="border-t border-[#b8d7cc] pt-2 text-right font-semibold">
          {formatPaise(totals.total_minor)}
        </dd>
      </dl>
    </div>
  );
}

function LineBreakdown({ lines }: { lines: CalculatedLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white p-5">
      <h3 className="font-semibold">Line tax breakdown</h3>
      <table className="mt-3 w-full min-w-[700px] text-left text-sm">
        <thead className="border-b border-[var(--line)] text-[var(--muted)]">
          <tr>
            <th className="py-2 pr-3">Line</th>
            <th className="py-2 pr-3">Base</th>
            <th className="py-2 pr-3">GST</th>
            <th className="py-2 pr-3">CGST</th>
            <th className="py-2 pr-3">SGST</th>
            <th className="py-2 pr-3">IGST</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.position} className="border-b border-[var(--line)] last:border-0">
              <td className="py-2 pr-3">
                {line.position}. {line.description}
              </td>
              <td className="py-2 pr-3">{formatPaise(line.line_subtotal_minor)}</td>
              <td className="py-2 pr-3">
                {line.gst_category}
                {line.gst_rate === null ? "" : ` · ${line.gst_rate}%`}
              </td>
              <td className="py-2 pr-3">{formatPaise(line.cgst_amount_minor)}</td>
              <td className="py-2 pr-3">{formatPaise(line.sgst_amount_minor)}</td>
              <td className="py-2 pr-3">{formatPaise(line.igst_amount_minor)}</td>
              <td className="py-2 text-right">{formatPaise(line.line_total_minor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QuotationDraftEditor({
  quote,
  catalog,
  rates,
  paymentDefaults,
  action,
}: {
  quote: QuoteDraft;
  catalog: CatalogChoice[];
  rates: string[];
  paymentDefaults: BusinessProfile;
  action: (state: DraftActionState, data: FormData) => Promise<DraftActionState>;
}) {
  const [snapshot, setSnapshot] = useState<QuoteSnapshotInput>(() =>
    snapshotToInput(quote.snapshot),
  );
  const [lines, setLines] = useState<QuoteLineInput[]>(() =>
    quote.lines.map(savedLineToInput),
  );
  const [state, formAction, pending] = useActionState(action, {});
  const autoRoute =
    snapshot.sellerStateCode && snapshot.buyerStateCode
      ? snapshot.sellerStateCode === snapshot.buyerStateCode
        ? "CGST + SGST"
        : "IGST"
      : "Needs both states";
  const finalRoute =
    snapshot.gstTreatmentOverride ||
    (autoRoute === "CGST + SGST" ? "cgst_sgst" : autoRoute === "IGST" ? "igst" : "");
  const sellerWarning = snapshot.sellerStateCode
    ? gstinStateWarning(
        snapshot.sellerGstin.trim().toUpperCase() || null,
        snapshot.sellerStateCode,
      )
    : null;
  const buyerWarning = snapshot.buyerStateCode
    ? gstinStateWarning(
        snapshot.buyerGstin.trim().toUpperCase() || null,
        snapshot.buyerStateCode,
      )
    : null;
  const missingForShare = [
    !snapshot.sellerDisplayName.trim() && "Seller name",
    !snapshot.sellerPostalAddress.trim() && "Seller address",
    !snapshot.sellerStateCode && "Seller state",
    snapshot.sellerGstRegistered === "unset" && "Seller GST declaration",
    snapshot.sellerGstRegistered === "yes" &&
      !snapshot.sellerGstin.trim() &&
      "Seller GSTIN",
    !snapshot.buyerDisplayName.trim() && "Buyer name",
    !snapshot.buyerBillingAddress.trim() && "Buyer address",
    !snapshot.buyerStateCode && "Buyer state",
    snapshot.buyerGstinApplicable === "unset" && "Buyer GSTIN declaration",
    snapshot.buyerGstinApplicable === "yes" && !snapshot.buyerGstin.trim() && "Buyer GSTIN",
    snapshot.placeOfSupplyApplicable === "unset" && "Place of supply declaration",
    snapshot.placeOfSupplyApplicable === "yes" &&
      !snapshot.placeOfSupplyStateCode &&
      "Place of supply state",
    snapshot.reverseChargeApplies === "unset" && "Reverse charge declaration",
    lines.length === 0 && "At least one line",
  ].filter(Boolean) as string[];

  function updateField<K extends keyof QuoteSnapshotInput>(
    field: K,
    value: QuoteSnapshotInput[K],
  ) {
    setSnapshot((previous) => ({ ...previous, [field]: value }));
  }
  function textField(
    field: keyof QuoteSnapshotInput,
    label: string,
    options: { rows?: number; type?: string; hint?: string } = {},
  ) {
    return (
      <label key={field} htmlFor={`quote-${field}`} className="block text-sm font-medium">
        {label}
        {options.rows ? (
          <textarea
            id={`quote-${field}`}
            className={inputClass}
            rows={options.rows}
            value={snapshot[field]}
            onChange={(event) => updateField(field, event.target.value)}
          />
        ) : (
          <input
            id={`quote-${field}`}
            className={inputClass}
            type={options.type ?? "text"}
            value={snapshot[field]}
            onChange={(event) => updateField(field, event.target.value)}
          />
        )}
        {options.hint ? (
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
            {options.hint}
          </span>
        ) : null}
      </label>
    );
  }
  function stateField(field: keyof QuoteSnapshotInput, label: string) {
    return (
      <label className="block text-sm font-medium" key={field}>
        {label}
        <select
          className={inputClass}
          value={snapshot[field]}
          onChange={(event) => updateField(field, event.target.value)}
        >
          <option value="">Select a state or territory</option>
          {indianStates.map(([code, name]) => (
            <option value={code} key={code}>
              {name} ({code})
            </option>
          ))}
        </select>
      </label>
    );
  }
  function declarationField(field: keyof QuoteSnapshotInput, label: string) {
    return (
      <label className="block text-sm font-medium" key={field}>
        {label}
        <select
          className={inputClass}
          value={snapshot[field]}
          onChange={(event) => updateField(field, event.target.value)}
        >
          <option value="unset">Not selected</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
    );
  }
  function updateLine(id: string, field: keyof QuoteLineInput, value: string) {
    setLines((previous) =>
      previous.map((line) => (line.clientId === id ? { ...line, [field]: value } : line)),
    );
  }
  function chooseCatalog(id: string, catalogId: string) {
    const item = catalog.find((choice) => choice.id === catalogId);
    setLines((previous) =>
      previous.map((line) =>
        line.clientId !== id
          ? line
          : item
            ? {
                ...line,
                sourceCatalogItemId: item.id,
                description: [item.name, item.description].filter(Boolean).join(" — "),
                unitLabel: item.unit_label ?? "",
                hsnSac: item.hsn_sac ?? "",
                unitPriceRupees:
                  item.default_unit_price_minor === null
                    ? ""
                    : paiseToRupees(item.default_unit_price_minor),
                gstCategory: item.default_gst_category,
                gstRate: item.default_gst_rate ?? "",
              }
            : { ...line, sourceCatalogItemId: "" },
      ),
    );
  }
  function copyPaymentDefaults() {
    setSnapshot((previous) => ({
      ...previous,
      sellerBankName: paymentDefaults.bank_name ?? "",
      sellerBankAccountName: paymentDefaults.bank_account_name ?? "",
      sellerBankAccountNumber: paymentDefaults.bank_account_number ?? "",
      sellerBankIfsc: paymentDefaults.bank_ifsc ?? "",
      sellerUpiId: paymentDefaults.upi_id ?? "",
      paymentInstructions: paymentDefaults.payment_instructions ?? "",
    }));
  }

  return (
    <form action={formAction} className="mt-7 space-y-7" noValidate>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="editSequence" value={quote.edit_sequence} />
      <input type="hidden" name="snapshotJson" value={JSON.stringify(snapshot)} />
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {missingForShare.length ? (
        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Draft details still needed before future sharing</p>
          <p className="mt-1">{missingForShare.join(" · ")}</p>
        </aside>
      ) : null}
      {sellerWarning ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Seller: {sellerWarning}
        </p>
      ) : null}
      {buyerWarning ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Buyer: {buyerWarning}
        </p>
      ) : null}
      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <h2 className="text-lg font-semibold">Seller and buyer snapshot</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          These details were copied when the draft was created. Edit them here; changes to
          customer or business records will not refresh this draft.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {textField("sellerDisplayName", "Seller name")}
          {textField("buyerDisplayName", "Buyer name")}
          {textField("sellerContactEmail", "Seller email", { type: "email" })}
          {textField("buyerEmail", "Buyer email", { type: "email" })}
          {textField("sellerContactPhone", "Seller phone")}
          {textField("buyerPhone", "Buyer phone")}
          {textField("sellerPostalAddress", "Seller address", { rows: 3 })}
          {textField("buyerBillingAddress", "Buyer billing address", { rows: 3 })}
          {stateField("sellerStateCode", "Seller state")}
          {stateField("buyerStateCode", "Buyer state")}
          {declarationField("sellerGstRegistered", "Seller GST registered?")}
          {declarationField("buyerGstinApplicable", "Buyer GSTIN applicable?")}
          {textField("sellerGstin", "Seller GSTIN")}
          {textField("buyerGstin", "Buyer GSTIN")}
          {textField("buyerContactName", "Buyer contact name")}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <h2 className="text-lg font-semibold">Document and tax choices</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          India · INR · prices before GST · quantity up to three decimals.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {textField("validUntil", "Valid through", { type: "date" })}
          {textField("documentTimeZone", "Document time zone", {
            hint: "IANA zone, for example Asia/Kolkata.",
          })}
          <label className="block text-sm font-medium">
            GST treatment override
            <select
              className={inputClass}
              value={snapshot.gstTreatmentOverride}
              onChange={(event) =>
                updateField(
                  "gstTreatmentOverride",
                  event.target.value as QuoteSnapshotInput["gstTreatmentOverride"],
                )
              }
            >
              <option value="">Use state-based suggestion</option>
              <option value="cgst_sgst">CGST + SGST</option>
              <option value="igst">IGST</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
              Suggested: {autoRoute}. Final choice:{" "}
              {finalRoute === "cgst_sgst"
                ? "CGST + SGST"
                : finalRoute === "igst"
                  ? "IGST"
                  : "Incomplete"}
              .
            </span>
          </label>
          {declarationField("placeOfSupplyApplicable", "Place of supply applies?")}
          {snapshot.placeOfSupplyApplicable === "yes"
            ? stateField("placeOfSupplyStateCode", "Place of supply state")
            : null}
          {snapshot.placeOfSupplyApplicable === "yes"
            ? textField("placeOfSupplyText", "Additional place of supply wording")
            : null}
          {declarationField("reverseChargeApplies", "Reverse charge applies?")}
        </div>
        {snapshot.reverseChargeApplies === "yes" ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            Reverse-charge calculation is not supported in this version. Confirm the tax
            treatment with your accountant before issuing this document.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Ordered lines</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Catalog defaults become editable copies. You can also add one-off lines.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLines((previous) => [...previous, emptyLine()])}
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium"
          >
            Add line
          </button>
        </div>
        {lines.length ? (
          <div className="mt-5 space-y-5">
            {lines.map((line, index) => (
              <fieldset
                key={line.clientId}
                className="rounded-xl border border-[var(--line)] p-4"
              >
                <legend className="px-1 text-sm font-semibold">Line {index + 1}</legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Copy catalog default
                    <select
                      className={inputClass}
                      value={line.sourceCatalogItemId}
                      onChange={(event) => chooseCatalog(line.clientId, event.target.value)}
                    >
                      <option value="">One-off line</option>
                      {line.sourceCatalogItemId &&
                      !catalog.some((item) => item.id === line.sourceCatalogItemId) ? (
                        <option value={line.sourceCatalogItemId}>
                          Previously copied catalog item
                        </option>
                      ) : null}
                      {catalog.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Description
                    <input
                      className={inputClass}
                      value={line.description}
                      onChange={(event) =>
                        updateLine(line.clientId, "description", event.target.value)
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Unit
                    <input
                      className={inputClass}
                      value={line.unitLabel}
                      onChange={(event) =>
                        updateLine(line.clientId, "unitLabel", event.target.value)
                      }
                      placeholder="each, hour, month…"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    HSN / SAC
                    <input
                      className={inputClass}
                      value={line.hsnSac}
                      onChange={(event) =>
                        updateLine(line.clientId, "hsnSac", event.target.value)
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Quantity
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.clientId, "quantity", event.target.value)
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Unit price before GST (₹)
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={line.unitPriceRupees}
                      onChange={(event) =>
                        updateLine(line.clientId, "unitPriceRupees", event.target.value)
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    GST category
                    <select
                      className={inputClass}
                      value={line.gstCategory}
                      onChange={(event) => {
                        const category = event.target
                          .value as QuoteLineInput["gstCategory"];
                        setLines((previous) =>
                          previous.map((item) =>
                            item.clientId === line.clientId
                              ? {
                                  ...item,
                                  gstCategory: category,
                                  gstRate: category === "taxable" ? item.gstRate : "",
                                }
                              : item,
                          ),
                        );
                      }}
                    >
                      <option value="taxable">Taxable</option>
                      <option value="exempt">Exempt</option>
                      <option value="no_gst">No GST</option>
                    </select>
                  </label>
                  {line.gstCategory === "taxable" ? (
                    <label className="block text-sm font-medium">
                      GST rate
                      <select
                        className={inputClass}
                        value={line.gstRate}
                        onChange={(event) =>
                          updateLine(line.clientId, "gstRate", event.target.value)
                        }
                      >
                        <option value="">Select configured rate</option>
                        {line.gstRate && !rates.includes(line.gstRate) ? (
                          <option value={line.gstRate}>
                            {line.gstRate}% retired — replace before saving
                          </option>
                        ) : null}
                        {rates.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setLines((previous) =>
                      previous.filter((item) => item.clientId !== line.clientId),
                    )
                  }
                  className="mt-4 text-sm font-medium text-red-700"
                >
                  Remove line
                </button>
              </fieldset>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted)]">
            This draft has no lines yet. Add a line to calculate an amount.
          </p>
        )}
        {rates.length === 0 ? (
          <p className="mt-4 text-sm text-amber-900">
            No selectable GST rates are configured. An operator must configure one before
            taxable lines can be saved.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <h2 className="text-lg font-semibold">Terms and optional payment details</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Use the buttons only when you want to copy current business defaults into this
          draft. Later settings changes will not refresh saved quotation fields.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateField("terms", paymentDefaults.default_terms ?? "")}
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-medium"
          >
            Copy default terms
          </button>
          <button
            type="button"
            onClick={copyPaymentDefaults}
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-medium"
          >
            Copy payment details
          </button>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {textField("terms", "Terms", { rows: 3 })}
          {textField("paymentInstructions", "Payment instructions", { rows: 3 })}
          {textField("sellerBankName", "Bank name")}
          {textField("sellerBankAccountName", "Account holder")}
          {textField("sellerBankAccountNumber", "Bank account number")}
          {textField("sellerBankIfsc", "IFSC")}
          {textField("sellerUpiId", "UPI ID")}
        </div>
      </div>

      {state.preview ? (
        <div role="status">
          <Totals totals={state.preview} title="Calculated preview — not saved" />
          <LineBreakdown lines={state.preview.lines} />
          <p className="mt-2 text-xs text-[var(--muted)]">
            If you change the form, preview again before saving.{" "}
            {state.preview.lines.length} line(s); suggested{" "}
            {state.preview.auto_treatment ?? "incomplete"}, final{" "}
            {state.preview.treatment ?? "incomplete"}.
          </p>
        </div>
      ) : null}
      {quote.totals.total_minor !== null ? (
        <div>
          <Totals totals={quote.totals} title="Last saved totals" />
          <LineBreakdown lines={quote.lines} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="preview"
          disabled={pending}
          className="rounded-xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold disabled:opacity-60"
        >
          Preview calculation
        </button>
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Working…" : "Save draft"}
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        This is a private draft. Save it before sharing; a shared version becomes read-only.
      </p>
    </form>
  );
}
