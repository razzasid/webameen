import "server-only";

import { formatPaise } from "@/server/modules/catalog/validation";
import type { QuotationDocument } from "./document-model";

const MAX_LINES = 100;
const MAX_TEXT_LENGTH = 12_000;
const MAX_LINE_DESCRIPTION_LENGTH = 1_200;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

function amount(value: string) {
  return formatPaise(value).replace(/^₹/, "INR ");
}

export async function renderQuotationPdf(quote: QuotationDocument): Promise<Buffer> {
  const textValues = [
    quote.reference,
    quote.seller.display_name,
    quote.seller.address,
    quote.buyer.display_name,
    quote.buyer.billing_address,
    quote.document.terms ?? "",
    quote.seller.payment_instructions ?? "",
    ...quote.lines.map((line) => line.description),
  ];
  if (
    quote.lines.length === 0 ||
    quote.lines.length > MAX_LINES ||
    textValues.some((value) => value.length > MAX_TEXT_LENGTH) ||
    quote.lines.some((line) => line.description.length > MAX_LINE_DESCRIPTION_LENGTH)
  ) {
    throw new Error("Quotation is outside the PDF render limits.");
  }
  const { PDFDocument } = (await import("pdfkit")) as unknown as {
    PDFDocument: new (options: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
  };
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 42, right: 42, bottom: 24, left: 42 },
    bufferPages: true,
    compress: false,
    info: { Title: `Quotation ${quote.reference}`, Author: quote.seller.display_name },
  });
  const chunks: Buffer[] = [];
  let size = 0;
  const output = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_PDF_BYTES) {
        reject(new Error("Quotation PDF exceeded the output limit."));
        pdf.destroy();
        return;
      }
      chunks.push(chunk);
    });
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks, size)));
  });
  const left = 42;
  const right = 553;
  const width = right - left;
  const bottom = 790;
  const ensureSpace = (height: number) => {
    if (pdf.y + height > bottom) {
      pdf.addPage();
      pdf.font("Helvetica").fillColor("#1d292f");
    }
  };
  const paragraph = (label: string, value: string | null) => {
    if (!value) return;
    const valueText = label ? `${label}: ${value}` : value;
    pdf.fontSize(9);
    const height = pdf.heightOfString(valueText, { width, lineGap: 2 });
    ensureSpace(height + 5);
    pdf.font("Helvetica").fontSize(9).fillColor("#1d292f").text(valueText, left, pdf.y, {
      width,
      lineGap: 2,
    });
    pdf.moveDown(0.2);
  };
  const section = (title: string) => {
    ensureSpace(24);
    pdf.font("Helvetica-Bold").fontSize(11).fillColor("#80571e").text(title, left, pdf.y);
    pdf.moveDown(0.3);
    pdf.font("Helvetica").fillColor("#1d292f");
  };
  const total = (label: string, value: string, strong = false) => {
    ensureSpace(18);
    pdf
      .font(strong ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .fillColor("#1d292f");
    pdf.text(label, left, pdf.y, { continued: true, width: width - 145 });
    pdf.text(amount(value), { width: 145, align: "right" });
  };

  pdf.font("Helvetica-Bold").fontSize(10).fillColor("#9a6a28").text("QUOTATION", left, 42);
  pdf
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#1d292f")
    .text(quote.reference, left, 58);
  pdf.font("Helvetica").fontSize(9).fillColor("#596872");
  pdf.text(
    `Version ${quote.version_number}${quote.valid_until ? `  |  Valid through ${quote.valid_until}` : ""}`,
    left,
    88,
  );
  pdf.text(`Seller: ${quote.seller.display_name}`, left, 102);
  pdf.text(`Customer: ${quote.buyer.display_name}`, left, 116);
  pdf.y = 136;
  section("Seller and customer");
  paragraph("Seller address", quote.seller.address);
  paragraph(
    "Seller contact",
    [quote.seller.email, quote.seller.phone].filter(Boolean).join(" · ") || null,
  );
  paragraph(
    "Seller GSTIN",
    quote.seller.gst_registered ? quote.seller.gstin : "Not GST registered",
  );
  paragraph("Customer address", quote.buyer.billing_address);
  paragraph(
    "Customer contact",
    [quote.buyer.contact_name, quote.buyer.email, quote.buyer.phone]
      .filter(Boolean)
      .join(" · ") || null,
  );
  paragraph(
    "Customer GSTIN",
    quote.buyer.gstin_applicable ? (quote.buyer.gstin ?? "Not supplied") : "Not applicable",
  );

  const columns = [
    { title: "Description", x: left, width: 195 },
    { title: "HSN/SAC", x: 237, width: 50 },
    { title: "Qty", x: 291, width: 44 },
    { title: "Unit price", x: 339, width: 62 },
    { title: "GST", x: 405, width: 40 },
    { title: "Total", x: 447, width: 106 },
  ];
  const tableHeader = () => {
    ensureSpace(24);
    const headerY = pdf.y;
    pdf.save().rect(left, headerY, width, 20).fill("#f1f4f5").restore();
    columns.forEach((column) => {
      pdf
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#596872")
        .text(column.title, column.x, headerY + 6, {
          width: column.width,
          align: column.title === "Total" ? "right" : "left",
          lineBreak: false,
        });
    });
    pdf.y = headerY + 23;
  };
  tableHeader();
  for (const line of quote.lines) {
    const details = [
      line.cgst_amount_minor !== "0" ? `CGST ${amount(line.cgst_amount_minor)}` : null,
      line.sgst_amount_minor !== "0" ? `SGST ${amount(line.sgst_amount_minor)}` : null,
      line.igst_amount_minor !== "0" ? `IGST ${amount(line.igst_amount_minor)}` : null,
    ]
      .filter(Boolean)
      .join("  |  ");
    const description = `${line.position}. ${line.description}\n${line.unit_label}\nTaxable ${amount(line.taxable_amount_minor)} · ${line.gst_treatment.replaceAll("_", " ")}`;
    pdf.fontSize(8);
    const rowHeight =
      Math.max(pdf.heightOfString(description, { width: 195, lineGap: 2 }), 28) +
      (details ? 13 : 0) +
      12;
    if (pdf.y + rowHeight > bottom) {
      pdf.addPage();
      pdf.font("Helvetica").fillColor("#1d292f");
      tableHeader();
    }
    if (pdf.y + rowHeight > bottom) {
      throw new Error("Quotation line is too long for the PDF layout.");
    }
    const y = pdf.y;
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#1d292f")
      .text(description, left, y, { width: 195, lineGap: 2 });
    pdf.text(line.hsn_sac ?? "—", 237, y, { width: 50 });
    pdf.text(`${line.quantity} ${line.unit_label}`, 291, y, { width: 44 });
    pdf.text(amount(line.unit_price_minor), 339, y, { width: 62 });
    pdf.text(line.gst_rate ? `${line.gst_rate}%` : line.gst_category, 405, y, {
      width: 40,
    });
    pdf.text(amount(line.line_total_minor), 447, y, { width: 106, align: "right" });
    if (details)
      pdf
        .fontSize(7)
        .fillColor("#596872")
        .text(details, left + 8, y + rowHeight - 22, { width: width - 16 });
    pdf.y = y + rowHeight;
    pdf.moveTo(left, pdf.y).lineTo(right, pdf.y).strokeColor("#e3e8eb").stroke();
    pdf.y += 7;
  }

  section("Supply and tax");
  paragraph(
    "Place of supply",
    quote.document.place_of_supply_applicable
      ? (quote.document.place_of_supply_text ??
          quote.document.place_of_supply_state_code ??
          "Specified")
      : "Not specified",
  );
  paragraph(
    "Reverse charge",
    quote.document.reverse_charge_applies ? "Applies" : "Does not apply",
  );
  section("Totals");
  total("Subtotal", quote.totals.subtotal_minor);
  total("Taxable subtotal", quote.totals.taxable_subtotal_minor);
  total("CGST", quote.totals.cgst_total_minor);
  total("SGST", quote.totals.sgst_total_minor);
  total("IGST", quote.totals.igst_total_minor);
  total("GST total", quote.totals.gst_total_minor);
  total("Quotation total", quote.totals.total_minor, true);
  if (
    quote.seller.bank_name ||
    quote.seller.bank_account_name ||
    quote.seller.bank_account_number ||
    quote.seller.bank_ifsc ||
    quote.seller.upi_id ||
    quote.seller.payment_instructions
  ) {
    section("Payment details");
    paragraph("Bank", quote.seller.bank_name);
    paragraph("Account name", quote.seller.bank_account_name);
    paragraph("Account number", quote.seller.bank_account_number);
    paragraph("IFSC", quote.seller.bank_ifsc);
    paragraph("UPI", quote.seller.upi_id);
    paragraph("Instructions", quote.seller.payment_instructions);
  }
  if (quote.document.terms) {
    section("Terms");
    paragraph("", quote.document.terms);
  }
  const range = pdf.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    pdf.switchToPage(index);
    pdf.font("Helvetica").fontSize(8).fillColor("#596872");
    pdf.text(`Quotation ${quote.reference} · ${index + 1} / ${range.count}`, left, 805, {
      width,
      align: "center",
      lineBreak: false,
    });
  }
  pdf.end();
  return output;
}
