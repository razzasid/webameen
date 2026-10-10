import "server-only";

import { formatPaise } from "@/server/modules/catalog/validation";
import type { InvoiceDocument } from "./document-model";

const MAX_LINES = 100;
const MAX_TEXT_LENGTH = 12_000;
const MAX_LINE_DESCRIPTION_LENGTH = 1_200;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

function formatPdfPaise(value: string): string {
  return formatPaise(value).replace(/^₹/, "INR ");
}

function validateDocument(document: InvoiceDocument) {
  if (document.lines.length === 0 || document.lines.length > MAX_LINES) {
    throw new Error("Invoice is outside the PDF render limits.");
  }
  const values = [
    document.reference,
    document.seller.display_name,
    document.seller.address,
    document.buyer.display_name,
    document.buyer.billing_address,
    document.document.terms ?? "",
    document.remittance.payment_instructions ?? "",
    ...document.lines.map((line) => line.description),
  ];
  if (
    values.some((value) => value.length > MAX_TEXT_LENGTH) ||
    document.lines.some((line) => line.description.length > MAX_LINE_DESCRIPTION_LENGTH)
  ) {
    throw new Error("Invoice is outside the PDF render limits.");
  }
}

export async function renderInvoicePdf(document: InvoiceDocument): Promise<Buffer> {
  validateDocument(document);
  const { PDFDocument } = (await import("pdfkit")) as unknown as {
    PDFDocument: new (options: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
  };
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 42, right: 42, bottom: 24, left: 42 },
    bufferPages: true,
    compress: false,
    info: { Title: `Invoice ${document.reference}`, Author: document.seller.display_name },
  });
  const chunks: Buffer[] = [];
  let size = 0;
  const output = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_PDF_BYTES) {
        reject(new Error("Invoice PDF exceeded the output limit."));
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
  const contentWidth = right - left;
  const bottom = 790;
  pdf.font("Helvetica").fillColor("#1d292f");

  const addSectionTitle = (title: string) => {
    ensureSpace(26);
    pdf.font("Helvetica-Bold").fontSize(11).fillColor("#80571e").text(title, left, pdf.y);
    pdf.moveDown(0.35);
    pdf.font("Helvetica").fillColor("#1d292f");
  };
  const ensureSpace = (height: number) => {
    if (pdf.y + height > bottom) {
      pdf.addPage();
      pdf.font("Helvetica").fillColor("#1d292f");
    }
  };
  const addParagraph = (label: string, value: string | null | undefined) => {
    if (!value) return;
    const text = label ? `${label}: ${value}` : value;
    pdf.fontSize(9);
    const height = pdf.heightOfString(text, { width: contentWidth, lineGap: 2 });
    ensureSpace(height + 5);
    pdf.font("Helvetica").fontSize(9).fillColor("#1d292f").text(text, left, pdf.y, {
      width: contentWidth,
      lineGap: 2,
    });
    pdf.moveDown(0.2);
  };
  const addTotal = (label: string, minor: string, strong = false) => {
    ensureSpace(18);
    pdf
      .font(strong ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .fillColor("#1d292f");
    pdf.text(label, left, pdf.y, { continued: true, width: contentWidth - 135 });
    pdf.text(formatPdfPaise(minor), { width: 135, align: "right" });
  };

  pdf
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#9a6a28")
    .text("TAX INVOICE", left, 42);
  pdf
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#1d292f")
    .text(document.reference, left, 58);
  pdf.font("Helvetica").fontSize(9).fillColor("#596872");
  pdf.text(
    `Invoice date ${document.invoice_date}${document.due_on ? `  |  Due ${document.due_on}` : ""}`,
    left,
    88,
  );
  pdf.text(`Seller: ${document.seller.display_name}`, left, 102);
  pdf.text(`Customer: ${document.buyer.display_name}`, left, 116);
  pdf.y = 136;

  pdf.font("Helvetica-Bold").fontSize(9).fillColor("#1d292f");
  const columns = [
    { title: "Description", x: left, width: 195 },
    { title: "HSN/SAC", x: 237, width: 50 },
    { title: "Qty", x: 291, width: 44 },
    { title: "Unit price", x: 339, width: 62 },
    { title: "GST", x: 405, width: 40 },
    { title: "Total", x: 447, width: 106 },
  ];
  const drawTableHeader = () => {
    ensureSpace(24);
    const headerY = pdf.y;
    pdf.save().rect(left, headerY, contentWidth, 20).fill("#f1f4f5").restore();
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
  drawTableHeader();
  for (const line of document.lines) {
    const description = `${line.position}. ${line.description}\n${line.unit_label}\nTaxable ${formatPdfPaise(line.taxable_amount_minor)} · ${line.gst_treatment.replaceAll("_", " ")}`;
    const detail = [
      line.cgst_amount_minor !== "0"
        ? `CGST ${formatPdfPaise(line.cgst_amount_minor)}`
        : null,
      line.sgst_amount_minor !== "0"
        ? `SGST ${formatPdfPaise(line.sgst_amount_minor)}`
        : null,
      line.igst_amount_minor !== "0"
        ? `IGST ${formatPdfPaise(line.igst_amount_minor)}`
        : null,
    ]
      .filter(Boolean)
      .join("  |  ");
    pdf.fontSize(8);
    const rowHeight =
      Math.max(pdf.heightOfString(description, { width: 195, lineGap: 2 }), 28) +
      (detail ? 13 : 0) +
      12;
    if (pdf.y + rowHeight > bottom) {
      pdf.addPage();
      pdf.font("Helvetica").fillColor("#1d292f");
      drawTableHeader();
    }
    if (pdf.y + rowHeight > bottom) {
      throw new Error("Invoice line is too long for the PDF layout.");
    }
    const startY = pdf.y;
    pdf.font("Helvetica").fontSize(8).fillColor("#1d292f").text(description, left, startY, {
      width: 195,
      lineGap: 2,
    });
    pdf
      .fontSize(8)
      .fillColor("#1d292f")
      .text(line.hsn_sac ?? "—", 237, startY, { width: 50 });
    pdf.text(`${line.quantity} ${line.unit_label}`, 291, startY, { width: 44 });
    pdf.text(formatPdfPaise(line.unit_price_minor), 339, startY, { width: 62 });
    pdf.text(line.gst_rate ? `${line.gst_rate}%` : "—", 405, startY, { width: 40 });
    pdf.text(formatPdfPaise(line.line_total_minor), 447, startY, {
      width: 106,
      align: "right",
    });
    if (detail) {
      pdf
        .fontSize(7)
        .fillColor("#596872")
        .text(detail, left + 8, startY + rowHeight - 22, {
          width: contentWidth - 16,
        });
    }
    pdf.y = startY + rowHeight;
    pdf.moveTo(left, pdf.y).lineTo(right, pdf.y).strokeColor("#e3e8eb").stroke();
    pdf.y += 7;
  }

  addSectionTitle("Supply and tax");
  addParagraph(
    "Place of supply",
    document.document.place_of_supply_applicable
      ? (document.document.place_of_supply_text ??
          document.document.place_of_supply_state_code ??
          "Specified")
      : "Not specified",
  );
  addParagraph(
    "Reverse charge",
    document.document.reverse_charge_applies ? "Applies" : "Does not apply",
  );
  addSectionTitle("Totals");
  addTotal("Subtotal", document.totals.subtotal_minor);
  addTotal("Taxable subtotal", document.totals.taxable_subtotal_minor);
  addTotal("CGST", document.totals.cgst_total_minor);
  addTotal("SGST", document.totals.sgst_total_minor);
  addTotal("IGST", document.totals.igst_total_minor);
  addTotal("GST total", document.totals.gst_total_minor);
  addTotal("Invoice total", document.totals.total_minor, true);

  if (
    document.remittance.bank_name ||
    document.remittance.bank_account_name ||
    document.remittance.bank_account_number ||
    document.remittance.bank_ifsc ||
    document.remittance.upi_id ||
    document.remittance.payment_instructions
  ) {
    addSectionTitle("Payment details");
    addParagraph("Bank", document.remittance.bank_name);
    addParagraph("Account name", document.remittance.bank_account_name);
    addParagraph("Account number", document.remittance.bank_account_number);
    addParagraph("IFSC", document.remittance.bank_ifsc);
    addParagraph("UPI", document.remittance.upi_id);
    addParagraph("Instructions", document.remittance.payment_instructions);
  }
  if (document.document.terms) {
    addSectionTitle("Terms");
    addParagraph("", document.document.terms);
  }

  const range = pdf.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    pdf.switchToPage(index);
    pdf.font("Helvetica").fontSize(8).fillColor("#596872");
    pdf.text(`Invoice ${document.reference} · ${index + 1} / ${range.count}`, left, 805, {
      width: contentWidth,
      align: "center",
      lineBreak: false,
    });
  }
  pdf.end();
  return output;
}
