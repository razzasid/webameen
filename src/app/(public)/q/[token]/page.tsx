import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicResponseForm } from "@/components/quotations/public-response-form";
import { formatPaise } from "@/server/modules/catalog/validation";
import {
  type PublicQuotation,
  readPublicQuotation,
} from "@/server/modules/quotations/public-broker";
import { allowPublicQuotationRequest } from "@/server/modules/quotations/rate-limit";
import { hashQuotationToken } from "@/server/modules/quotations/token";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicQuotationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHashHex = hashQuotationToken(token);
  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client";
  if (!tokenHashHex || !allowPublicQuotationRequest(clientAddress, "read")) notFound();
  const { data, error } = await readPublicQuotation(tokenHashHex);
  if (error || !data) notFound();
  const quote = data as unknown as PublicQuotation;
  const canRespond =
    quote.state === "shared" &&
    !quote.response_deadline_passed &&
    !quote.revision_in_preparation &&
    !quote.response;
  const seller = quote.seller;
  const buyer = quote.buyer;
  const document = quote.document;
  const totals = quote.totals;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 sm:py-16">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[var(--brand)] font-bold text-white">
          W
        </span>
        <span className="text-lg font-semibold">Webameen</span>
      </div>
      <article className="rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div>
            <p className="text-sm text-[var(--muted)]">Quotation {quote.reference}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
              {String(seller.display_name ?? "")}
            </h1>
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted)]">
              {String(seller.address ?? "")}
            </p>
            {seller.email ? <p className="mt-1 text-sm">{String(seller.email)}</p> : null}
            {seller.phone ? <p className="mt-1 text-sm">{String(seller.phone)}</p> : null}
            {seller.gst_registered ? (
              <p className="mt-1 text-sm">GSTIN: {String(seller.gstin ?? "")}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-sm text-[var(--muted)]">Version {quote.version_number}</p>
            <p className="mt-1 text-sm capitalize">{quote.state.replaceAll("_", " ")}</p>
            {quote.valid_until ? (
              <p className="mt-2 text-sm">Valid through {quote.valid_until}</p>
            ) : null}
            <a
              href={`/q/${token}/pdf`}
              className="mt-3 inline-block rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
            >
              Download PDF
            </a>
          </div>
        </div>

        <section className="mt-6 rounded-2xl bg-[var(--mint)] p-4">
          <h2 className="font-semibold">Prepared for {String(buyer.display_name ?? "")}</h2>
          {buyer.contact_name ? (
            <p className="mt-1 text-sm">{String(buyer.contact_name)}</p>
          ) : null}
          <p className="mt-1 whitespace-pre-line text-sm">
            {String(buyer.billing_address ?? "")}
          </p>
          {buyer.email ? <p className="mt-1 text-sm">{String(buyer.email)}</p> : null}
          {buyer.phone ? <p className="mt-1 text-sm">{String(buyer.phone)}</p> : null}
          {buyer.gstin_applicable ? (
            <p className="mt-1 text-sm">GSTIN: {String(buyer.gstin ?? "")}</p>
          ) : null}
        </section>

        {quote.revision_in_preparation ? (
          <p
            role="status"
            className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            The business is preparing a revised quotation. This earlier version is shown for
            reference and cannot receive a response.
          </p>
        ) : quote.response_deadline_passed && !quote.response ? (
          <p
            role="status"
            className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            The response period has ended. This quotation remains available for viewing.
          </p>
        ) : quote.response ? (
          <p
            role="status"
            className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
          >
            Response recorded: {quote.response.kind.replaceAll("_", " ")} on{" "}
            {new Date(quote.response.responded_at).toLocaleString("en-IN", {
              timeZone: String(document.document_time_zone ?? "Asia/Kolkata"),
            })}
            .
          </p>
        ) : null}

        <div className="mt-7 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3 pr-3">Description</th>
                <th className="py-3 pr-3">Qty</th>
                <th className="py-3 pr-3">Unit price</th>
                <th className="py-3 pr-3">GST</th>
                <th className="py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={Number(line.position)} className="border-b border-[var(--line)]">
                  <td className="py-3 pr-3">
                    {String(line.description)}
                    {line.hsn_sac ? (
                      <small className="block text-[var(--muted)]">
                        HSN/SAC {String(line.hsn_sac)}
                      </small>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3">
                    {String(line.quantity)} {String(line.unit_label ?? "")}
                  </td>
                  <td className="py-3 pr-3">
                    {formatPaise(String(line.unit_price_minor))}
                  </td>
                  <td className="py-3 pr-3">
                    {String(line.gst_category)}
                    {line.gst_rate ? ` · ${String(line.gst_rate)}%` : ""}
                    <small className="block text-[var(--muted)]">
                      {String(line.gst_treatment ?? "")}
                    </small>
                  </td>
                  <td className="py-3 text-right">
                    {formatPaise(String(line.line_total_minor))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-y-2 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">{formatPaise(totals.subtotal_minor)}</dd>
          <dt>CGST</dt>
          <dd className="text-right">{formatPaise(totals.cgst_total_minor)}</dd>
          <dt>SGST</dt>
          <dd className="text-right">{formatPaise(totals.sgst_total_minor)}</dd>
          <dt>IGST</dt>
          <dd className="text-right">{formatPaise(totals.igst_total_minor)}</dd>
          <dt className="border-t border-[var(--line)] pt-3 font-semibold">
            Total ({String(document.currency_code ?? "INR")})
          </dt>
          <dd className="border-t border-[var(--line)] pt-3 text-right text-lg font-semibold">
            {formatPaise(totals.total_minor)}
          </dd>
        </dl>

        {document.place_of_supply_applicable ? (
          <p className="mt-6 text-sm">
            Place of supply: {String(document.place_of_supply_state_code ?? "")}
            {document.place_of_supply_text
              ? ` · ${String(document.place_of_supply_text)}`
              : ""}
          </p>
        ) : null}
        {document.reverse_charge_applies ? (
          <p className="mt-2 text-sm">
            Reverse charge applies as recorded on this quotation.
          </p>
        ) : null}
        {document.terms ? (
          <section className="mt-6">
            <h2 className="font-semibold">Terms</h2>
            <p className="mt-2 whitespace-pre-line text-sm">{String(document.terms)}</p>
          </section>
        ) : null}
        {seller.payment_instructions ? (
          <section className="mt-6">
            <h2 className="font-semibold">Payment instructions</h2>
            <p className="mt-2 whitespace-pre-line text-sm">
              {String(seller.payment_instructions)}
            </p>
          </section>
        ) : null}
        {seller.bank_name || seller.upi_id ? (
          <p className="mt-3 text-sm">
            {[
              seller.bank_name,
              seller.bank_account_name,
              seller.bank_account_number,
              seller.bank_ifsc,
              seller.upi_id,
            ]
              .filter(Boolean)
              .map(String)
              .join(" · ")}
          </p>
        ) : null}

        {canRespond ? <PublicResponseForm token={token} /> : null}
        <p className="mt-8 border-t border-[var(--line)] pt-4 text-xs text-[var(--muted)]">
          This page shows the quotation version shared with you. Responses are recorded once
          per version; names entered here are not verified identities.
        </p>
      </article>
    </main>
  );
}
