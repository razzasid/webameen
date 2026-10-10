import { formatPaise } from "@/server/modules/catalog/validation";
import type { InvoiceDocument } from "@/server/modules/invoices/document-model";

const sectionStyle = {
  border: "1px solid #dce3e7",
  borderRadius: "14px",
  background: "#ffffff",
  padding: "20px",
} as const;
const mutedStyle = { color: "#596872", fontSize: "13px" } as const;

function formatQuantity(value: string): string {
  const [integerPart = "0", fractionPart = ""] = value.split(".");
  let grouped: string;
  try {
    grouped = BigInt(integerPart).toLocaleString("en-IN");
  } catch {
    grouped = integerPart;
  }
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function taxSummary(line: InvoiceDocument["lines"][number]) {
  const parts = [
    line.cgst_amount_minor !== "0" ? `CGST ${formatPaise(line.cgst_amount_minor)}` : null,
    line.sgst_amount_minor !== "0" ? `SGST ${formatPaise(line.sgst_amount_minor)}` : null,
    line.igst_amount_minor !== "0" ? `IGST ${formatPaise(line.igst_amount_minor)}` : null,
  ].filter(Boolean);
  return parts.length
    ? `${line.gst_rate ? `${line.gst_rate}% GST · ` : ""}${parts.join(" · ")}`
    : `${line.gst_category.replaceAll("_", " ")} · no GST`;
}

export function InvoiceDocumentView({
  document,
  pdfHref,
}: {
  document: InvoiceDocument;
  pdfHref?: string;
}) {
  const { seller, buyer, document: settings, totals, remittance } = document;
  const issued = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: settings.document_time_zone,
  }).format(new Date(document.issued_at));

  return (
    <article
      style={{ color: "#1d292f", fontFamily: "Arial, sans-serif", lineHeight: 1.45 }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "24px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <p style={{ color: "#9a6a28", fontSize: "13px", fontWeight: 700, margin: 0 }}>
            TAX INVOICE
          </p>
          <h1 style={{ fontSize: "30px", letterSpacing: "-1px", margin: "4px 0" }}>
            {document.reference}
          </h1>
          <p style={{ ...mutedStyle, margin: 0 }}>
            Invoice date {document.invoice_date}
            {document.due_on ? ` · Due ${document.due_on}` : ""}
          </p>
          <p style={{ ...mutedStyle, margin: "4px 0 0" }}>
            Issued {issued} ({settings.document_time_zone})
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ ...mutedStyle, margin: 0 }}>Total due</p>
          <p style={{ fontSize: "25px", fontWeight: 700, margin: "2px 0" }}>
            {formatPaise(totals.total_minor)} {settings.currency_code}
          </p>
          {pdfHref ? (
            <a
              href={pdfHref}
              style={{ color: "#80571e", fontSize: "14px", fontWeight: 700 }}
            >
              Download PDF
            </a>
          ) : null}
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: "14px",
          marginBottom: "18px",
        }}
      >
        <section style={sectionStyle}>
          <h2 style={{ fontSize: "15px", margin: 0 }}>From</h2>
          <p style={{ fontWeight: 700, margin: "10px 0 4px" }}>{seller.display_name}</p>
          <p style={{ whiteSpace: "pre-line", margin: 0 }}>{seller.address}</p>
          <p style={{ ...mutedStyle, margin: "8px 0 0" }}>
            {[seller.email, seller.phone].filter(Boolean).join(" · ")}
          </p>
          <p style={{ ...mutedStyle, margin: "4px 0 0" }}>
            State {seller.state_code}
            {seller.gst_registered
              ? ` · GSTIN ${seller.gstin ?? ""}`
              : " · Not GST registered"}
          </p>
        </section>
        <section style={sectionStyle}>
          <h2 style={{ fontSize: "15px", margin: 0 }}>Bill to</h2>
          <p style={{ fontWeight: 700, margin: "10px 0 4px" }}>{buyer.display_name}</p>
          {buyer.contact_name ? (
            <p style={{ margin: "0 0 4px" }}>{buyer.contact_name}</p>
          ) : null}
          <p style={{ whiteSpace: "pre-line", margin: 0 }}>{buyer.billing_address}</p>
          <p style={{ ...mutedStyle, margin: "8px 0 0" }}>
            {[buyer.email, buyer.phone].filter(Boolean).join(" · ")}
          </p>
          <p style={{ ...mutedStyle, margin: "4px 0 0" }}>
            State {buyer.state_code}
            {buyer.gstin_applicable ? ` · GSTIN ${buyer.gstin ?? "not supplied"}` : ""}
          </p>
        </section>
      </div>

      <section style={{ ...sectionStyle, padding: 0, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "760px", width: "100%" }}>
          <thead style={{ background: "#f4f6f7", color: "#596872", fontSize: "12px" }}>
            <tr>
              {[
                "Description",
                "HSN/SAC",
                "Quantity",
                "Unit price",
                "GST",
                "Line total",
              ].map((heading) => (
                <th
                  key={heading}
                  style={{
                    padding: "11px 9px",
                    textAlign: heading === "Line total" ? "right" : "left",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line) => (
              <tr
                key={`${line.position}-${line.description}`}
                style={{ borderTop: "1px solid #e3e8eb" }}
              >
                <td style={{ padding: "11px 9px", verticalAlign: "top" }}>
                  <strong>
                    {line.position}. {line.description}
                  </strong>
                  <span style={{ ...mutedStyle, display: "block" }}>{line.unit_label}</span>
                  <span style={{ ...mutedStyle, display: "block" }}>
                    Taxable {formatPaise(line.taxable_amount_minor)} · {taxSummary(line)}
                  </span>
                </td>
                <td style={{ padding: "11px 9px", verticalAlign: "top" }}>
                  {line.hsn_sac ?? "—"}
                </td>
                <td
                  style={{
                    padding: "11px 9px",
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatQuantity(line.quantity)}
                </td>
                <td
                  style={{
                    padding: "11px 9px",
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPaise(line.unit_price_minor)}
                </td>
                <td
                  style={{
                    padding: "11px 9px",
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {line.gst_rate ? `${line.gst_rate}%` : "—"}
                </td>
                <td
                  style={{
                    padding: "11px 9px",
                    textAlign: "right",
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPaise(line.line_total_minor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: "14px",
          marginTop: "16px",
        }}
      >
        <section style={sectionStyle}>
          <h2 style={{ fontSize: "15px", margin: 0 }}>Supply and tax</h2>
          <p style={{ margin: "9px 0 0" }}>
            Place of supply:{" "}
            {settings.place_of_supply_applicable
              ? (settings.place_of_supply_text ??
                settings.place_of_supply_state_code ??
                "Specified")
              : "Not specified"}
          </p>
          <p style={{ margin: "5px 0 0" }}>
            Reverse charge: {settings.reverse_charge_applies ? "Applies" : "Does not apply"}
          </p>
          <p style={{ ...mutedStyle, margin: "9px 0 0" }}>
            Price basis: {settings.price_tax_mode.replaceAll("_", " ")}; tax treatment:{" "}
            {settings.gst_treatment.replaceAll("_", " ")}
          </p>
        </section>
        <section style={sectionStyle}>
          <h2 style={{ fontSize: "15px", margin: 0 }}>Totals</h2>
          <Total
            label="Subtotal"
            value={totals.subtotal_minor}
            currency={settings.currency_code}
          />
          <Total
            label="Taxable subtotal"
            value={totals.taxable_subtotal_minor}
            currency={settings.currency_code}
          />
          <Total
            label="CGST"
            value={totals.cgst_total_minor}
            currency={settings.currency_code}
          />
          <Total
            label="SGST"
            value={totals.sgst_total_minor}
            currency={settings.currency_code}
          />
          <Total
            label="IGST"
            value={totals.igst_total_minor}
            currency={settings.currency_code}
          />
          <Total
            label="GST total"
            value={totals.gst_total_minor}
            currency={settings.currency_code}
          />
          <Total
            label="Invoice total"
            value={totals.total_minor}
            currency={settings.currency_code}
            strong
          />
        </section>
      </div>

      {remittance.bank_name ||
      remittance.bank_account_name ||
      remittance.bank_account_number ||
      remittance.bank_ifsc ||
      remittance.upi_id ||
      remittance.payment_instructions ? (
        <section style={{ ...sectionStyle, marginTop: "14px" }}>
          <h2 style={{ fontSize: "15px", margin: 0 }}>Payment details</h2>
          {remittance.bank_name ? (
            <p style={{ margin: "8px 0 0" }}>Bank: {remittance.bank_name}</p>
          ) : null}
          {remittance.bank_account_name ? (
            <p style={{ margin: "4px 0 0" }}>
              Account name: {remittance.bank_account_name}
            </p>
          ) : null}
          {remittance.bank_account_number ? (
            <p style={{ margin: "4px 0 0" }}>
              Account number: {remittance.bank_account_number}
            </p>
          ) : null}
          {remittance.bank_ifsc ? (
            <p style={{ margin: "4px 0 0" }}>IFSC: {remittance.bank_ifsc}</p>
          ) : null}
          {remittance.upi_id ? (
            <p style={{ margin: "4px 0 0" }}>UPI: {remittance.upi_id}</p>
          ) : null}
          {remittance.payment_instructions ? (
            <p style={{ whiteSpace: "pre-line", margin: "8px 0 0" }}>
              {remittance.payment_instructions}
            </p>
          ) : null}
        </section>
      ) : null}
      {settings.terms ? (
        <section style={{ ...sectionStyle, marginTop: "14px" }}>
          <h2 style={{ fontSize: "15px", margin: 0 }}>Terms</h2>
          <p style={{ whiteSpace: "pre-line", margin: "8px 0 0" }}>{settings.terms}</p>
        </section>
      ) : null}
    </article>
  );
}

function Total({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string;
  value: string;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        marginTop: "7px",
        fontWeight: strong ? 700 : 400,
      }}
    >
      <span>{label}</span>
      <span>
        {formatPaise(value)} {currency}
      </span>
    </div>
  );
}
