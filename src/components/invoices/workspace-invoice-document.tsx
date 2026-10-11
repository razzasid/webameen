import {
  Building2,
  CircleDollarSign,
  FileText,
  Landmark,
  type LucideIcon,
  MapPin,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { formatPaise } from "@/server/modules/catalog/validation";
import type { InvoiceDocument } from "@/server/modules/invoices/document-model";

type Props = { document: InvoiceDocument };

function formatQuantity(value: string) {
  const [integerPart = "0", fractionPart = ""] = value.split(".");
  let grouped = integerPart;
  try {
    grouped = BigInt(integerPart).toLocaleString("en-IN");
  } catch {
    // Keep the saved value visible if the quantity is not an integer string.
  }
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function lineTaxSummary(line: InvoiceDocument["lines"][number]) {
  const parts = [
    line.cgst_amount_minor !== "0" ? `CGST ${formatPaise(line.cgst_amount_minor)}` : null,
    line.sgst_amount_minor !== "0" ? `SGST ${formatPaise(line.sgst_amount_minor)}` : null,
    line.igst_amount_minor !== "0" ? `IGST ${formatPaise(line.igst_amount_minor)}` : null,
  ].filter(Boolean);
  return parts.length
    ? `${line.gst_rate ? `${line.gst_rate}% GST · ` : ""}${parts.join(" · ")}`
    : `${line.gst_category.replaceAll("_", " ")} · no GST`;
}

function stateDescription(code: string) {
  return `State ${code}`;
}

export function WorkspaceInvoiceDocument({ document }: Props) {
  const { seller, buyer, document: settings, totals, remittance } = document;
  const placeOfSupply = settings.place_of_supply_applicable
    ? (settings.place_of_supply_text ?? settings.place_of_supply_state_code ?? "Specified")
    : "Not specified";

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgb(15_45_36/4%)]">
      <header className="flex min-w-0 flex-col gap-4 border-b border-[var(--line)] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={FileText} tone="green" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--success)]">
              Tax invoice
            </p>
            <h2 className="mt-1 break-words text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">
              {document.reference}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)] sm:text-sm">
              Invoice date {formatDate(document.invoice_date)}
              {document.due_on ? ` · Due ${formatDate(document.due_on)}` : ""}
            </p>
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">
              Issued{" "}
              {new Intl.DateTimeFormat("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: settings.document_time_zone,
              }).format(new Date(document.issued_at))}
              {` (${settings.document_time_zone})`}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 self-start rounded-xl border border-[#d9eee5] bg-[#eaf6f1] px-3 py-2.5 sm:min-w-[190px] sm:justify-between sm:px-4 sm:py-3">
          <span className="min-w-0">
            <span className="block text-[11px] text-[var(--muted-foreground)]">
              Total due
            </span>
            <span className="mt-0.5 block break-words text-lg font-bold tabular-nums text-[var(--ink)]">
              {formatPaise(totals.total_minor)} {settings.currency_code}
            </span>
          </span>
          <CircleDollarSign
            aria-hidden="true"
            className="size-5 shrink-0 text-[var(--brand)]"
          />
        </div>
      </header>

      <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 sm:p-4">
        <PartyCard
          title="From"
          name={seller.display_name}
          address={seller.address}
          email={seller.email}
          phone={seller.phone}
          state={stateDescription(seller.state_code)}
          gst={
            seller.gst_registered ? `GSTIN ${seller.gstin ?? "—"}` : "Not GST registered"
          }
          seller
        />
        <PartyCard
          title="Bill to"
          name={buyer.display_name}
          contactName={buyer.contact_name}
          address={buyer.billing_address}
          email={buyer.email}
          phone={buyer.phone}
          state={stateDescription(buyer.state_code)}
          gst={
            buyer.gstin_applicable ? `GSTIN ${buyer.gstin ?? "not supplied"}` : "No GSTIN"
          }
        />
      </div>

      <section className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
        <SectionHeading icon={ReceiptText} title="Items" />
        {document.lines.length ? (
          <>
            <div className="mt-3 space-y-3 sm:hidden">
              {document.lines.map((line) => (
                <article
                  className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3.5"
                  key={`${line.position}-${line.description}`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                        Item {line.position}
                      </p>
                      <h3 className="mt-1 break-words text-sm font-semibold text-[var(--ink)]">
                        {line.description}
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                        {line.unit_label || "—"}
                        {line.hsn_sac ? ` · HSN/SAC ${line.hsn_sac}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-bold tabular-nums text-[var(--ink)]">
                      {formatPaise(line.line_total_minor)}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--line)] pt-3 text-xs">
                    <p>
                      <span className="block text-[var(--muted-foreground)]">Quantity</span>
                      <span className="mt-0.5 block font-medium tabular-nums">
                        {formatQuantity(line.quantity)} {line.unit_label}
                      </span>
                    </p>
                    <p>
                      <span className="block text-[var(--muted-foreground)]">
                        Unit price
                      </span>
                      <span className="mt-0.5 block font-medium tabular-nums">
                        {formatPaise(line.unit_price_minor)}
                      </span>
                    </p>
                    <p>
                      <span className="block text-[var(--muted-foreground)]">GST</span>
                      <span className="mt-0.5 block font-medium">
                        {line.gst_rate
                          ? `${line.gst_rate}%`
                          : line.gst_category.replaceAll("_", " ")}
                      </span>
                    </p>
                    <p>
                      <span className="block text-[var(--muted-foreground)]">
                        Tax summary
                      </span>
                      <span className="mt-0.5 block break-words font-medium">
                        {lineTaxSummary(line)}
                      </span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-[var(--line)] sm:block">
              <table className="w-full min-w-[740px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-[#eef6f2] text-left text-xs text-[var(--muted-foreground)]">
                    {[
                      "#",
                      "Description",
                      "HSN / SAC",
                      "Quantity",
                      "Unit price (₹)",
                      "GST",
                      "Line total (₹)",
                    ].map((heading, index) => (
                      <th
                        className={`px-3 py-2.5 font-semibold first:rounded-tl-lg last:rounded-tr-lg ${index >= 3 ? "text-right" : ""}`}
                        key={heading}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {document.lines.map((line) => (
                    <tr className="align-top" key={`${line.position}-${line.description}`}>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-[var(--muted-foreground)]">
                        {line.position}
                      </td>
                      <td className="max-w-xs border-b border-[var(--line)] px-3 py-3">
                        <p className="break-words font-semibold text-[var(--ink)]">
                          {line.description}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                          {line.unit_label || "—"}
                        </p>
                        <p className="mt-1.5 max-w-sm text-xs leading-5 text-[var(--muted-foreground)]">
                          Taxable {formatPaise(line.taxable_amount_minor)} ·{" "}
                          {lineTaxSummary(line)}
                        </p>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-[var(--muted-foreground)]">
                        {line.hsn_sac ?? "—"}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-right tabular-nums">
                        {formatQuantity(line.quantity)}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-right tabular-nums">
                        {formatPaise(line.unit_price_minor)}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-right tabular-nums">
                        {line.gst_rate ? `${line.gst_rate}%` : "—"}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-right font-semibold tabular-nums">
                        {formatPaise(line.line_total_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-xl bg-[var(--paper)] p-4 text-sm text-[var(--muted-foreground)]">
            This invoice has no item lines.
          </p>
        )}
      </section>

      <div className="grid min-w-0 gap-3 border-t border-[var(--line)] p-3 sm:grid-cols-2 sm:p-4">
        <section className="min-w-0 rounded-xl border border-[var(--line)] p-3.5 sm:p-4">
          <SectionHeading icon={MapPin} title="Supply and tax" compact />
          <dl className="mt-3 space-y-0.5 text-xs sm:text-sm">
            <InfoRow label="Place of supply" value={placeOfSupply} />
            <InfoRow
              label="Reverse charge"
              value={settings.reverse_charge_applies ? "Applies" : "Does not apply"}
            />
            <InfoRow
              label="Price basis"
              value={settings.price_tax_mode.replaceAll("_", " ")}
            />
            <InfoRow
              label="Tax treatment"
              value={settings.gst_treatment.replaceAll("_", " ")}
            />
          </dl>
        </section>

        <section className="min-w-0 rounded-xl border border-[var(--line)] p-3.5 sm:p-4">
          <SectionHeading icon={CircleDollarSign} title="Totals" compact />
          <dl className="mt-3 space-y-1.5 text-xs sm:text-sm">
            <TotalRow
              label="Subtotal"
              value={totals.subtotal_minor}
              currency={settings.currency_code}
            />
            <TotalRow
              label="Taxable subtotal"
              value={totals.taxable_subtotal_minor}
              currency={settings.currency_code}
            />
            <TotalRow
              label="CGST"
              value={totals.cgst_total_minor}
              currency={settings.currency_code}
            />
            <TotalRow
              label="SGST"
              value={totals.sgst_total_minor}
              currency={settings.currency_code}
            />
            <TotalRow
              label="IGST"
              value={totals.igst_total_minor}
              currency={settings.currency_code}
            />
            <TotalRow
              label="GST total"
              value={totals.gst_total_minor}
              currency={settings.currency_code}
            />
            <div className="mt-3 flex min-w-0 items-center justify-between gap-3 rounded-lg bg-[#e7f5ef] px-3 py-2.5 font-bold text-[var(--ink)]">
              <dt>Invoice total</dt>
              <dd className="text-right tabular-nums">
                {formatPaise(totals.total_minor)} {settings.currency_code}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {hasRemittance(remittance) ? (
        <section className="border-t border-[var(--line)] p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <IconTile icon={Landmark} tone="green" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-[var(--ink)]">Payment details</h3>
              <dl className="mt-2 grid min-w-0 gap-x-6 text-xs sm:grid-cols-2 sm:text-sm">
                <div className="min-w-0 space-y-0.5">
                  {remittance.bank_name ? (
                    <InfoRow label="Bank" value={remittance.bank_name} />
                  ) : null}
                  {remittance.bank_account_name ? (
                    <InfoRow label="Account name" value={remittance.bank_account_name} />
                  ) : null}
                  {remittance.bank_account_number ? (
                    <InfoRow
                      label="Account number"
                      value={remittance.bank_account_number}
                    />
                  ) : null}
                </div>
                <div className="min-w-0 space-y-0.5">
                  {remittance.bank_ifsc ? (
                    <InfoRow label="IFSC" value={remittance.bank_ifsc} />
                  ) : null}
                  {remittance.upi_id ? (
                    <InfoRow label="UPI ID" value={remittance.upi_id} />
                  ) : null}
                  {remittance.payment_instructions ? (
                    <p className="whitespace-pre-line py-1 text-[var(--muted-foreground)]">
                      {remittance.payment_instructions}
                    </p>
                  ) : null}
                </div>
              </dl>
            </div>
          </div>
        </section>
      ) : null}

      {settings.terms ? (
        <section className="border-t border-[var(--line)] p-4 sm:p-5">
          <SectionHeading icon={FileText} title="Terms" compact />
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--muted-foreground)]">
            {settings.terms}
          </p>
        </section>
      ) : null}
    </section>
  );
}

function PartyCard({
  title,
  name,
  contactName,
  address,
  email,
  phone,
  state,
  gst,
  seller = false,
}: {
  title: string;
  name: string;
  contactName?: string | null;
  address: string;
  email: string | null;
  phone: string | null;
  state: string;
  gst: string;
  seller?: boolean;
}) {
  return (
    <section className="flex min-w-0 gap-3 rounded-xl border border-[#e2e9f3] bg-[#f7f9fc] p-3 sm:p-4">
      <IconTile icon={Building2} tone="green" />
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-medium text-[var(--muted-foreground)]">{title}</h3>
        <p className="mt-1 break-words text-sm font-bold text-[var(--ink)]">
          {name || "—"}
        </p>
        {contactName ? (
          <p className="mt-0.5 break-words text-xs text-[var(--ink)]">{contactName}</p>
        ) : null}
        <p className="mt-1 whitespace-pre-line break-words text-xs leading-5 text-[var(--ink)]">
          {address || "—"}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
          {email ? <span className="break-all">{email}</span> : null}
          {phone ? <span className="break-words">{phone}</span> : null}
        </div>
        <p className="mt-2 break-words text-[11px] leading-4 text-[var(--muted-foreground)]">
          {state} <span aria-hidden="true">·</span> {gst}
        </p>
        {seller ? (
          <Link
            href="/settings"
            className="mt-2 inline-flex min-h-8 items-center rounded-md border border-[var(--line)] bg-white px-2.5 text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Edit business details
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: "green" | "blue" }) {
  const colorClass =
    tone === "blue" ? "bg-[#e5f0fb] text-[#315b8a]" : "bg-[#e2f3eb] text-[var(--brand)]";
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-xl sm:size-10 ${colorClass}`}
    >
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${compact ? "" : "px-1"}`}>
      <IconTile icon={Icon} tone="green" />
      <h2 className="min-w-0 text-sm font-semibold text-[var(--ink)]">{title}</h2>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[var(--muted-foreground)]">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-[var(--ink)]">
        {value}
      </dd>
    </div>
  );
}

function TotalRow({
  label,
  value,
  currency,
}: {
  label: string;
  value: string;
  currency: string;
}) {
  return (
    <div className="flex min-w-0 justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-right tabular-nums text-[var(--ink)]">
        {formatPaise(value)} {currency}
      </dd>
    </div>
  );
}

function hasRemittance(remittance: InvoiceDocument["remittance"]) {
  return Boolean(
    remittance.bank_name ||
      remittance.bank_account_name ||
      remittance.bank_account_number ||
      remittance.bank_ifsc ||
      remittance.upi_id ||
      remittance.payment_instructions,
  );
}
