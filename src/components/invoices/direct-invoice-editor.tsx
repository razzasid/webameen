"use client";

import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatPaise,
  paiseToRupees,
  rupeesToPaise,
} from "@/server/modules/catalog/validation";
import {
  createDirectInvoiceAction,
  type DirectInvoiceActionState,
} from "@/server/modules/invoices/actions";
import type {
  InvoiceCatalogChoice,
  InvoiceCustomerChoice,
  InvoiceNumberPeriod,
} from "@/server/modules/invoices/queries";
import type {
  DirectInvoiceLineInput,
  DirectInvoiceSnapshotInput,
} from "@/server/modules/invoices/validation";

type BusinessProfile = {
  id: string;
  display_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  postal_address: string | null;
  state_code: string | null;
  gst_registered: boolean | null;
  gstin: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  payment_instructions: string | null;
  default_terms: string | null;
  time_zone: string;
};

type Props = {
  customers: InvoiceCustomerChoice[];
  catalog: InvoiceCatalogChoice[];
  rates: string[];
  business: BusinessProfile;
  periods: InvoiceNumberPeriod[];
  requestKey: string;
  initialCustomerId?: string;
};

function createInitialLine(): DirectInvoiceLineInput {
  return {
    clientId: crypto.randomUUID(),
    sourceCatalogItemId: "",
    description: "",
    unitLabel: "units",
    hsnSac: "",
    quantity: "1",
    unitPriceRupees: "0",
    gstCategory: "taxable",
    gstRate: "18",
  };
}

export function DirectInvoiceEditor({
  customers,
  catalog,
  rates,
  business,
  periods,
  requestKey,
  initialCustomerId,
}: Props) {
  const [state, formAction, isPending] = useActionState<DirectInvoiceActionState, FormData>(
    createDirectInvoiceAction,
    {},
  );

  const initialCustomer = useMemo(() => {
    if (initialCustomerId) {
      const match = customers.find((c) => c.id === initialCustomerId);
      if (match) return match;
    }
    return customers.length === 1 ? (customers[0] ?? null) : null;
  }, [customers, initialCustomerId]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomer?.id ?? "",
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const todayIso = useMemo(() => {
    try {
      const now = new Date();
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: business.time_zone || "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, [business.time_zone]);

  const [dueOn, setDueOn] = useState("");
  const [terms, setTerms] = useState(business.default_terms ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState(
    business.payment_instructions ?? "",
  );
  const [gstTreatmentOverride, setGstTreatmentOverride] = useState<
    "" | "cgst_sgst" | "igst"
  >("");

  // Bank details state
  const [bankName, setBankName] = useState(business.bank_name ?? "");
  const [bankAccountName, setBankAccountName] = useState(business.bank_account_name ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(
    business.bank_account_number ?? "",
  );
  const [bankIfsc, setBankIfsc] = useState(business.bank_ifsc ?? "");
  const [upiId, setUpiId] = useState(business.upi_id ?? "");

  // Customer editable fields on document snapshot
  const [buyerDisplayName, setBuyerDisplayName] = useState(
    initialCustomer?.display_name ?? "",
  );
  const [buyerContactName, setBuyerContactName] = useState(
    initialCustomer?.contact_name ?? "",
  );
  const [buyerEmail, setBuyerEmail] = useState(initialCustomer?.email ?? "");
  const [buyerPhone, setBuyerPhone] = useState(initialCustomer?.phone ?? "");
  const [buyerBillingAddress, setBuyerBillingAddress] = useState(
    initialCustomer?.billing_address ?? "",
  );
  const [buyerStateCode, setBuyerStateCode] = useState(initialCustomer?.state_code ?? "");
  const [buyerGstinApplicable, setBuyerGstinApplicable] = useState(
    Boolean(initialCustomer?.gstin_applicable),
  );
  const [buyerGstin, setBuyerGstin] = useState(initialCustomer?.gstin ?? "");

  // Place of supply
  const [placeOfSupplyApplicable, setPlaceOfSupplyApplicable] = useState(false);
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState(
    initialCustomer?.state_code ?? "",
  );
  const [reverseChargeApplies, setReverseChargeApplies] = useState(false);

  // Line items state
  const [lines, setLines] = useState<DirectInvoiceLineInput[]>([createInitialLine()]);

  // When customer changes, populate buyer snapshot defaults
  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    const cust = customers.find((c) => c.id === customerId);
    if (cust) {
      setBuyerDisplayName(cust.display_name);
      setBuyerContactName(cust.contact_name ?? "");
      setBuyerEmail(cust.email ?? "");
      setBuyerPhone(cust.phone ?? "");
      setBuyerBillingAddress(cust.billing_address ?? "");
      setBuyerStateCode(cust.state_code ?? "");
      setBuyerGstinApplicable(Boolean(cust.gstin_applicable));
      setBuyerGstin(cust.gstin ?? "");
      if (cust.state_code) {
        setPlaceOfSupplyStateCode(cust.state_code);
      }
    }
  }

  // Active seller state and buyer state for GST auto routing
  const sellerState = business.state_code ?? "";
  const buyerState = buyerStateCode || (selectedCustomer?.state_code ?? "");
  const autoTreatment =
    sellerState && buyerState ? (sellerState === buyerState ? "cgst_sgst" : "igst") : null;
  const effectiveTreatment = gstTreatmentOverride || autoTreatment;

  // Add line from catalog
  function handleAddCatalogItem(itemId: string) {
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    const newLine: DirectInvoiceLineInput = {
      clientId: crypto.randomUUID(),
      sourceCatalogItemId: item.id,
      description: item.name + (item.description ? `\n${item.description}` : ""),
      unitLabel: item.unit_label ?? "",
      hsnSac: item.hsn_sac ?? "",
      quantity: "1",
      unitPriceRupees: paiseToRupees(item.default_unit_price_minor ?? "0"),
      gstCategory: item.default_gst_category,
      gstRate: item.default_gst_rate ?? rates[0] ?? "18",
    };
    setLines((prev) => [...prev, newLine]);
  }

  function handleAddCustomLine() {
    setLines((prev) => [...prev, createInitialLine()]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleLineChange<K extends keyof DirectInvoiceLineInput>(
    index: number,
    field: K,
    val: DirectInvoiceLineInput[K],
  ) {
    setLines((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (current) {
        copy[index] = { ...current, [field]: val };
      }
      return copy;
    });
  }

  // Client-side financial calculation using exact integer paise arithmetic
  const calculatedTotals = useMemo(() => {
    let subtotalPaise = BigInt(0);
    let cgstPaise = BigInt(0);
    let sgstPaise = BigInt(0);
    let igstPaise = BigInt(0);

    const calculatedLines = lines.map((line, position) => {
      const qtyNum = Number(line.quantity);
      const validQty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 0;
      const unitPaise = rupeesToPaise(line.unitPriceRupees) ?? BigInt(0);

      // line_subtotal = floor(quantity * price + 0.5)
      const lineSubtotal = BigInt(Math.floor(validQty * Number(unitPaise) + 0.5));
      subtotalPaise += lineSubtotal;

      let lineCgst = BigInt(0);
      let lineSgst = BigInt(0);
      let lineIgst = BigInt(0);

      if (line.gstCategory === "taxable") {
        const rateNum = Number(line.gstRate);
        const validRate = Number.isFinite(rateNum) && rateNum >= 0 ? rateNum : 0;

        if (effectiveTreatment === "cgst_sgst") {
          const halfRate = validRate / 2;
          lineCgst = BigInt(Math.floor((Number(lineSubtotal) * halfRate) / 100 + 0.5));
          lineSgst = BigInt(Math.floor((Number(lineSubtotal) * halfRate) / 100 + 0.5));
          cgstPaise += lineCgst;
          sgstPaise += lineSgst;
        } else if (effectiveTreatment === "igst") {
          lineIgst = BigInt(Math.floor((Number(lineSubtotal) * validRate) / 100 + 0.5));
          igstPaise += lineIgst;
        }
      }

      const lineTotal = lineSubtotal + lineCgst + lineSgst + lineIgst;

      return {
        position: position + 1,
        lineSubtotal,
        lineCgst,
        lineSgst,
        lineIgst,
        lineTotal,
      };
    });

    const gstTotalPaise = cgstPaise + sgstPaise + igstPaise;
    const grandTotalPaise = subtotalPaise + gstTotalPaise;

    return {
      subtotalPaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      gstTotalPaise,
      grandTotalPaise,
      calculatedLines,
    };
  }, [lines, effectiveTreatment]);

  // Snapshot JSON prepared for server action
  const snapshotData: DirectInvoiceSnapshotInput = {
    sellerDisplayName: business.display_name,
    sellerContactEmail: business.contact_email ?? "",
    sellerContactPhone: business.contact_phone ?? "",
    sellerPostalAddress: business.postal_address ?? "",
    sellerStateCode: business.state_code ?? "",
    sellerGstRegistered: Boolean(business.gst_registered),
    sellerGstin: business.gstin ?? "",
    buyerDisplayName: buyerDisplayName || (selectedCustomer?.display_name ?? ""),
    buyerContactName: buyerContactName,
    buyerEmail: buyerEmail,
    buyerPhone: buyerPhone,
    buyerBillingAddress: buyerBillingAddress || (selectedCustomer?.billing_address ?? ""),
    buyerStateCode: buyerStateCode || (selectedCustomer?.state_code ?? ""),
    buyerGstinApplicable: buyerGstinApplicable,
    buyerGstin: buyerGstin,
    gstTreatmentOverride: gstTreatmentOverride,
    documentTimeZone: business.time_zone || "Asia/Kolkata",
    placeOfSupplyApplicable: placeOfSupplyApplicable,
    placeOfSupplyStateCode: placeOfSupplyStateCode,
    placeOfSupplyText: "",
    reverseChargeApplies: reverseChargeApplies,
    sellerBankName: bankName,
    sellerBankAccountName: bankAccountName,
    sellerBankAccountNumber: bankAccountNumber,
    sellerBankIfsc: bankIfsc,
    sellerUpiId: upiId,
    paymentInstructions: paymentInstructions,
    terms: terms,
  };

  const activePeriod = periods.find(
    (p) => p.starts_on <= todayIso && todayIso < p.ends_before,
  );
  const hasActivePeriod = Boolean(activePeriod);

  return (
    <form action={formAction} className="min-w-0 space-y-6">
      {/* Hidden fields for server action */}
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="customerId" value={selectedCustomerId} />
      <input type="hidden" name="dueOn" value={dueOn} />
      <input type="hidden" name="snapshotJson" value={JSON.stringify(snapshotData)} />
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

      {/* Top Banner & Alert Notices */}
      {!hasActivePeriod ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Invoice numbering period required</AlertTitle>
          <AlertDescription className="mt-1">
            {periods.length > 0 ? (
              <span>
                Your existing numbering period (<strong>{periods[0].period_key}</strong>:{" "}
                {periods[0].starts_on} to {periods[0].ends_before}) does not cover
                today&apos;s date (<strong>{todayIso}</strong>). Add or update an active
                sequence in{" "}
                <Link className="font-semibold underline" href="/settings">
                  Settings &gt; Invoice Numbering
                </Link>{" "}
                before issuing invoices.
              </span>
            ) : (
              <span>
                No invoice numbering sequence has been configured. Configure one in{" "}
                <Link className="font-semibold underline" href="/settings">
                  Settings &gt; Invoice Numbering
                </Link>{" "}
                before issuing direct invoices.
              </span>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Invoice creation issue</AlertTitle>
          <AlertDescription className="mt-1">{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state.previewed ? (
        <Alert className="border-[#d9eee5] bg-[#eaf6f1] text-[#176b4c]">
          <CheckCircle2 className="size-4 text-[var(--success)]" />
          <AlertTitle className="font-semibold text-[var(--success)]">
            Server calculations verified
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs text-[#176b4c]">
            All monetary amounts, GST rates, and party validations have been verified by the
            financial engine.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Primary Invoice Document Sheet - Styled after Reference Image */}
      <div className="relative mx-auto w-full max-w-4xl min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-10">
        {/* Document Header Section */}
        <header className="grid grid-cols-1 gap-6 border-b border-[var(--line)] pb-8 sm:grid-cols-12 sm:gap-8">
          {/* Left: Business Branding / Logo & Name */}
          <div className="sm:col-span-6 flex flex-col justify-start">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[var(--ink)] font-bold text-xl text-amber-400 shadow-sm">
                {business.display_name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold uppercase tracking-tight text-[var(--ink)] sm:text-2xl">
                  {business.display_name}
                </h2>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                  Business invoice
                </p>
              </div>
            </div>

            {business.gst_registered ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--paper)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--ink)]">GSTIN:</span>
                <span className="font-mono font-semibold">{business.gstin ?? "—"}</span>
              </div>
            ) : null}
          </div>

          {/* Right: Business Contact Details with Yellow Accent Bar (Reference Image Style) */}
          <div className="sm:col-span-6 flex items-stretch justify-start sm:justify-end">
            <div className="flex items-start gap-4 border-l-4 border-amber-400 pl-4 sm:pl-5">
              <div className="space-y-1.5 text-xs text-[var(--muted-foreground)]">
                {business.contact_phone ? (
                  <p className="flex items-center gap-2 font-medium text-[var(--ink)]">
                    <Phone className="size-3.5 text-amber-500 shrink-0" />
                    <span>{business.contact_phone}</span>
                  </p>
                ) : null}
                {business.contact_email ? (
                  <p className="flex items-center gap-2">
                    <Mail className="size-3.5 text-amber-500 shrink-0" />
                    <span>{business.contact_email}</span>
                  </p>
                ) : null}
                <p className="flex items-start gap-2">
                  <MapPin className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="max-w-[220px]">
                    {business.postal_address || "Address not provided"}
                    {business.state_code ? ` · State ${business.state_code}` : ""}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Middle Metadata Section (Customer "To" + Dark INVOICE Bar with Total Due) */}
        <section className="grid grid-cols-1 gap-6 pt-6 pb-6 sm:grid-cols-12 sm:gap-8 border-b border-[var(--line)]">
          {/* Left: Customer Selection & Details */}
          <div className="sm:col-span-6 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Bill To
              </Label>
              {selectedCustomer ? (
                <button
                  type="button"
                  onClick={() => setSelectedCustomerId("")}
                  className="text-xs font-medium text-[var(--brand)] hover:underline"
                >
                  Change customer
                </button>
              ) : null}
            </div>

            {!selectedCustomer ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] p-4 bg-[var(--paper)]">
                <p className="text-xs text-[var(--muted-foreground)] mb-2">
                  Select an existing customer from your directory:
                </p>
                <select
                  aria-label="Select Customer"
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                >
                  <option value="">— Select customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name} {c.state_code ? `(${c.state_code})` : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)]">New customer?</span>
                  <Link
                    href="/customers/new"
                    target="_blank"
                    className="font-semibold text-[var(--brand)] hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="size-3" /> Add customer
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ink)] uppercase tracking-wide">
                      {buyerDisplayName || selectedCustomer.display_name}
                    </h3>
                    {buyerContactName ? (
                      <p className="text-xs font-medium text-[var(--muted-foreground)]">
                        Attn: {buyerContactName}
                      </p>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded bg-[#e2f2eb] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
                    <UserCheck className="size-3" /> Active
                  </span>
                </div>

                <div className="text-xs text-[var(--muted-foreground)] space-y-1 pt-1">
                  {buyerPhone ? (
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3 shrink-0" /> {buyerPhone}
                    </p>
                  ) : null}
                  {buyerEmail ? (
                    <p className="flex items-center gap-1.5">
                      <Mail className="size-3 shrink-0" /> {buyerEmail}
                    </p>
                  ) : null}
                  <div className="flex items-start gap-1.5">
                    <MapPin className="size-3 shrink-0 mt-0.5" />
                    <span>
                      {buyerBillingAddress || "No billing address set"}
                      {buyerStateCode ? ` · State ${buyerStateCode}` : ""}
                    </span>
                  </div>
                  {buyerGstinApplicable ? (
                    <p className="pt-1 font-mono text-[11px] font-medium text-[var(--ink)]">
                      GSTIN: {buyerGstin || "Not provided"}
                    </p>
                  ) : (
                    <p className="pt-1 text-[11px] text-[var(--muted-foreground)]">
                      Not GST registered
                    </p>
                  )}
                </div>

                {!buyerBillingAddress ? (
                  <div className="mt-2 pt-2 border-t border-[var(--line)]">
                    <Label className="text-[11px] text-[var(--danger)] font-medium">
                      Billing address is required for invoicing:
                    </Label>
                    <Input
                      placeholder="Enter billing address..."
                      className="mt-1 h-8 text-xs"
                      value={buyerBillingAddress}
                      onChange={(e) => setBuyerBillingAddress(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Right: Sleek INVOICE Header Banner & Prominent TOTAL DUE */}
          <div className="sm:col-span-6 flex flex-col justify-between space-y-4">
            <div className="rounded-xl border border-[var(--ink)] overflow-hidden">
              {/* Reference Image Dark Bar Banner */}
              <div className="bg-[#17251f] text-white px-4 py-2 flex items-center justify-between">
                <span className="font-extrabold tracking-widest text-base sm:text-lg">
                  INVOICE
                </span>
                <span className="text-[11px] font-mono tracking-wider opacity-80">
                  {activePeriod ? `PERIOD: ${activePeriod.period_key}` : "UNCONFIGURED"}
                </span>
              </div>

              <div className="p-4 bg-white space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)] font-medium">
                    INVOICE DATE:
                  </span>
                  <span className="font-bold text-[var(--ink)] font-mono">{todayIso}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <Label
                    htmlFor="dueOnInput"
                    className="text-[var(--muted-foreground)] font-medium"
                  >
                    DUE DATE:
                  </Label>
                  <Input
                    id="dueOnInput"
                    type="date"
                    min={todayIso}
                    value={dueOn}
                    onChange={(e) => setDueOn(e.target.value)}
                    className="h-8 w-36 text-xs text-right font-mono"
                  />
                </div>

                <div className="pt-3 border-t border-[var(--line)] flex items-baseline justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted-foreground)]">
                    TOTAL DUE:
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-[var(--ink)] tabular-nums tracking-tight">
                    ₹{formatPaise(calculatedTotals.grandTotalPaise.toString())}
                  </span>
                </div>
              </div>
            </div>

            {/* GST Auto / Manual Treatment Indicator */}
            <div className="flex items-center justify-between rounded-lg bg-[var(--paper)] px-3 py-2 text-xs">
              <span className="text-[var(--muted-foreground)]">GST Treatment:</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--ink)] uppercase">
                  {effectiveTreatment === "cgst_sgst"
                    ? "CGST + SGST (Intra-state)"
                    : effectiveTreatment === "igst"
                      ? "IGST (Inter-state)"
                      : "Pending selection"}
                </span>
                <select
                  aria-label="Override GST route"
                  value={gstTreatmentOverride}
                  onChange={(e) =>
                    setGstTreatmentOverride(e.target.value as "" | "cgst_sgst" | "igst")
                  }
                  className="rounded border border-[var(--line)] bg-white px-2 py-0.5 text-[11px]"
                >
                  <option value="">Auto</option>
                  <option value="cgst_sgst">CGST+SGST</option>
                  <option value="igst">IGST</option>
                </select>
              </div>
            </div>

            {/* Place of supply & Reverse charge options */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[var(--muted-foreground)]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={placeOfSupplyApplicable}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPlaceOfSupplyApplicable(checked);
                    if (checked && !placeOfSupplyStateCode && buyerState) {
                      setPlaceOfSupplyStateCode(buyerState);
                    }
                  }}
                  className="rounded border-[var(--line)] text-[var(--brand)] focus:ring-[var(--ring)]"
                />
                <span>Specify place of supply</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reverseChargeApplies}
                  onChange={(e) => setReverseChargeApplies(e.target.checked)}
                  className="rounded border-[var(--line)] text-[var(--brand)] focus:ring-[var(--ring)]"
                />
                <span>Reverse charge applies</span>
              </label>
            </div>
          </div>
        </section>

        {/* Invoice Items Table (Reference Image Layout: DESCRIPTION | PRICE | QTY | TOTAL) */}
        <section className="pt-6 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              Invoice Items
            </h3>
            <div className="flex items-center gap-2">
              {catalog.length ? (
                <div className="relative">
                  <select
                    aria-label="Add from catalog"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddCatalogItem(e.target.value);
                      }
                    }}
                    className="h-8 rounded-lg border border-[var(--line)] bg-white px-2.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--paper)] focus:outline-none"
                  >
                    <option value="">+ From catalog...</option>
                    {catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({formatPaise(item.default_unit_price_minor ?? "0")})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCustomLine}
                className="h-8 text-xs gap-1"
              >
                <Plus className="size-3" /> Add manual item
              </Button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--ink)] bg-[var(--paper)] font-bold uppercase tracking-wider text-[var(--ink)]">
                  <th scope="col" className="py-3 px-3 w-[45%]">
                    Description
                  </th>
                  <th scope="col" className="py-3 px-3 text-right w-[18%]">
                    Price (₹)
                  </th>
                  <th scope="col" className="py-3 px-3 text-center w-[14%]">
                    Qty
                  </th>
                  <th scope="col" className="py-3 px-3 text-right w-[18%]">
                    Total (₹)
                  </th>
                  <th scope="col" className="py-3 px-2 w-[5%] text-center">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] bg-white">
                {lines.map((line, idx) => {
                  const lineCalc = calculatedTotals.calculatedLines[idx];
                  return (
                    <tr key={line.clientId} className="group hover:bg-[var(--paper)]/50">
                      {/* Description column with item name, HSN/SAC, GST Category & Rate */}
                      <td className="p-3 align-top">
                        <Input
                          placeholder="Item name / description..."
                          value={line.description}
                          onChange={(e) =>
                            handleLineChange(idx, "description", e.target.value)
                          }
                          className="h-8 text-xs font-medium text-[var(--ink)]"
                          required
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Input
                            placeholder="HSN/SAC (opt)"
                            value={line.hsnSac}
                            onChange={(e) =>
                              handleLineChange(idx, "hsnSac", e.target.value)
                            }
                            className="h-7 w-28 text-[11px]"
                          />
                          <select
                            aria-label={`Line ${idx + 1} GST Category`}
                            value={line.gstCategory}
                            onChange={(e) =>
                              handleLineChange(
                                idx,
                                "gstCategory",
                                e.target.value as "taxable" | "exempt" | "no_gst",
                              )
                            }
                            className="h-7 rounded border border-[var(--line)] bg-white px-2 text-[11px]"
                          >
                            <option value="taxable">Taxable</option>
                            <option value="exempt">Exempt</option>
                            <option value="no_gst">No GST</option>
                          </select>
                          {line.gstCategory === "taxable" ? (
                            <select
                              aria-label={`Line ${idx + 1} GST Rate`}
                              value={line.gstRate}
                              onChange={(e) =>
                                handleLineChange(idx, "gstRate", e.target.value)
                              }
                              className="h-7 rounded border border-[var(--line)] bg-white px-2 text-[11px] font-mono"
                            >
                              {rates.map((rate) => (
                                <option key={rate} value={rate}>
                                  {rate}% GST
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </td>

                      {/* Price column */}
                      <td className="p-3 align-top text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Line ${idx + 1} Price in Rupees`}
                          value={line.unitPriceRupees}
                          onChange={(e) =>
                            handleLineChange(idx, "unitPriceRupees", e.target.value)
                          }
                          className="h-8 text-xs text-right font-mono"
                          required
                        />
                      </td>

                      {/* Quantity & Unit column */}
                      <td className="p-3 align-top">
                        <Input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Line ${idx + 1} Quantity`}
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineChange(idx, "quantity", e.target.value)
                          }
                          className="h-8 text-xs text-center font-mono"
                          required
                        />
                        <Input
                          placeholder="unit"
                          value={line.unitLabel}
                          onChange={(e) =>
                            handleLineChange(idx, "unitLabel", e.target.value)
                          }
                          className="mt-1 h-6 text-center text-[10px]"
                        />
                      </td>

                      {/* Line Total Column */}
                      <td className="p-3 align-top text-right font-mono">
                        <p className="font-bold text-sm text-[var(--ink)] pt-1">
                          ₹{formatPaise(lineCalc?.lineTotal.toString() ?? "0")}
                        </p>
                        {line.gstCategory === "taxable" && lineCalc ? (
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            incl. ₹
                            {formatPaise(
                              (
                                lineCalc.lineCgst +
                                lineCalc.lineSgst +
                                lineCalc.lineIgst
                              ).toString(),
                            )}{" "}
                            tax
                          </p>
                        ) : null}
                      </td>

                      {/* Delete Action */}
                      <td className="p-3 align-top text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={lines.length <= 1}
                          onClick={() => handleRemoveLine(idx)}
                          className="text-[var(--muted-foreground)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Delete line</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom Section: Notes & Terms + Payment Info (Left) / Summary & Signature (Right) */}
        <footer className="grid grid-cols-1 gap-6 pt-6 border-t border-[var(--line)] sm:grid-cols-12 sm:gap-8">
          {/* Left Column: Terms, Notes, Bank Information & Courtesy Sign-off */}
          <div className="sm:col-span-7 space-y-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                Terms &amp; Conditions / Notes:
              </Label>
              <Textarea
                rows={3}
                placeholder="Payment due on receipt, delivery terms, warranty notes..."
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="mt-1.5 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                Payment Instructions:
              </Label>
              <Textarea
                rows={2}
                placeholder="Specific remittance notes, NEFT/RTGS instructions, or UPI note..."
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                className="mt-1.5 text-xs"
              />
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                <CreditCard className="size-3.5 text-amber-500" /> Payment Info
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">
                    Bank name
                  </span>
                  <Input
                    placeholder="Bank name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="h-7 text-xs bg-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">
                    Account holder name
                  </span>
                  <Input
                    placeholder="Account holder name"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    className="h-7 text-xs bg-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">
                    Account number
                  </span>
                  <Input
                    placeholder="Account number"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    className="h-7 text-xs font-mono bg-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">
                    IFSC code
                  </span>
                  <Input
                    placeholder="IFSC"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value)}
                    className="h-7 text-xs font-mono uppercase bg-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">
                    UPI ID
                  </span>
                  <Input
                    placeholder="UPI ID"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="h-7 text-xs font-mono bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Reference Image Sign-off */}
            <p className="pt-2 text-xs font-extrabold uppercase tracking-widest text-[var(--muted-foreground)]">
              Thank You For Your Business
            </p>
          </div>

          {/* Right Column: Financial Totals Breakdown & Signature Area */}
          <div className="sm:col-span-5 flex flex-col justify-between space-y-6">
            {/* Totals Table */}
            <div className="rounded-xl border border-[var(--line)] bg-white p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--muted-foreground)] font-medium">
                  Sub-Total:
                </span>
                <span className="font-semibold text-[var(--ink)] font-mono">
                  ₹{formatPaise(calculatedTotals.subtotalPaise.toString())}
                </span>
              </div>

              {effectiveTreatment === "cgst_sgst" ? (
                <>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[var(--muted-foreground)] font-medium">
                      CGST:
                    </span>
                    <span className="font-semibold text-[var(--ink)] font-mono">
                      ₹{formatPaise(calculatedTotals.cgstPaise.toString())}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[var(--muted-foreground)] font-medium">
                      SGST:
                    </span>
                    <span className="font-semibold text-[var(--ink)] font-mono">
                      ₹{formatPaise(calculatedTotals.sgstPaise.toString())}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between py-1">
                  <span className="text-[var(--muted-foreground)] font-medium">IGST:</span>
                  <span className="font-semibold text-[var(--ink)] font-mono">
                    ₹{formatPaise(calculatedTotals.igstPaise.toString())}
                  </span>
                </div>
              )}

              <div className="border-t-2 border-[var(--ink)] pt-2.5 flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  Grand Total:
                </span>
                <span className="text-xl font-black text-[var(--ink)] tabular-nums font-mono">
                  ₹{formatPaise(calculatedTotals.grandTotalPaise.toString())}
                </span>
              </div>
            </div>

            {/* Signature Area (Reference Image Style) */}
            <div className="pt-4 flex flex-col items-end text-right">
              <div className="w-40 border-b border-[var(--ink)] pb-1 mb-1">
                <p className="font-serif italic text-sm text-center text-slate-700">
                  {business.display_name}
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Authorized Signature
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Floating Action Controls Bar */}
      <div className="sticky bottom-4 z-10 mx-auto flex max-w-4xl items-center justify-between rounded-xl border border-[var(--line)] bg-white/95 p-4 shadow-lg backdrop-blur">
        <Button asChild variant="outline" type="button">
          <Link href="/invoices">Cancel</Link>
        </Button>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            name="intent"
            value="preview"
            variant="outline"
            disabled={isPending || !selectedCustomerId}
          >
            Preview totals
          </Button>

          <Button
            type="submit"
            name="intent"
            value="save"
            disabled={isPending || !selectedCustomerId || !hasActivePeriod}
            className="min-w-[140px] bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Issuing...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4 mr-2" />
                Create Invoice
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
