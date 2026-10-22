"use client";

import {
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileText,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  Mail,
  MapPin,
  Phone,
  Plus,
  Settings2,
  Trash2,
  Wallet,
} from "lucide-react";
import { Fragment, useActionState, useState } from "react";
import { useSubmissionErrorToast } from "@/components/ui/toast-provider";
import type { BusinessProfile } from "@/server/modules/business/settings-validation";
import { indianStates } from "@/server/modules/business/states";
import { gstinStateWarning } from "@/server/modules/business/validation";
import { formatPaise, paiseToRupees } from "@/server/modules/catalog/validation";
import type { DraftActionState } from "@/server/modules/quotations/actions";
import { estimateQuotationTotal } from "@/server/modules/quotations/estimate";
import { customerQuotationFields } from "@/server/modules/quotations/new-draft";
import type {
  CatalogChoice,
  CustomerChoice,
  QuoteDraft,
} from "@/server/modules/quotations/queries";
import {
  defaultQuotationHeadings,
  type QuotationHeadingKey,
  resolveQuotationHeadings,
} from "@/server/modules/quotations/template-headings";
import {
  type CalculatedLine,
  getQuoteShareBlockers,
  type QuoteCategoryInput as QuoteCategoryFormInput,
  type QuoteComponentInput,
  type QuoteLineInput,
  type QuoteSnapshotInput,
  type QuoteTotals,
  savedLineToInput,
  snapshotToInput,
} from "@/server/modules/quotations/validation";

type BuyerSnapshotFields = Pick<
  QuoteSnapshotInput,
  | "buyerDisplayName"
  | "buyerEmail"
  | "buyerPhone"
  | "buyerBillingAddress"
  | "buyerStateCode"
  | "buyerGstinApplicable"
  | "buyerGstin"
  | "buyerContactName"
>;
type BuyerTextField = Exclude<
  keyof BuyerSnapshotFields,
  "buyerStateCode" | "buyerGstinApplicable"
>;

const inputClass =
  "mt-1 min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed] lg:!min-h-8 lg:py-1 lg:text-xs";
const reorderActionClass =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#a9cbbf] bg-white text-[#075b4b] shadow-sm transition-colors hover:border-[#08745d] hover:bg-[#eaf5f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08745d] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:border-[#dce5e1] disabled:bg-[#f5f8f6] disabled:text-[#9aa8a2] disabled:shadow-none";
const deleteActionClass =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e6b8b8] bg-white text-[#b42318] shadow-sm transition-colors hover:border-[#c82b22] hover:bg-[#fff1f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c82b22] focus-visible:ring-offset-1";
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
  components: [],
});
const emptyCategory = (name = "Main category"): QuoteCategoryFormInput => ({
  id: crypto.randomUUID(),
  name,
});
const emptyComponent = (): QuoteComponentInput => ({
  clientId: crypto.randomUUID(),
  description: "",
  unitLabel: "",
  quantity: "1",
  unitPriceRupees: "",
});

function Totals({ totals, title }: { totals: QuoteTotals; title: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--mint)] p-5">
      <h3 className="font-bold">{title}</h3>
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
      <h3 className="font-bold">Line tax breakdown</h3>
      <table className="mt-3 w-full min-w-[700px] text-left text-sm">
        <thead className="border-b border-[var(--line)] text-[var(--muted-foreground)]">
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

function hasOptionalQuotationDetails(snapshot: QuoteSnapshotInput) {
  return [
    snapshot.terms,
    snapshot.paymentInstructions,
    snapshot.sellerBankName,
    snapshot.sellerBankAccountName,
    snapshot.sellerBankAccountNumber,
    snapshot.sellerBankIfsc,
    snapshot.sellerUpiId,
  ].some((value) => value.trim());
}

function SectionHeading({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: number;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="break-words text-sm font-bold text-[var(--ink)]">
          {number}. {title}
        </h2>
        <p className="mt-0.5 text-xs leading-4 text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>
    </div>
  );
}

export function QuotationDraftEditor({
  quote,
  catalog,
  rates,
  paymentDefaults,
  action,
  customers,
}: {
  quote: QuoteDraft;
  catalog: CatalogChoice[];
  rates: string[];
  paymentDefaults: BusinessProfile;
  action: (state: DraftActionState, data: FormData) => Promise<DraftActionState>;
  customers?: CustomerChoice[];
}) {
  const isNew = customers !== undefined;
  const [customerId, setCustomerId] = useState(quote.customer_id);
  const [headings, setHeadings] = useState(() =>
    resolveQuotationHeadings(quote.template_headings),
  );
  const [snapshot, setSnapshot] = useState<QuoteSnapshotInput>(() =>
    snapshotToInput(quote.snapshot),
  );
  const [optionalDetailsOpen, setOptionalDetailsOpen] = useState(() =>
    hasOptionalQuotationDetails(snapshot),
  );
  const [buyerEditing, setBuyerEditing] = useState(false);
  const [buyerDraft, setBuyerDraft] = useState<BuyerSnapshotFields>(() => {
    const initial = snapshotToInput(quote.snapshot);
    return {
      buyerDisplayName: initial.buyerDisplayName,
      buyerEmail: initial.buyerEmail,
      buyerPhone: initial.buyerPhone,
      buyerBillingAddress: initial.buyerBillingAddress,
      buyerStateCode: initial.buyerStateCode,
      buyerGstinApplicable: initial.buyerGstinApplicable,
      buyerGstin: initial.buyerGstin,
      buyerContactName: initial.buyerContactName,
    };
  });
  const [categories, setCategories] = useState<QuoteCategoryFormInput[]>(() =>
    quote.item_categories?.length ? quote.item_categories : [emptyCategory()],
  );
  const [lines, setLines] = useState<QuoteLineInput[]>(() =>
    quote.lines.length
      ? quote.lines.map((savedLine) => {
          const line = savedLineToInput(savedLine);
          return { ...line, categoryId: line.categoryId ?? categories[0]?.id };
        })
      : [{ ...emptyLine(), clientId: quote.id, categoryId: categories[0]?.id }],
  );
  const [state, formAction, pending] = useActionState(action, {});
  useSubmissionErrorToast(state);
  const hasOptionalDetails = hasOptionalQuotationDetails(snapshot);
  const autoRoute =
    snapshot.sellerStateCode && snapshot.buyerStateCode
      ? snapshot.sellerStateCode === snapshot.buyerStateCode
        ? "CGST + SGST"
        : "IGST"
      : "Needs both states";
  const finalRoute =
    snapshot.gstTreatmentOverride ||
    (autoRoute === "CGST + SGST" ? "cgst_sgst" : autoRoute === "IGST" ? "igst" : "");
  const estimate = estimateQuotationTotal(lines, finalRoute);
  const categoryTotal = (categoryId: string): string | null => {
    const categoryLines = lines.flatMap((line, index) =>
      line.categoryId === categoryId ? [estimate.lineTotals[index]] : [],
    );
    if (categoryLines.some((amount) => amount === null || amount === undefined))
      return null;
    return categoryLines
      .reduce((sum, amount) => sum + BigInt(amount ?? "0"), BigInt(0))
      .toString();
  };
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
  const missingForShare = getQuoteShareBlockers(snapshot, lines, rates);
  const documentReady = Boolean(
    snapshot.documentTimeZone.trim() &&
      snapshot.sellerStateCode &&
      snapshot.buyerStateCode &&
      snapshot.sellerGstRegistered !== "unset" &&
      snapshot.buyerGstinApplicable !== "unset" &&
      snapshot.placeOfSupplyApplicable !== "unset" &&
      snapshot.reverseChargeApplies !== "unset",
  );
  const linesReady =
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.description.trim() &&
        line.quantity.trim() &&
        line.unitPriceRupees.trim() &&
        line.components.every(
          (component) =>
            component.description.trim() &&
            component.quantity.trim() &&
            component.unitPriceRupees.trim(),
        ) &&
        (line.gstCategory !== "taxable" || line.gstRate.trim()),
    );
  const progressSteps = [
    { label: "Customer selected", complete: Boolean(customerId) },
    { label: "Document and tax choices", complete: documentReady },
    { label: "Add at least one line item", complete: linesReady },
    {
      label: "Review and save",
      complete: (!isNew && quote.totals.total_minor !== null) || Boolean(state.preview),
    },
  ];
  const completedSteps = progressSteps.filter((step) => step.complete).length;

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
      <label key={field} htmlFor={`quote-${field}`} className="block text-xs font-medium">
        {label}
        {options.rows ? (
          <textarea
            id={`quote-${field}`}
            className={`${inputClass} lg:!min-h-14`}
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
          <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
            {options.hint}
          </span>
        ) : null}
      </label>
    );
  }
  function buyerTextField(
    field: BuyerTextField,
    label: string,
    options: { rows?: number; type?: string } = {},
  ) {
    return (
      <label key={field} htmlFor={`quote-${field}`} className="block text-xs font-medium">
        {label}
        {options.rows ? (
          <textarea
            id={`quote-${field}`}
            className={`${inputClass} lg:!min-h-14`}
            rows={options.rows}
            value={buyerDraft[field]}
            onChange={(event) =>
              setBuyerDraft((previous) => ({ ...previous, [field]: event.target.value }))
            }
          />
        ) : (
          <input
            id={`quote-${field}`}
            className={inputClass}
            type={options.type ?? "text"}
            value={buyerDraft[field]}
            onChange={(event) =>
              setBuyerDraft((previous) => ({ ...previous, [field]: event.target.value }))
            }
          />
        )}
      </label>
    );
  }
  function stateField(field: keyof QuoteSnapshotInput, label: string) {
    return (
      <label className="block text-xs font-medium" htmlFor={`quote-${field}`} key={field}>
        {label}
        <select
          id={`quote-${field}`}
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
      <label className="block text-xs font-medium" htmlFor={`quote-${field}`} key={field}>
        {label}
        <select
          id={`quote-${field}`}
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
  function addCategory() {
    setCategories((previous) => [
      ...previous,
      emptyCategory(`Main category ${previous.length + 1}`),
    ]);
  }
  function updateCategory(id: string, name: string) {
    setCategories((previous) =>
      previous.map((category) => (category.id === id ? { ...category, name } : category)),
    );
  }
  function moveCategory(id: string, direction: -1 | 1) {
    setCategories((previous) => {
      const index = previous.findIndex((category) => category.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= previous.length) return previous;
      const copy = [...previous];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }
  function removeCategory(id: string) {
    setCategories((previous) => previous.filter((category) => category.id !== id));
    setLines((previous) => previous.filter((line) => line.categoryId !== id));
  }
  function addSubcategory(categoryId: string) {
    setLines((previous) => [...previous, { ...emptyLine(), categoryId }]);
  }
  function moveSubcategory(id: string, direction: -1 | 1) {
    setLines((previous) => {
      const index = previous.findIndex((line) => line.clientId === id);
      if (index < 0) return previous;
      const categoryId = previous[index]?.categoryId;
      const candidates = previous
        .map((line, at) => (line.categoryId === categoryId ? at : -1))
        .filter((at) => at >= 0);
      const position = candidates.indexOf(index);
      const target = candidates[position + direction];
      if (target === undefined) return previous;
      const copy = [...previous];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
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
  function updateComponent(
    lineId: string,
    componentId: string,
    field: keyof QuoteComponentInput,
    value: string,
  ) {
    setLines((previous) =>
      previous.map((line) =>
        line.clientId !== lineId
          ? line
          : {
              ...line,
              components: line.components.map((component) =>
                component.clientId === componentId
                  ? { ...component, [field]: value }
                  : component,
              ),
            },
      ),
    );
  }
  function addComponent(lineId: string) {
    setLines((previous) =>
      previous.map((line) =>
        line.clientId === lineId
          ? { ...line, components: [...line.components, emptyComponent()] }
          : line,
      ),
    );
  }
  function removeComponent(lineId: string, componentId: string) {
    setLines((previous) =>
      previous.map((line) =>
        line.clientId === lineId
          ? {
              ...line,
              components: line.components.filter(
                (component) => component.clientId !== componentId,
              ),
            }
          : line,
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
    <form id="quotation-draft-form" action={formAction} className="mt-0" noValidate>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="requestKey" value={quote.id} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="headingsJson" value={JSON.stringify(headings)} />
      <input type="hidden" name="editSequence" value={quote.edit_sequence} />
      <input type="hidden" name="snapshotJson" value={JSON.stringify(snapshot)} />
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
      <input type="hidden" name="categoriesJson" value={JSON.stringify(categories)} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {state.error}
        </p>
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
      <div className="grid min-w-0 items-start gap-x-4 gap-y-4 lg:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 lg:contents lg:space-y-0">
          <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5 lg:col-start-1 lg:p-4">
            <SectionHeading
              number={1}
              title="Select customer"
              description="Choose the customer for this quotation."
              icon={Building2}
            />
            <label className="mb-3 block text-xs font-medium">
              Customer <span className="text-red-600">*</span>
              <span className="relative mt-1 block">
                <Building2
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--brand)]"
                />
                <select
                  aria-label="Customer linked to this quotation draft"
                  className={`${inputClass} mt-0 min-h-10 pl-10 disabled:bg-[var(--paper)] disabled:opacity-100`}
                  disabled={!isNew || pending}
                  value={isNew ? customerId : snapshot.buyerDisplayName}
                  onChange={(event) => {
                    const customer = customers?.find(
                      (item) => item.id === event.target.value,
                    );
                    setCustomerId(event.target.value);
                    if (customer) {
                      const fields = customerQuotationFields(customer);
                      setSnapshot((previous) => ({
                        ...previous,
                        ...fields,
                        placeOfSupplyApplicable: customer.state_code ? "yes" : "no",
                        placeOfSupplyStateCode: customer.state_code ?? "",
                      }));
                      setBuyerDraft(fields);
                      setBuyerEditing(false);
                    }
                  }}
                >
                  {isNew ? (
                    <>
                      <option value="" disabled>
                        Select a customer
                      </option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.display_name}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value={snapshot.buyerDisplayName}>
                      {snapshot.buyerDisplayName || "Customer name not provided"}
                    </option>
                  )}
                </select>
              </span>
            </label>
            {isNew && !customerId ? (
              <p className="rounded-xl bg-[var(--canvas)]/80 p-4 text-sm text-[var(--muted-foreground)]">
                Select a customer above to load their details.
              </p>
            ) : (
              <div className="rounded-xl bg-[var(--canvas)]/80 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-bold text-[var(--ink)]">
                      {snapshot.buyerDisplayName || "Customer name not provided"}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      Customer details copied into this quotation draft
                    </p>
                  </div>
                  {buyerEditing ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setBuyerEditing(false)}
                        className="min-h-9 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSnapshot((previous) => ({ ...previous, ...buyerDraft }));
                          setBuyerEditing(false);
                        }}
                        className="min-h-9 rounded-lg bg-[var(--brand)] px-3 text-xs font-semibold text-white hover:bg-[var(--brand-dark)]"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Edit buyer details"
                      aria-expanded={buyerEditing}
                      aria-controls="quotation-buyer-edit-fields"
                      onClick={() => {
                        setBuyerDraft({
                          buyerDisplayName: snapshot.buyerDisplayName,
                          buyerEmail: snapshot.buyerEmail,
                          buyerPhone: snapshot.buyerPhone,
                          buyerBillingAddress: snapshot.buyerBillingAddress,
                          buyerStateCode: snapshot.buyerStateCode,
                          buyerGstinApplicable: snapshot.buyerGstinApplicable,
                          buyerGstin: snapshot.buyerGstin,
                          buyerContactName: snapshot.buyerContactName,
                        });
                        setBuyerEditing(true);
                      }}
                      className="min-h-9 shrink-0 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold text-[var(--brand-dark)] hover:bg-white"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {buyerEditing ? (
                  <div
                    id="quotation-buyer-edit-fields"
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    {buyerTextField("buyerDisplayName", "Buyer name")}
                    {buyerTextField("buyerEmail", "Buyer email", { type: "email" })}
                    {buyerTextField("buyerPhone", "Buyer phone")}
                    {buyerTextField("buyerBillingAddress", "Buyer billing address", {
                      rows: 2,
                    })}
                    <label
                      className="block text-xs font-medium"
                      htmlFor="quote-buyerStateCode"
                    >
                      Buyer state
                      <select
                        id="quote-buyerStateCode"
                        className={inputClass}
                        value={buyerDraft.buyerStateCode}
                        onChange={(event) =>
                          setBuyerDraft((previous) => ({
                            ...previous,
                            buyerStateCode: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select a state or territory</option>
                        {indianStates.map(([code, name]) => (
                          <option value={code} key={code}>
                            {name} ({code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      className="block text-xs font-medium"
                      htmlFor="quote-buyerGstinApplicable"
                    >
                      Buyer GSTIN applicable?
                      <select
                        id="quote-buyerGstinApplicable"
                        className={inputClass}
                        value={buyerDraft.buyerGstinApplicable}
                        onChange={(event) =>
                          setBuyerDraft((previous) => ({
                            ...previous,
                            buyerGstinApplicable: event.target
                              .value as BuyerSnapshotFields["buyerGstinApplicable"],
                          }))
                        }
                      >
                        <option value="unset">Select an answer</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    {buyerTextField("buyerGstin", "Buyer GSTIN")}
                    {buyerTextField("buyerContactName", "Buyer contact name")}
                    <p className="text-xs text-[var(--muted-foreground)] sm:col-span-2">
                      Click Save to apply your changes, then choose Save draft below to keep
                      them.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                      <p className="flex min-w-0 items-center gap-2 break-words font-medium">
                        <Phone
                          aria-hidden="true"
                          className="size-4 shrink-0 text-[var(--brand)]"
                        />
                        <span>{snapshot.buyerPhone || "—"}</span>
                      </p>
                      <p className="flex min-w-0 items-center gap-2 break-words font-medium">
                        <Mail
                          aria-hidden="true"
                          className="size-4 shrink-0 text-[var(--brand)]"
                        />
                        <span>{snapshot.buyerEmail || "—"}</span>
                      </p>
                      <p className="flex min-w-0 items-center gap-2 break-words font-medium">
                        <MapPin
                          aria-hidden="true"
                          className="size-4 shrink-0 text-[var(--brand)]"
                        />
                        <span>
                          {indianStates.find(
                            ([code]) => code === snapshot.buyerStateCode,
                          )?.[1] ?? "—"}
                          {snapshot.buyerStateCode ? ` (${snapshot.buyerStateCode})` : ""}
                        </span>
                      </p>
                    </div>
                    <dl className="mt-4 grid gap-x-4 gap-y-3 text-xs sm:grid-cols-2">
                      {[
                        ["Buyer billing address", snapshot.buyerBillingAddress],
                        [
                          "Buyer GSTIN applicable?",
                          snapshot.buyerGstinApplicable === "unset"
                            ? "Not specified"
                            : snapshot.buyerGstinApplicable === "yes"
                              ? "Yes"
                              : "No",
                        ],
                        ["Buyer GSTIN", snapshot.buyerGstin],
                        ["Buyer contact name", snapshot.buyerContactName],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="font-medium text-[var(--muted-foreground)]">
                            {label}
                          </dt>
                          <dd className="mt-1 break-words whitespace-pre-line text-[var(--ink)]">
                            {value || "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5 lg:col-start-1 lg:p-4">
            <SectionHeading
              number={2}
              title="Seller snapshot"
              description="These seller details were copied when the draft was created. Edit them here if needed."
              icon={Building2}
            />
            <div className="grid gap-3">
              <section className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--paper)]/40 p-3 sm:p-4">
                <h3 className="text-xs font-bold text-[var(--brand-dark)]">
                  Seller details
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {textField("sellerDisplayName", "Seller name")}
                  {textField("sellerContactEmail", "Seller email", { type: "email" })}
                  {textField("sellerContactPhone", "Seller phone")}
                  {textField("sellerPostalAddress", "Seller address", { rows: 2 })}
                  {stateField("sellerStateCode", "Seller state")}
                  {declarationField("sellerGstRegistered", "Seller GST registered?")}
                  {textField("sellerGstin", "Seller GSTIN")}
                </div>
              </section>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5 lg:col-start-1 lg:p-4">
            <SectionHeading
              number={3}
              title="Document and tax (optional)"
              description="Defaults are selected. Expand a dropdown if you need to change them."
              icon={Settings2}
            />
            <details className="group rounded-xl border border-[var(--line)] p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Document (optional)
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition group-open:rotate-180"
                />
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {textField("validUntil", "Valid through", {
                  type: "date",
                  hint: "Optional. Leave blank if this quotation has no expiry date.",
                })}
                {textField("documentTimeZone", "Document time zone", {
                  hint: "IANA zone, for example Asia/Kolkata.",
                })}
              </div>
            </details>
            <details className="group mt-3 rounded-xl border border-[var(--line)] p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Tax (optional)
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition group-open:rotate-180"
                />
              </summary>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Uses saved seller and customer details. Suggested GST: {autoRoute}.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-medium">
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
                  <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
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
                  Reverse-charge calculation is not supported in this version. Confirm the
                  tax treatment with your accountant before issuing this document.
                </p>
              ) : null}
            </details>
          </section>

          <section
            id="quote-lines"
            className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5 lg:col-span-2 lg:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionHeading
                  number={4}
                  title={headings.itemDescription}
                  description="Group priced quotation items under editable main category headings."
                  icon={ListChecks}
                />
              </div>
              <div className="text-right" aria-live="polite" aria-atomic="true">
                <p className="text-xs font-medium text-[var(--muted-foreground)]">
                  {headings.totalTitle}
                </p>
                <p className="text-xl font-bold tabular-nums text-[var(--brand)]">
                  {estimate.complete ? formatPaise(estimate.totalMinor) : "—"}
                </p>
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  {estimate.complete
                    ? "Estimated including GST"
                    : "Complete item details to calculate"}
                </p>
              </div>
              <button
                type="button"
                disabled={categories.length >= 50}
                onClick={addCategory}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 text-xs font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
              >
                <Plus aria-hidden="true" className="size-4" />
                Add Main Category
              </button>
            </div>
            {categories.length ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]">
                <table className="w-full min-w-[900px] table-fixed text-left text-xs">
                  <colgroup>
                    <col className="w-[4%]" />
                    <col className="w-[24%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[14%]" />
                    <col className="w-[11%]" />
                    <col className="w-[12%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="bg-[var(--canvas)] text-[var(--muted-foreground)]">
                    <tr>
                      {[
                        "#",
                        "Item",
                        "HSN / SAC",
                        "Quantity",
                        "Unit price (₹)",
                        "GST",
                        "Amount (₹)",
                        "",
                      ].map((heading) => (
                        <th className="px-2 py-2 font-semibold" key={heading || "actions"}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category, categoryIndex) => (
                      <Fragment key={category.id}>
                        <tr className="border-t-2 border-[var(--line)] bg-[var(--mint)]/70">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="min-w-[12rem] flex-1 text-[11px] font-semibold text-[var(--brand-dark)]">
                                Main category
                                <input
                                  aria-label={`Main category ${categoryIndex + 1} name`}
                                  className={`${inputClass} mt-1 min-h-8 py-1 text-xs`}
                                  maxLength={120}
                                  value={category.name}
                                  onChange={(event) =>
                                    updateCategory(category.id, event.target.value)
                                  }
                                />
                              </label>
                              <div className="flex items-center gap-1.5 self-end">
                                <button
                                  type="button"
                                  aria-label={`Move main category ${categoryIndex + 1} up`}
                                  title="Move category up"
                                  disabled={categoryIndex === 0}
                                  onClick={() => moveCategory(category.id, -1)}
                                  className={reorderActionClass}
                                >
                                  <ArrowUp aria-hidden="true" className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Move main category ${categoryIndex + 1} down`}
                                  title="Move category down"
                                  disabled={categoryIndex === categories.length - 1}
                                  onClick={() => moveCategory(category.id, 1)}
                                  className={reorderActionClass}
                                >
                                  <ArrowDown aria-hidden="true" className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addSubcategory(category.id)}
                                  disabled={lines.length >= 100}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2 text-[11px] font-semibold text-[var(--brand-dark)]"
                                >
                                  <Plus aria-hidden="true" className="size-3" /> Add New
                                  Line
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete main category ${categoryIndex + 1} and its items`}
                                  title="Delete category and its items"
                                  onClick={() => removeCategory(category.id)}
                                  className={deleteActionClass}
                                >
                                  <Trash2 aria-hidden="true" className="size-4" />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {lines.map((line, index) =>
                          line.categoryId === category.id ? (
                            <Fragment key={line.clientId}>
                              <tr className="border-t border-[var(--line)] align-middle">
                                <td className="px-2 py-2 text-[var(--muted-foreground)]">
                                  {index + 1}
                                </td>
                                <td className="space-y-1 px-2 py-2">
                                  <select
                                    aria-label={`Catalog item for line ${index + 1}`}
                                    className={`${inputClass} mt-0 min-h-8 py-1 text-xs`}
                                    value={line.sourceCatalogItemId}
                                    onChange={(event) =>
                                      chooseCatalog(line.clientId, event.target.value)
                                    }
                                  >
                                    <option value="">Enter manually</option>
                                    {line.sourceCatalogItemId &&
                                    !catalog.some(
                                      (item) => item.id === line.sourceCatalogItemId,
                                    ) ? (
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
                                  <input
                                    aria-label={`Description for line ${index + 1}`}
                                    className={`${inputClass} mt-0 min-h-8 py-1 text-xs`}
                                    value={line.description}
                                    onChange={(event) =>
                                      updateLine(
                                        line.clientId,
                                        "description",
                                        event.target.value,
                                      )
                                    }
                                  />
                                  {line.components.length === 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => addComponent(line.clientId)}
                                      className="min-h-8 rounded-md px-1 text-left text-[11px] font-semibold text-[var(--brand-dark)] hover:underline"
                                    >
                                      <Plus
                                        aria-hidden="true"
                                        className="mr-1 inline size-3"
                                      />
                                      Add material / subproduct
                                    </button>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2">
                                  <input
                                    aria-label={`HSN or SAC for line ${index + 1}`}
                                    className={`${inputClass} mt-0 min-h-8 py-1 text-xs`}
                                    value={line.hsnSac}
                                    onChange={(event) =>
                                      updateLine(
                                        line.clientId,
                                        "hsnSac",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <input
                                    aria-label={`Quantity for line ${index + 1}`}
                                    className={`${inputClass} mt-0 min-h-8 py-1 text-xs`}
                                    inputMode="decimal"
                                    value={line.quantity}
                                    onChange={(event) =>
                                      updateLine(
                                        line.clientId,
                                        "quantity",
                                        event.target.value,
                                      )
                                    }
                                  />
                                  <input
                                    aria-label={`Unit for line ${index + 1}`}
                                    className={`${inputClass} mt-1 min-h-8 py-1 text-xs`}
                                    placeholder="Unit (optional)"
                                    value={line.unitLabel}
                                    onChange={(event) =>
                                      updateLine(
                                        line.clientId,
                                        "unitLabel",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <input
                                    aria-label={`Unit price before GST for line ${index + 1}`}
                                    className={`${inputClass} mt-0 min-h-8 py-1 text-xs`}
                                    inputMode="decimal"
                                    value={line.unitPriceRupees}
                                    onChange={(event) =>
                                      updateLine(
                                        line.clientId,
                                        "unitPriceRupees",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <div className="space-y-1">
                                    <select
                                      aria-label={`GST category for line ${index + 1}`}
                                      className={`${inputClass} mt-0 min-h-8 py-1 text-xs`}
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
                                                  gstRate:
                                                    category === "taxable"
                                                      ? item.gstRate
                                                      : "",
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
                                    {line.gstCategory === "taxable" ? (
                                      <select
                                        aria-label={`GST rate for line ${index + 1}`}
                                        className={`${inputClass} mt-0 min-h-8 py-1 text-xs`}
                                        value={line.gstRate}
                                        onChange={(event) =>
                                          updateLine(
                                            line.clientId,
                                            "gstRate",
                                            event.target.value,
                                          )
                                        }
                                      >
                                        <option value="">Rate</option>
                                        {line.gstRate && !rates.includes(line.gstRate) ? (
                                          <option value={line.gstRate}>
                                            {line.gstRate}% retired — replace
                                          </option>
                                        ) : null}
                                        {rates.map((rate) => (
                                          <option key={rate} value={rate}>
                                            {rate}%
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {estimate.lineTotals[index]
                                    ? formatPaise(estimate.lineTotals[index])
                                    : "—"}
                                </td>
                                <td className="px-1 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      aria-label={`Move subcategory item ${index + 1} up`}
                                      title="Move item up"
                                      onClick={() => moveSubcategory(line.clientId, -1)}
                                      disabled={
                                        lines.filter(
                                          (item) => item.categoryId === category.id,
                                        )[0]?.clientId === line.clientId
                                      }
                                      className={reorderActionClass}
                                    >
                                      <ArrowUp aria-hidden="true" className="size-4" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Move subcategory item ${index + 1} down`}
                                      title="Move item down"
                                      onClick={() => moveSubcategory(line.clientId, 1)}
                                      disabled={
                                        lines
                                          .filter((item) => item.categoryId === category.id)
                                          .at(-1)?.clientId === line.clientId
                                      }
                                      className={reorderActionClass}
                                    >
                                      <ArrowDown aria-hidden="true" className="size-4" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Remove line ${index + 1}`}
                                      title="Delete item"
                                      onClick={() =>
                                        setLines((previous) =>
                                          previous.filter(
                                            (item) => item.clientId !== line.clientId,
                                          ),
                                        )
                                      }
                                      className={deleteActionClass}
                                    >
                                      <Trash2 aria-hidden="true" className="size-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {line.components.length ? (
                                <tr className="border-t border-[var(--line)] bg-[var(--canvas)]/60">
                                  <td colSpan={8} className="px-3 py-3 sm:px-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold text-[var(--ink)]">
                                          {headings.materialsTitle} for{" "}
                                          {line.description || `line ${index + 1}`}
                                        </p>
                                        <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                                          Breakdown only. These amounts are not added to the
                                          quotation total.
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => addComponent(line.clientId)}
                                        className="min-h-8 rounded-md border border-[var(--line)] bg-white px-2 text-[11px] font-semibold text-[var(--brand-dark)]"
                                      >
                                        <Plus
                                          aria-hidden="true"
                                          className="mr-1 inline size-3"
                                        />
                                        Add another
                                      </button>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                      {line.components.map((component, componentIndex) => (
                                        <div
                                          key={component.clientId}
                                          className="grid gap-2 rounded-lg border border-[var(--line)] bg-white p-2 sm:grid-cols-[minmax(0,2fr)_minmax(5rem,0.8fr)_minmax(5rem,0.8fr)_minmax(7rem,1fr)_auto]"
                                        >
                                          <label className="text-[10px] font-medium text-[var(--muted-foreground)]">
                                            Subproduct / material
                                            <input
                                              aria-label={`Subproduct or material ${componentIndex + 1} name for line ${index + 1}`}
                                              className={`${inputClass} mt-0.5 min-h-8 py-1 text-xs`}
                                              placeholder="e.g. Teak wood"
                                              value={component.description}
                                              onChange={(event) =>
                                                updateComponent(
                                                  line.clientId,
                                                  component.clientId,
                                                  "description",
                                                  event.target.value,
                                                )
                                              }
                                            />
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--muted-foreground)]">
                                            Quantity
                                            <input
                                              aria-label={`Quantity for subproduct ${componentIndex + 1} of line ${index + 1}`}
                                              className={`${inputClass} mt-0.5 min-h-8 py-1 text-xs`}
                                              inputMode="decimal"
                                              value={component.quantity}
                                              onChange={(event) =>
                                                updateComponent(
                                                  line.clientId,
                                                  component.clientId,
                                                  "quantity",
                                                  event.target.value,
                                                )
                                              }
                                            />
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--muted-foreground)]">
                                            Unit
                                            <input
                                              aria-label={`Unit for subproduct ${componentIndex + 1} of line ${index + 1}`}
                                              className={`${inputClass} mt-0.5 min-h-8 py-1 text-xs`}
                                              placeholder="optional"
                                              value={component.unitLabel}
                                              onChange={(event) =>
                                                updateComponent(
                                                  line.clientId,
                                                  component.clientId,
                                                  "unitLabel",
                                                  event.target.value,
                                                )
                                              }
                                            />
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--muted-foreground)]">
                                            Unit price (₹)
                                            <input
                                              aria-label={`Unit price for subproduct ${componentIndex + 1} of line ${index + 1}`}
                                              className={`${inputClass} mt-0.5 min-h-8 py-1 text-xs`}
                                              inputMode="decimal"
                                              placeholder="0.00"
                                              value={component.unitPriceRupees}
                                              onChange={(event) =>
                                                updateComponent(
                                                  line.clientId,
                                                  component.clientId,
                                                  "unitPriceRupees",
                                                  event.target.value,
                                                )
                                              }
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            aria-label={`Remove subproduct ${componentIndex + 1} from line ${index + 1}`}
                                            title="Delete material"
                                            onClick={() =>
                                              removeComponent(
                                                line.clientId,
                                                component.clientId,
                                              )
                                            }
                                            className={`mt-4 self-start ${deleteActionClass}`}
                                          >
                                            <Trash2 aria-hidden="true" className="size-4" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          ) : null,
                        )}
                        <tr className="border-t border-[var(--line)] bg-[var(--canvas)]/60">
                          <td
                            colSpan={6}
                            className="px-3 py-2 text-right text-xs font-semibold"
                          >
                            {category.name || "Main category"} subtotal (including
                            applicable GST)
                          </td>
                          <td className="px-2 py-2 text-right text-xs font-bold tabular-nums">
                            {categoryTotal(category.id) === null
                              ? "—"
                              : formatPaise(categoryTotal(category.id) ?? "0")}
                          </td>
                          <td />
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted-foreground)]">
                This draft has no lines yet. Add a line to calculate an amount.
              </p>
            )}
            {rates.length === 0 ? (
              <p className="mt-4 text-sm text-amber-900">
                No selectable GST rates are configured. An operator must configure one
                before taxable lines can be saved.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5 lg:col-span-2 lg:p-4">
            <h2 className="m-0">
              <button
                type="button"
                aria-expanded={optionalDetailsOpen}
                aria-controls="quotation-optional-details"
                onClick={() => setOptionalDetailsOpen((previous) => !previous)}
                className="flex w-full items-center gap-2.5 text-left"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
                  <Wallet aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[var(--ink)]">
                    5. Terms and optional payment details
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-[var(--muted-foreground)]">
                    {optionalDetailsOpen
                      ? "Optional details are open. Tap to hide them."
                      : hasOptionalDetails
                        ? "Optional details have been added. Tap to review them."
                        : "Optional. Tap to add terms or payment details."}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${optionalDetailsOpen ? "rotate-180" : ""}`}
                />
              </button>
            </h2>
            <div
              id="quotation-optional-details"
              hidden={!optionalDetailsOpen}
              className="mt-4 border-t border-[var(--line)] pt-4"
            >
              <p className="text-xs text-[var(--muted-foreground)]">
                Use the buttons to copy current business defaults into this draft.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
              <div className="mt-3 grid gap-3 md:grid-cols-6">
                <div className="md:col-span-3">
                  {textField("terms", "Terms", { rows: 2 })}
                </div>
                <div className="md:col-span-3">
                  {textField("paymentInstructions", "Payment instructions", { rows: 2 })}
                </div>
                {textField("sellerBankName", "Bank name")}
                {textField("sellerBankAccountName", "Account holder")}
                {textField("sellerBankAccountNumber", "Bank account number")}
                {textField("sellerBankIfsc", "IFSC")}
                {textField("sellerUpiId", "UPI ID")}
              </div>
            </div>
          </section>

          <details className="group rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5 lg:col-span-2">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold [&::-webkit-details-marker]:hidden">
              Customize quotation headings
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition group-open:rotate-180"
              />
            </summary>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              These headings apply only to this quotation and its PDF.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(defaultQuotationHeadings) as QuotationHeadingKey[]).map(
                (key) => (
                  <label key={key} className="block text-xs font-medium">
                    {defaultQuotationHeadings[key]}
                    <input
                      className={inputClass}
                      value={headings[key]}
                      maxLength={60}
                      onChange={(event) =>
                        setHeadings((previous) => ({
                          ...previous,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <button
              type="button"
              className="mt-3 text-xs font-semibold text-[var(--brand)] underline"
              onClick={() => setHeadings({ ...defaultQuotationHeadings })}
            >
              Restore default headings
            </button>
          </details>

          {state.preview ? (
            <div role="status" className="lg:col-span-2">
              <Totals totals={state.preview} title="Calculated preview — not saved" />
              <LineBreakdown lines={state.preview.lines} />
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                If you change the form, preview again before saving.{" "}
                {state.preview.lines.length} line(s); suggested{" "}
                {state.preview.auto_treatment ?? "incomplete"}, final{" "}
                {state.preview.treatment ?? "incomplete"}.
              </p>
            </div>
          ) : null}
          {!isNew && quote.totals.total_minor !== null ? (
            <div className="lg:col-span-2">
              <Totals totals={quote.totals} title="Last saved totals" />
              <LineBreakdown lines={quote.lines} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <button
              type="submit"
              name="intent"
              value="preview"
              disabled={pending || buyerEditing || !customerId}
              className="rounded-xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold disabled:opacity-60"
            >
              Preview calculation
            </button>
            <button
              type="submit"
              name="intent"
              value="save"
              disabled={pending || buyerEditing || !customerId}
              className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Working…" : "Save draft"}
            </button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] lg:col-span-2">
            This is a private draft. Save it before sharing; a shared version becomes
            read-only.
          </p>
        </div>

        <aside className="h-fit min-w-0 space-y-3 lg:col-start-2 lg:row-start-1 lg:row-span-3">
          <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
                  <FileText aria-hidden="true" className="size-4" />
                </span>
                <p className="truncate text-xs font-bold text-[var(--ink)]">
                  Quotation draft
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">
                {quote.state === "draft" ? "Draft" : quote.state.replaceAll("_", " ")}
              </span>
            </div>
            <p className="mt-4 text-xs text-[var(--muted-foreground)]">Quotation ID</p>
            <p className="mt-1 break-all text-base font-bold leading-5 text-[var(--ink)]">
              {quote.reference}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Version {quote.version_number} · {quote.state.replaceAll("_", " ")}
            </p>
            <div className="mt-3">
              {state.preview ? (
                <>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Preview amount · not saved
                  </p>
                  <p className="mt-1 break-words text-xl font-bold tabular-nums text-[var(--ink)]">
                    {formatPaise(state.preview.total_minor)}
                  </p>
                </>
              ) : isNew || quote.totals.total_minor === null ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Amount not calculated
                </p>
              ) : (
                <>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Last saved amount
                  </p>
                  <p className="mt-1 break-words text-xl font-bold tabular-nums text-[var(--ink)]">
                    {formatPaise(quote.totals.total_minor)}
                  </p>
                </>
              )}
            </div>
            {isNew && !customerId ? (
              <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                Choose a customer and add your items to get started.
              </p>
            ) : missingForShare.length ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <p className="font-semibold">Complete these details before sharing</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 leading-5">
                  {missingForShare.map((blocker) => (
                    <li key={`${blocker.target}-${blocker.label}`}>
                      <a
                        className="underline"
                        href={`#${blocker.target}`}
                        onClick={() => {
                          document
                            .getElementById(blocker.target)
                            ?.closest("details")
                            ?.setAttribute("open", "");
                        }}
                      >
                        {blocker.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
                Required details are complete. Save any changes before sharing.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--ink)]">Progress</h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {completedSteps} of {progressSteps.length} complete
                </p>
              </div>
              <span className="grid size-10 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
                <CheckCircle2 aria-hidden="true" className="size-5" />
              </span>
            </div>
            <ol className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
              {progressSteps.map((step) => (
                <li className="flex items-start gap-2.5 text-sm" key={step.label}>
                  {step.complete ? (
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
                    />
                  ) : (
                    <Circle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]"
                    />
                  )}
                  <span
                    className={
                      step.complete ? "text-[var(--ink)]" : "text-[var(--muted-foreground)]"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl bg-[var(--canvas)]/80 p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                <Lightbulb aria-hidden="true" className="size-4" />
              </span>
              <h2 className="text-sm font-bold text-[var(--ink)]">Tips</h2>
            </div>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-[var(--muted-foreground)]">
              <li>Customer details are copied from their master record.</li>
              <li>Add at least one product or service under Item Description.</li>
              <li>Set the correct tax and place of supply for accurate calculations.</li>
              <li>You can edit terms and payment details before sharing.</li>
            </ul>
          </section>
        </aside>
      </div>
    </form>
  );
}
