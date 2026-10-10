import Link from "next/link";
import { InvoicePaymentPanel } from "@/components/payments/invoice-payment-panel";
import { formatPaise } from "@/server/modules/catalog/validation";
import { getInvoice } from "@/server/modules/invoices/queries";
import { getInvoicePaymentSummary } from "@/server/modules/payments/queries";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  const paymentSummary = await getInvoicePaymentSummary(id);
  const issuedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: invoice.document_time_zone,
  }).format(new Date(invoice.issued_at));

  return (
    <section className="mx-auto max-w-5xl">
      <Link href="/invoices" className="text-sm font-medium text-[var(--brand)]">
        ← Invoices
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Issued invoice</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
            {invoice.reference}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Invoice date {invoice.invoice_date}
            {invoice.due_on ? ` · Due ${invoice.due_on}` : ""}
            {" · Issued "}
            {issuedAt} ({invoice.document_time_zone})
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">Total</p>
          <p className="text-2xl font-semibold">{formatPaise(invoice.total_minor)}</p>
          <p className="text-xs text-[var(--muted)]">{invoice.currency_code}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <h2 className="text-lg font-semibold">Approved source</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Quotation {invoice.quotation_id} · version {invoice.source_version_id} · approval
          evidence {invoice.approved_response_id}
        </p>
        <Link
          href={`/quotations/${invoice.quotation_id}`}
          className="mt-2 inline-block text-sm font-semibold text-[var(--brand)] underline"
        >
          Open quotation history
        </Link>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Number {invoice.sequence_number} from owner configured period “
          {invoice.numbering_period}”.
        </p>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-semibold">Seller snapshot</h2>
          <p className="mt-3 font-medium">{invoice.seller_display_name}</p>
          <p className="mt-1 whitespace-pre-line text-sm">
            {invoice.seller_postal_address}
          </p>
          <p className="mt-2 text-sm">
            {[invoice.seller_contact_email, invoice.seller_contact_phone]
              .filter(Boolean)
              .join(" · ") || "No contact details"}
          </p>
          <p className="mt-2 text-sm">
            State {invoice.seller_state_code} · GST registered:{" "}
            {invoice.seller_gst_registered ? "Yes" : "No"}
          </p>
          {invoice.seller_gstin ? (
            <p className="mt-1 text-sm">GSTIN {invoice.seller_gstin}</p>
          ) : null}
          {invoice.seller_logo_asset_key ? (
            <p className="mt-2 break-all text-xs text-[var(--muted)]">
              Captured logo asset: {invoice.seller_logo_asset_key}
            </p>
          ) : null}
          {invoice.seller_signature_asset_key ? (
            <p className="mt-1 break-all text-xs text-[var(--muted)]">
              Captured signature asset: {invoice.seller_signature_asset_key}
            </p>
          ) : null}
        </section>
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-semibold">Customer snapshot</h2>
          <p className="mt-3 font-medium">{invoice.buyer_display_name}</p>
          {invoice.buyer_contact_name ? (
            <p className="mt-1 text-sm">{invoice.buyer_contact_name}</p>
          ) : null}
          <p className="mt-1 whitespace-pre-line text-sm">
            {invoice.buyer_billing_address}
          </p>
          <p className="mt-2 text-sm">
            {[invoice.buyer_email, invoice.buyer_phone].filter(Boolean).join(" · ") ||
              "No contact details"}
          </p>
          <p className="mt-2 text-sm">
            State {invoice.buyer_state_code}
            {invoice.buyer_gstin_applicable
              ? ` · GSTIN ${invoice.buyer_gstin ?? "not supplied"}`
              : ""}
          </p>
        </section>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-[var(--canvas)] text-xs text-[var(--muted)]">
            <tr>
              <th className="p-3">Approved line</th>
              <th>HSN/SAC</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>GST</th>
              <th className="text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--line)]">
                <td className="p-3">
                  <span className="font-medium">
                    {item.position}. {item.description}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {item.gst_category} · {item.gst_treatment}
                  </span>
                </td>
                <td>{item.hsn_sac ?? "—"}</td>
                <td>
                  {item.quantity} {item.unit_label}
                </td>
                <td>{formatPaise(item.unit_price_minor)}</td>
                <td>{item.gst_rate === null ? item.gst_category : `${item.gst_rate}%`}</td>
                <td className="p-3 text-right font-medium">
                  {formatPaise(item.line_total_minor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-semibold">Tax and supply</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Place of supply</dt>
              <dd>
                {invoice.place_of_supply_applicable
                  ? [invoice.place_of_supply_state_code, invoice.place_of_supply_text]
                      .filter(Boolean)
                      .join(" · ")
                  : "Not applicable"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Reverse charge</dt>
              <dd>{invoice.reverse_charge_applies ? "Applies" : "Does not apply"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>GST treatment</dt>
              <dd>
                {invoice.gst_treatment}
                {invoice.gst_treatment_override ? " (selected)" : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Taxable subtotal</dt>
              <dd>{formatPaise(invoice.taxable_subtotal_minor)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>CGST</dt>
              <dd>{formatPaise(invoice.cgst_total_minor)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>SGST</dt>
              <dd>{formatPaise(invoice.sgst_total_minor)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>IGST</dt>
              <dd>{formatPaise(invoice.igst_total_minor)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-2 font-semibold">
              <dt>Subtotal + GST</dt>
              <dd>{formatPaise(invoice.total_minor)}</dd>
            </div>
          </dl>
        </div>
        <div className="space-y-5">
          {invoice.seller_bank_name ||
          invoice.seller_upi_id ||
          invoice.payment_instructions ? (
            <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <h2 className="font-semibold">Payment details copied from approval</h2>
              {invoice.seller_bank_name ? (
                <p className="mt-3 text-sm">Bank: {invoice.seller_bank_name}</p>
              ) : null}
              {invoice.seller_bank_account_name ? (
                <p className="mt-1 text-sm">
                  Account name: {invoice.seller_bank_account_name}
                </p>
              ) : null}
              {invoice.seller_bank_account_number ? (
                <p className="mt-1 text-sm">
                  Account number: {invoice.seller_bank_account_number}
                </p>
              ) : null}
              {invoice.seller_bank_ifsc ? (
                <p className="mt-1 text-sm">IFSC: {invoice.seller_bank_ifsc}</p>
              ) : null}
              {invoice.seller_upi_id ? (
                <p className="mt-1 text-sm">UPI: {invoice.seller_upi_id}</p>
              ) : null}
              {invoice.payment_instructions ? (
                <p className="mt-3 whitespace-pre-line text-sm">
                  {invoice.payment_instructions}
                </p>
              ) : null}
            </div>
          ) : null}
          {invoice.terms ? (
            <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <h2 className="font-semibold">Approved terms</h2>
              <p className="mt-3 whitespace-pre-line text-sm">{invoice.terms}</p>
            </div>
          ) : null}
        </div>
      </section>
      <InvoicePaymentPanel invoiceId={invoice.id} summary={paymentSummary} />
      <p className="mt-5 text-center text-xs text-[var(--muted)]">
        This issued invoice is an immutable copy of the approved quotation. Corrections to
        recorded payments are retained in the payment history.
      </p>
    </section>
  );
}
