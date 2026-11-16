import "server-only";

import { formatPaise } from "@/server/modules/catalog/validation";
import type { InvoiceDocument } from "./document-model";

const MAX_LINES = 100;
const MAX_TEXT_LENGTH = 12_000;
const MAX_LINE_DESCRIPTION_LENGTH = 1_200;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

function formatPdfCurrency(value: string | number | null, currency = "INR"): string {
  const formatted = formatPaise(value);
  if (!formatted || formatted === "Not set") return "—";
  if (currency === "INR") {
    return formatted.replace(/^₹/, "INR ");
  }
  if (currency === "USD") {
    return formatted.replace(/^₹/, "$");
  }
  return formatted.replace(/^₹/, `${currency} `);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  } catch {
    return value;
  }
}

function formatQuantity(value: string): string {
  const [integerPart = "0", fractionPart = ""] = value.split(".");
  const fraction = fractionPart.replace(/0+$/, "");
  if (!fraction) {
    try {
      const num = Number.parseInt(integerPart, 10);
      if (!Number.isNaN(num) && num >= 0 && num < 100) {
        return num.toString().padStart(2, "0");
      }
    } catch {
      // fallback
    }
    return integerPart;
  }
  return `${integerPart}.${fraction}`;
}

async function fetchLogo(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || (contentType !== "image/png" && contentType !== "image/jpeg")) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 700_000) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
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

  const logoBytes = await fetchLogo(document.seller.logo_url);

  const { PDFDocument } = (await import("pdfkit")) as unknown as {
    PDFDocument: new (options: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
  };

  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 36, right: 36, bottom: 24, left: 36 },
    bufferPages: true,
    compress: false,
    info: {
      Title: `Invoice ${document.reference}`,
      Author: document.seller.display_name,
    },
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

  const pageWidth = 595.28;
  const left = 36;
  const right = 559;
  const tableBottomLimit = 650;
  const currency = document.document.currency_code || "INR";

  // Palette matching design reference
  const navy = "#1e293b";
  const yellow = "#f59e0b";
  const lineCol = "#cbd5e1";
  const mutedText = "#64748b";
  const darkText = "#1e293b";

  const drawPageBackground = () => {
    // Bottom full-width dark slate bar
    pdf.save();
    pdf.rect(0, 824, pageWidth, 18).fill(navy);
    pdf.restore();
  };

  const drawHeaderAndParties = (isFirstPage: boolean) => {
    if (!isFirstPage) {
      // Compact recurring header for page 2+
      pdf.save();
      pdf.font("Helvetica-Bold").fontSize(10).fillColor(darkText);
      pdf.text(document.seller.display_name.toUpperCase(), left, 36);
      pdf.font("Helvetica").fontSize(8.5).fillColor(mutedText);
      pdf.text(`INVOICE: ${document.reference} · Continued`, left, 49);
      pdf.moveTo(left, 62).lineTo(right, 62).strokeColor(lineCol).lineWidth(0.8).stroke();
      pdf.restore();
      return 70;
    }

    // 1. TOP HEADER SECTION (y = 36 to ~115)
    // Left: Logo or Stylized Initials Branding
    if (logoBytes) {
      try {
        pdf.image(logoBytes, left, 36, { fit: [180, 52], valign: "center" });
      } catch {
        // Fallback to text branding if corrupted image
        drawBrandText();
      }
    } else {
      drawBrandText();
    }

    function drawBrandText() {
      // Yellow/Dark Icon Box
      pdf.save();
      pdf.roundedRect(left, 36, 42, 42, 6).fill(navy);
      pdf.font("Helvetica-Bold").fontSize(14).fillColor(yellow);
      const initials = (document.seller.display_name.slice(0, 2) || "IN").toUpperCase();
      pdf.text(initials, left, 50, { width: 42, align: "center" });

      // Name & Subtitle
      pdf.font("Helvetica-Bold").fontSize(13).fillColor(darkText);
      pdf.text(document.seller.display_name.toUpperCase(), left + 50, 41, { width: 140 });
      pdf.font("Helvetica-Bold").fontSize(7.5).fillColor(yellow);
      pdf.text("BUSINESS INVOICE", left + 50, 57);
      pdf.restore();
    }

    // Right: Contact info with vertical yellow accent line
    const contactBlockX = 250;
    pdf.save();
    pdf.rect(contactBlockX, 36, 6, 52).fill(yellow);

    const contactTextX = contactBlockX + 14;
    pdf.font("Helvetica").fontSize(8).fillColor(darkText);

    let contactY = 38;
    if (document.seller.phone) {
      pdf.text(document.seller.phone, contactTextX, contactY);
      contactY += 13;
    }
    if (document.seller.email) {
      pdf.text(document.seller.email, contactTextX, contactY);
      contactY += 13;
    }
    if (document.seller.gst_registered && document.seller.gstin) {
      pdf.text(`GSTIN: ${document.seller.gstin}`, contactTextX, contactY);
    } else {
      pdf.text(`State ${document.seller.state_code || "09"}`, contactTextX, contactY);
    }

    // Horizontal line below contact block
    pdf
      .moveTo(contactBlockX - 10, 94)
      .lineTo(right, 94)
      .strokeColor(lineCol)
      .lineWidth(0.8)
      .stroke();

    // Address below line
    if (document.seller.address) {
      pdf.font("Helvetica").fontSize(8).fillColor(mutedText);
      pdf.text(document.seller.address, contactBlockX, 100, {
        width: right - contactBlockX,
      });
    }
    pdf.restore();

    // 2. METADATA / PARTIES SECTION (y = 126 to ~215)
    const partyY = 126;

    // Col 1: "To" (Customer / Buyer)
    pdf.save();
    pdf.font("Helvetica").fontSize(8.5).fillColor(mutedText).text("To", left, partyY);
    pdf
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(darkText)
      .text(document.buyer.display_name.toUpperCase(), left, partyY + 12, { width: 165 });

    let buyerDetailY = partyY + 27;
    pdf.font("Helvetica").fontSize(8).fillColor(mutedText);
    if (document.buyer.contact_name) {
      pdf.text(document.buyer.contact_name, left, buyerDetailY, { width: 165 });
      buyerDetailY += 11;
    }
    if (document.buyer.phone) {
      pdf.text(`P. ${document.buyer.phone}`, left, buyerDetailY, { width: 165 });
      buyerDetailY += 11;
    }
    if (document.buyer.email) {
      pdf.text(`E. ${document.buyer.email}`, left, buyerDetailY, { width: 165 });
      buyerDetailY += 11;
    }
    if (document.buyer.billing_address) {
      pdf.text(`A. ${document.buyer.billing_address}`, left, buyerDetailY, { width: 165 });
      buyerDetailY += 11;
    }
    if (document.buyer.gstin_applicable && document.buyer.gstin) {
      pdf.font("Helvetica-Bold").fontSize(8).fillColor(darkText);
      pdf.text(`GSTIN: ${document.buyer.gstin}`, left, buyerDetailY, { width: 165 });
    }
    pdf.restore();

    // Col 2: Dates (Center Column)
    const datesX = 215;
    pdf.save();
    // Hatched design block as in template
    pdf.rect(datesX, partyY, 130, 12).fill("#f1f5f9");
    pdf.strokeColor(lineCol).lineWidth(0.5);
    for (let hx = datesX; hx < datesX + 130; hx += 5) {
      pdf
        .moveTo(hx, partyY + 12)
        .lineTo(hx + 8, partyY)
        .stroke();
    }

    // Invoice Date
    const d1Y = partyY + 20;
    pdf
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(darkText)
      .text("INVOICE DATE:", datesX, d1Y);
    pdf
      .moveTo(datesX, d1Y + 11)
      .lineTo(datesX + 130, d1Y + 11)
      .strokeColor(lineCol)
      .lineWidth(0.8)
      .stroke();
    pdf
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(darkText)
      .text(formatDate(document.invoice_date), datesX, d1Y + 15);

    // Due Date
    const d2Y = d1Y + 34;
    pdf
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(darkText)
      .text("DATE DUE:", datesX, d2Y);
    pdf
      .moveTo(datesX, d2Y + 11)
      .lineTo(datesX + 130, d2Y + 11)
      .strokeColor(lineCol)
      .lineWidth(0.8)
      .stroke();
    pdf
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(darkText)
      .text(formatDate(document.due_on ?? document.invoice_date), datesX, d2Y + 15);
    pdf.restore();

    // Col 3: Invoice Banner & Total Due (Right Column)
    const invoiceBoxX = 375;
    const invoiceBoxWidth = right - invoiceBoxX; // 184
    pdf.save();

    // Navy "INVOICE" Block
    pdf.rect(invoiceBoxX, partyY, invoiceBoxWidth, 24).fill(navy);
    pdf.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff");
    pdf.text("I N V O I C E", invoiceBoxX, partyY + 6, {
      width: invoiceBoxWidth,
      align: "center",
    });

    // Invoice Number
    const invNoY = partyY + 32;
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor(mutedText)
      .text("INVOICE NO:", invoiceBoxX, invNoY, { continued: true });
    pdf
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(darkText)
      .text(` ${document.reference}`);
    pdf
      .moveTo(invoiceBoxX, invNoY + 12)
      .lineTo(right, invNoY + 12)
      .strokeColor(lineCol)
      .lineWidth(0.8)
      .stroke();

    // Total Due
    const totalDueY = invNoY + 18;
    pdf
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(mutedText)
      .text("TOTAL DUE:", invoiceBoxX, totalDueY);
    pdf
      .moveTo(invoiceBoxX, totalDueY + 12)
      .lineTo(right, totalDueY + 12)
      .strokeColor(lineCol)
      .lineWidth(0.8)
      .stroke();

    // Big Bold Total Number
    const grandTotalFormatted = formatPdfCurrency(document.totals.total_minor, currency);
    pdf.font("Helvetica-Bold").fontSize(18).fillColor(darkText);
    pdf.text(grandTotalFormatted, invoiceBoxX, totalDueY + 16, { width: invoiceBoxWidth });
    pdf.restore();

    return 222;
  };

  const drawTableHeader = (startY: number) => {
    pdf.save();
    // Top border
    pdf
      .moveTo(left, startY)
      .lineTo(right, startY)
      .strokeColor(navy)
      .lineWidth(1.2)
      .stroke();

    // Header labels
    const textY = startY + 6;
    pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(darkText);
    pdf.text("Description", left + 6, textY, { width: 234 });
    pdf.text("PRICE", 276, textY, { width: 90, align: "center" });
    pdf.text("QTY", 366, textY, { width: 60, align: "center" });
    pdf.text("TOTAL", 426, textY, { width: 127, align: "right" });

    // Bottom border
    const bottomY = startY + 22;
    pdf
      .moveTo(left, bottomY)
      .lineTo(right, bottomY)
      .strokeColor(navy)
      .lineWidth(1.2)
      .stroke();
    pdf.restore();
    return bottomY;
  };

  // Start Page 1
  drawPageBackground();
  let currentY = drawHeaderAndParties(true);
  currentY = drawTableHeader(currentY);

  // 3. TABLE BODY ROWS
  for (let idx = 0; idx < document.lines.length; idx += 1) {
    const line = document.lines[idx];
    const subtext = [
      line.unit_label || "units",
      line.hsn_sac ? `HSN/SAC ${line.hsn_sac}` : null,
      line.gst_rate ? `${line.gst_rate}% GST` : null,
      line.gst_treatment ? line.gst_treatment.replaceAll("_", " ") : null,
    ]
      .filter(Boolean)
      .join(" · ");

    pdf.font("Helvetica-Bold").fontSize(8.5);
    const titleHeight = pdf.heightOfString(line.description, { width: 230 });
    pdf.font("Helvetica").fontSize(7.5);
    const subtextHeight = subtext ? pdf.heightOfString(`• ${subtext}`, { width: 230 }) : 0;
    const rowContentHeight = titleHeight + (subtext ? subtextHeight + 3 : 0);
    const rowHeight = Math.max(rowContentHeight + 14, 28);

    // Check pagination
    if (currentY + rowHeight > tableBottomLimit) {
      pdf.addPage();
      drawPageBackground();
      const topY = drawHeaderAndParties(false);
      currentY = drawTableHeader(topY);
    }

    const rowTop = currentY;
    const rowBottom = currentY + rowHeight;

    // Draw vertical column grid lines
    pdf.save();
    pdf.strokeColor("#e2e8f0").lineWidth(0.6);
    pdf.moveTo(276, rowTop).lineTo(276, rowBottom).stroke();
    pdf.moveTo(366, rowTop).lineTo(366, rowBottom).stroke();
    pdf.moveTo(426, rowTop).lineTo(426, rowBottom).stroke();

    // Row horizontal bottom line
    pdf.moveTo(left, rowBottom).lineTo(right, rowBottom).stroke();

    // Description Column
    const textStartY = rowTop + 6;
    pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(darkText);
    pdf.text(line.description, left + 6, textStartY, { width: 230 });
    if (subtext) {
      pdf.font("Helvetica").fontSize(7.5).fillColor(mutedText);
      pdf.text(`• ${subtext}`, left + 6, textStartY + titleHeight + 2, { width: 230 });
    }

    // Price Column
    const priceText = formatPdfCurrency(line.unit_price_minor, currency);
    pdf.font("Helvetica").fontSize(8.5).fillColor(darkText);
    pdf.text(priceText, 276, textStartY + 2, { width: 90, align: "center" });

    // Qty Column
    const qtyText = formatQuantity(line.quantity);
    pdf.font("Helvetica").fontSize(8.5).fillColor(darkText);
    pdf.text(qtyText, 366, textStartY + 2, { width: 60, align: "center" });

    // Total Column
    const lineTotalText = formatPdfCurrency(line.line_total_minor, currency);
    pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(darkText);
    pdf.text(lineTotalText, 426, textStartY + 2, { width: 127, align: "right" });

    pdf.restore();
    currentY = rowBottom;
  }

  // 4. SUMMARY & FOOTER SECTION
  // Check if summary fits on current page (needs ~150pt)
  if (currentY + 150 > 790) {
    pdf.addPage();
    drawPageBackground();
    currentY = 50;
  }

  // Strong horizontal bottom line under entire table
  pdf.save();
  pdf
    .moveTo(left, currentY)
    .lineTo(right, currentY)
    .strokeColor(navy)
    .lineWidth(1.2)
    .stroke();
  pdf.restore();

  const summaryTop = currentY + 10;

  // Left Column: Terms, Payment Info, Place of Supply
  pdf.save();
  const leftColWidth = 285;
  let leftY = summaryTop;

  // Terms & Conditions
  pdf
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(darkText)
    .text("Terms & Conditions/Notes:", left, leftY, { continued: true });
  pdf
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(mutedText)
    .text(` ${document.document.terms ?? "Payment is due according to agreed terms."}`, {
      width: leftColWidth,
    });
  leftY = pdf.y + 10;

  // Payment Info Header
  pdf
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(darkText)
    .text("PAYMENT INFO", left, leftY);
  pdf
    .moveTo(left, leftY + 10)
    .lineTo(left + 140, leftY + 10)
    .strokeColor(lineCol)
    .lineWidth(0.8)
    .stroke();
  leftY += 15;

  pdf.font("Helvetica").fontSize(7.5).fillColor(mutedText);
  if (
    document.remittance.bank_name ||
    document.remittance.bank_account_name ||
    document.remittance.bank_account_number ||
    document.remittance.bank_ifsc ||
    document.remittance.upi_id ||
    document.remittance.payment_instructions
  ) {
    if (document.remittance.bank_name) {
      pdf.text(`Bank: ${document.remittance.bank_name}`, left, leftY, {
        width: leftColWidth,
      });
      leftY += 10;
    }
    if (document.remittance.bank_account_number) {
      pdf.text(
        `Account No: ${document.remittance.bank_account_number} (${document.remittance.bank_account_name ?? ""})`,
        left,
        leftY,
        { width: leftColWidth },
      );
      leftY += 10;
    }
    if (document.remittance.bank_ifsc) {
      pdf.text(`IFSC: ${document.remittance.bank_ifsc}`, left, leftY, {
        width: leftColWidth,
      });
      leftY += 10;
    }
    if (document.remittance.upi_id) {
      pdf.text(`UPI: ${document.remittance.upi_id}`, left, leftY, { width: leftColWidth });
      leftY += 10;
    }
    if (document.remittance.payment_instructions) {
      pdf.text(`Note: ${document.remittance.payment_instructions}`, left, leftY, {
        width: leftColWidth,
      });
      leftY += 10;
    }
  } else {
    pdf.text(
      "Direct electronic bank transfer to seller account details above.",
      left,
      leftY,
      { width: leftColWidth },
    );
    leftY += 10;
  }

  // Supply and Tax details
  const placeOfSupply = document.document.place_of_supply_applicable
    ? (document.document.place_of_supply_text ??
      document.document.place_of_supply_state_code ??
      "Specified")
    : "Not specified";
  const revCharge = document.document.reverse_charge_applies ? "Applies" : "Does not apply";
  pdf.font("Helvetica").fontSize(7).fillColor(mutedText);
  pdf.text(
    `Place of Supply: ${placeOfSupply} · Reverse Charge: ${revCharge}`,
    left,
    leftY + 4,
    { width: leftColWidth },
  );
  pdf.restore();

  // Right Column: Totals & Signature
  pdf.save();
  const totalsLabelX = 350;
  const totalsValueX = 430;
  const totalsValueWidth = right - totalsValueX; // 129
  let rightY = summaryTop;

  // Sub-Total
  pdf
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(darkText)
    .text("Sub-Total", totalsLabelX, rightY);
  pdf.text(
    formatPdfCurrency(document.totals.subtotal_minor, currency),
    totalsValueX,
    rightY,
    { width: totalsValueWidth, align: "right" },
  );
  rightY += 14;

  // Tax lines (CGST / SGST / IGST)
  if (document.totals.cgst_total_minor !== "0") {
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor(mutedText)
      .text("CGST", totalsLabelX, rightY);
    pdf.text(
      formatPdfCurrency(document.totals.cgst_total_minor, currency),
      totalsValueX,
      rightY,
      { width: totalsValueWidth, align: "right" },
    );
    rightY += 12;
  }
  if (document.totals.sgst_total_minor !== "0") {
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor(mutedText)
      .text("SGST", totalsLabelX, rightY);
    pdf.text(
      formatPdfCurrency(document.totals.sgst_total_minor, currency),
      totalsValueX,
      rightY,
      { width: totalsValueWidth, align: "right" },
    );
    rightY += 12;
  }
  if (document.totals.igst_total_minor !== "0") {
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor(mutedText)
      .text("IGST", totalsLabelX, rightY);
    pdf.text(
      formatPdfCurrency(document.totals.igst_total_minor, currency),
      totalsValueX,
      rightY,
      { width: totalsValueWidth, align: "right" },
    );
    rightY += 12;
  }
  if (
    document.totals.gst_total_minor !== "0" &&
    document.totals.cgst_total_minor === "0" &&
    document.totals.sgst_total_minor === "0" &&
    document.totals.igst_total_minor === "0"
  ) {
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor(mutedText)
      .text("Tax (GST)", totalsLabelX, rightY);
    pdf.text(
      formatPdfCurrency(document.totals.gst_total_minor, currency),
      totalsValueX,
      rightY,
      { width: totalsValueWidth, align: "right" },
    );
    rightY += 12;
  }

  // Grand Total divider
  pdf
    .moveTo(totalsLabelX, rightY + 3)
    .lineTo(right, rightY + 3)
    .strokeColor(darkText)
    .lineWidth(1)
    .stroke();
  rightY += 8;

  // Grand Total
  pdf
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(darkText)
    .text("Grand Total", totalsLabelX, rightY);
  pdf
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(darkText)
    .text(formatPdfCurrency(document.totals.total_minor, currency), totalsValueX, rightY, {
      width: totalsValueWidth,
      align: "right",
    });
  rightY += 28;

  // Signature Block
  const sigBoxX = 420;
  const sigBoxWidth = right - sigBoxX; // 139
  pdf
    .font("Helvetica-Oblique")
    .fontSize(10)
    .fillColor("#475569")
    .text(document.seller.display_name, sigBoxX, rightY, {
      width: sigBoxWidth,
      align: "center",
    });
  pdf
    .moveTo(sigBoxX, rightY + 14)
    .lineTo(right, rightY + 14)
    .strokeColor(darkText)
    .lineWidth(0.8)
    .stroke();
  pdf
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(mutedText)
    .text("SIGNATURE", sigBoxX, rightY + 17, { width: sigBoxWidth, align: "center" });
  pdf.restore();

  // 5. BOTTOM GREETING & PAGE NUMBERS (All Pages)
  const range = pdf.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    pdf.switchToPage(index);
    pdf.save();
    // "THANK YOU FOR YOUR BUSINESS" on all pages or last page
    pdf
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(darkText)
      .text("THANK YOU FOR YOUR BUSINESS", left, 792);

    // Page Number
    pdf.font("Helvetica").fontSize(7.5).fillColor(mutedText);
    pdf.text(
      `Invoice ${document.reference} · Page ${index + 1} of ${range.count}`,
      right - 180,
      792,
      { width: 180, align: "right" },
    );
    pdf.restore();
  }

  pdf.end();
  return output;
}
