import "server-only";

import { join } from "node:path";
import { formatPaise } from "@/server/modules/catalog/validation";
import type { QuotationDocument } from "./document-model";
import {
  componentAmountMinor,
  formatQuotationDate,
  formatQuotationQuantity,
  quotationGstLabel,
  quotationPaymentDetails,
  quotationPriceNote,
  quotationSupplyDetails,
  quotationTotalRows,
  splitQuotationDescription,
} from "./document-presentation";
import { resolveQuotationHeadings } from "./template-headings";

const MAX_LINES = 100;
const MAX_TEXT_LENGTH = 12_000;
const MAX_LINE_DESCRIPTION_LENGTH = 1_200;
const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_LOGO_BYTES = 700_000;

async function fetchLogo(url: string | null) {
  if (!url) return null;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (!response.ok || (contentType !== "image/png" && contentType !== "image/jpeg")) {
    throw new Error("Quotation logo is unavailable.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) {
    throw new Error("Quotation logo is outside the PDF render limits.");
  }
  return bytes;
}

type TextBlock = { lines: string[]; height: number; size: number; bold: boolean };

export async function renderQuotationPdf(quote: QuotationDocument): Promise<Buffer> {
  const headings = resolveQuotationHeadings(quote.headings);
  const textValues = [
    quote.reference,
    quote.seller.display_name,
    quote.seller.address,
    quote.buyer.display_name,
    quote.buyer.billing_address,
    quote.document.terms ?? "",
    quote.seller.payment_instructions ?? "",
    ...quote.lines.flatMap((line) => [
      line.description,
      ...line.components.map((component) => component.description),
    ]),
  ];
  if (
    quote.lines.length === 0 ||
    quote.lines.length > MAX_LINES ||
    textValues.some((value) => value.length > MAX_TEXT_LENGTH) ||
    quote.lines.some((line) => line.description.length > MAX_LINE_DESCRIPTION_LENGTH)
  )
    throw new Error("Quotation is outside the PDF render limits.");

  const logo = await fetchLogo(quote.seller.logo_url ?? null);
  const { PDFDocument } = (await import("pdfkit")) as unknown as {
    PDFDocument: new (options: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
  };
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 32, right: 42, bottom: 24, left: 42 },
    bufferPages: true,
    compress: false,
    info: { Title: `Quotation ${quote.reference}`, Author: quote.seller.display_name },
  });
  const fonts = join(process.cwd(), "src/server/assets/fonts");
  pdf.registerFont("Quote", join(fonts, "NotoSans-Regular.ttf"));
  pdf.registerFont("QuoteBold", join(fonts, "NotoSans-Bold.ttf"));

  const chunks: Buffer[] = [];
  let outputSize = 0;
  const output = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => {
      outputSize += chunk.byteLength;
      if (outputSize > MAX_PDF_BYTES) {
        reject(new Error("Quotation PDF exceeded the output limit."));
        pdf.destroy();
        return;
      }
      chunks.push(chunk);
    });
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks, outputSize)));
  });

  const left = 42;
  const width = pdf.page.width - left * 2;
  const right = left + width;
  const bottom = 778;
  const green = "#085447";
  const ink = "#102621";
  const muted = "#586975";
  const lineColor = "#dce5e1";
  let y = 0;

  const layoutText = (
    value: string,
    availableWidth: number,
    size = 8,
    bold = false,
  ): TextBlock => {
    pdf.font(bold ? "QuoteBold" : "Quote").fontSize(size);
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      if (!paragraph.trim()) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (pdf.widthOfString(candidate) <= availableWidth) {
          current = candidate;
          continue;
        }
        if (current) {
          lines.push(current);
          current = "";
        }
        for (const character of word) {
          if (current && pdf.widthOfString(current + character) > availableWidth) {
            lines.push(current);
            current = "";
          }
          current += character;
        }
      }
      lines.push(current);
    }
    return { lines, height: lines.length * size * 1.45, size, bold };
  };

  const drawText = (
    block: TextBlock,
    x: number,
    top: number,
    availableWidth: number,
    color = ink,
    align: "left" | "center" | "right" = "left",
  ) => {
    pdf
      .font(block.bold ? "QuoteBold" : "Quote")
      .fontSize(block.size)
      .fillColor(color);
    block.lines.forEach((text, index) => {
      pdf.text(text, x, top + index * block.size * 1.45, {
        width: availableWidth,
        align,
        lineBreak: false,
      });
    });
  };

  const text = (
    value: string,
    x: number,
    top: number,
    availableWidth: number,
    size = 8,
    bold = false,
    color = ink,
    align: "left" | "center" | "right" = "left",
  ) => {
    const block = layoutText(value, availableWidth, size, bold);
    drawText(block, x, top, availableWidth, color, align);
    return block.height;
  };

  const rule = (x: number, top: number, end: number, color = lineColor) => {
    pdf
      .save()
      .lineWidth(0.6)
      .strokeColor(color)
      .moveTo(x, top)
      .lineTo(end, top)
      .stroke()
      .restore();
  };

  const icon = (
    kind: "pin" | "phone" | "mail" | "file" | "user" | "box",
    x: number,
    top: number,
    size = 11,
  ) => {
    pdf
      .save()
      .translate(x, top)
      .scale(size / 24)
      .lineWidth(1.8)
      .strokeColor(green);
    if (kind === "pin") {
      pdf
        .path(
          "M20 10C20 16 12 22 12 22C12 22 4 16 4 10C4 5.6 7.6 2 12 2C16.4 2 20 5.6 20 10Z",
        )
        .stroke();
      pdf.circle(12, 10, 2.5).stroke();
    } else if (kind === "phone") {
      pdf
        .path(
          "M22 16.9V20C22 21.1 21.1 22 20 22C10.4 21.2 2.8 13.6 2 4C2 2.9 2.9 2 4 2H7L9 7L7 9C8.6 12.3 11.7 15.4 15 17L17 15Z",
        )
        .stroke();
    } else if (kind === "mail") {
      pdf.rect(2, 4, 20, 16).stroke();
      pdf.moveTo(2, 5).lineTo(12, 13).lineTo(22, 5).stroke();
    } else if (kind === "file") {
      pdf.path("M14 2H5V22H19V7Z M14 2V7H19 M8 12H16 M8 16H16").stroke();
    } else if (kind === "user") {
      pdf.circle(12, 6, 4).stroke();
      pdf.path("M3 22V19C3 14 7 13 12 13C17 13 21 14 21 19V22Z").stroke();
    } else {
      pdf.path("M12 2L22 7V17L12 22L2 17V7Z M2 7L12 12L22 7 M12 12V22").stroke();
    }
    pdf.restore();
  };

  const columns = [
    { title: "#", width: 28, align: "center" as const },
    { title: headings.itemDescription, width: 176, align: "left" as const },
    { title: "HSN/SAC", width: 53, align: "center" as const },
    { title: "Qty", width: 47, align: "center" as const },
    { title: "Unit price", width: 70, align: "right" as const },
    { title: "GST", width: 59, align: "center" as const },
    { title: "Amount", width: width - 433, align: "right" as const },
  ];
  const columnX = columns.map(
    (_, index) =>
      left + columns.slice(0, index).reduce((sum, column) => sum + column.width, 0),
  );

  const tableHeader = () => {
    const height = Math.max(
      25,
      ...columns.map(
        (column) =>
          layoutText(
            column.title,
            column.width - 14,
            column.title === "HSN/SAC" ? 6.6 : 7.5,
            true,
          ).height + 14,
      ),
    );
    pdf.save().roundedRect(left, y, width, height, 5).fill(green);
    pdf
      .rect(left, y + height - 5, width, 5)
      .fill(green)
      .restore();
    columns.forEach((column, index) => {
      text(
        column.title,
        (columnX[index] ?? left) + 7,
        y + 7,
        column.width - 14,
        column.title === "HSN/SAC" ? 6.6 : 7.5,
        true,
        "#ffffff",
        column.align,
      );
    });
    y += height;
  };

  const nextPage = (withTable = false) => {
    pdf.addPage();
    text(quote.seller.display_name, left, 28, width / 2, 10, true, green);
    text(
      `Quotation ${quote.reference} · Version ${quote.version_number}`,
      right - width / 2,
      28,
      width / 2,
      7.5,
      false,
      muted,
      "right",
    );
    rule(left, 53, right);
    y = 68;
    if (withTable) tableHeader();
  };

  const ensureSpace = (height: number, withTable = false) => {
    if (y + height > bottom) nextPage(withTable);
    if (y + height > bottom)
      throw new Error("Quotation content is too long for the PDF layout.");
  };

  const contactRows = [
    { kind: "pin" as const, value: quote.seller.address },
    { kind: "phone" as const, value: quote.seller.phone },
    { kind: "mail" as const, value: quote.seller.email },
    {
      kind: "file" as const,
      value:
        quote.seller.gst_registered && quote.seller.gstin
          ? `GSTIN: ${quote.seller.gstin}`
          : null,
    },
  ].filter((row): row is typeof row & { value: string } => Boolean(row.value));
  const contactBlocks = contactRows.map((row) => ({
    ...row,
    block: layoutText(row.value, 201, 8),
  }));
  const contactHeight = contactBlocks.reduce(
    (sum, row) => sum + Math.max(11, row.block.height) + 4,
    0,
  );
  const brand = logo ? null : layoutText(quote.seller.display_name, 240, 25, true);
  const headerHeight = Math.max(90, contactHeight + 26, (brand?.height ?? 64) + 30);
  if (headerHeight > 450)
    throw new Error("Seller details are too long for the PDF header.");

  pdf.save().rect(0, 0, pdf.page.width, headerHeight).fill("#f2f8f5");
  pdf.rect(0, 0, pdf.page.width, headerHeight).clip();
  pdf.translate(pdf.page.width - 245, headerHeight - 110).scale(0.62);
  pdf.path("M160 180C246 148 242 34 420 0V180H160Z").fill("#dcefe7");
  pdf.path("M115 180C172 170 202 137 207 88C157 99 148 151 115 180Z").fill("#e1f1e9");
  pdf.path("M238 180C302 128 356 119 420 153V180H238Z").fill("#d4eade");
  pdf.restore();
  if (logo) {
    pdf.image(logo, left, (headerHeight - 64) / 2, {
      fit: [240, 64],
      valign: "center",
    });
  } else if (brand) {
    drawText(brand, left, (headerHeight - brand.height) / 2, 240, green);
  }
  let contactY = (headerHeight - contactHeight) / 2;
  contactBlocks.forEach((row) => {
    icon(row.kind, right - 220, contactY + 1);
    drawText(row.block, right - 201, contactY, 201);
    contactY += Math.max(11, row.block.height) + 4;
  });

  y = headerHeight + 17;
  const titleBlock = layoutText(headings.documentTitle, width, 27, true);
  const titleHeight = Math.max(38, titleBlock.height);
  drawText(titleBlock, left, y, width);
  text("Prepared for your review.", left, y + titleHeight, width, 8.5, false, muted);
  rule(left, y + titleHeight + 17, right);
  pdf
    .save()
    .lineWidth(2)
    .strokeColor("#11835c")
    .moveTo(left, y + titleHeight + 17)
    .lineTo(left + 29, y + titleHeight + 17)
    .stroke()
    .restore();
  y += titleHeight + 32;

  const metadata = [
    ["Quotation No.", quote.reference],
    ["Version", String(quote.version_number)],
    ["Valid until", formatQuotationDate(quote.valid_until)],
    ["Status", quote.state.replaceAll("_", " ")],
  ];
  const metaBlocks = metadata.map(([label, value]) => ({
    label: label ?? "",
    block: layoutText(value ?? "", 156, 8.5, true),
  }));
  const metaHeight = metaBlocks.reduce(
    (sum, row) => sum + Math.max(18, row.block.height + 5),
    0,
  );
  const buyerRows = [
    { kind: "user" as const, value: quote.buyer.display_name, bold: true },
    { kind: "user" as const, value: quote.buyer.contact_name, bold: false },
    { kind: "pin" as const, value: quote.buyer.billing_address, bold: false },
    { kind: "phone" as const, value: quote.buyer.phone, bold: false },
    { kind: "mail" as const, value: quote.buyer.email, bold: false },
    {
      kind: "file" as const,
      value:
        quote.buyer.gstin_applicable && quote.buyer.gstin
          ? `GSTIN: ${quote.buyer.gstin}`
          : null,
      bold: false,
    },
  ].filter((row): row is typeof row & { value: string } => Boolean(row.value));
  const buyerBlocks = buyerRows.map((row) => ({
    ...row,
    block: layoutText(row.value, 188, row.bold ? 9 : 8, row.bold),
  }));
  const customerTitle = layoutText(headings.customerTitle, 200, 8, true);
  const buyerHeight =
    buyerBlocks.reduce((sum, row) => sum + Math.max(12, row.block.height) + 3, 0) +
    customerTitle.height +
    16;
  ensureSpace(Math.max(metaHeight + 12, buyerHeight));
  let metaY = y + 7;
  metaBlocks.forEach((row) => {
    text(row.label, left, metaY, 91, 8.5, false, muted);
    drawText(row.block, left + 92, metaY, 156);
    metaY += Math.max(18, row.block.height + 5);
  });
  const buyerX = right - 225;
  pdf.save().roundedRect(buyerX, y, 225, buyerHeight, 6).fill("#f4f6f7").restore();
  drawText(customerTitle, buyerX + 12, y + 10, 200, green);
  let buyerY = y + customerTitle.height + 12;
  buyerBlocks.forEach((row) => {
    icon(row.kind, buyerX + 12, buyerY + 1);
    drawText(row.block, buyerX + 30, buyerY, 188);
    buyerY += Math.max(12, row.block.height) + 3;
  });
  y += Math.max(metaHeight + 12, buyerHeight) + 11;

  const supplyBlock = layoutText(quotationSupplyDetails(quote).join("\n"), width - 66, 7.5);
  const detailsTitle = layoutText(headings.detailsTitle, width - 65, 8.8, true);
  const supplyHeight = Math.max(44, supplyBlock.height + detailsTitle.height + 18);
  ensureSpace(supplyHeight + 14);
  pdf.save().roundedRect(left, y, width, supplyHeight, 6).fill("#eff7f3").restore();
  pdf
    .save()
    .circle(left + 24, y + supplyHeight / 2, 15)
    .fill("#e5f2eb")
    .restore();
  icon("file", left + 16, y + supplyHeight / 2 - 9, 18);
  drawText(detailsTitle, left + 51, y + 9, width - 65);
  drawText(supplyBlock, left + 51, y + 9 + detailsTitle.height, width - 65, muted);
  y += supplyHeight + 10;
  ensureSpace(70);
  tableHeader();

  for (const item of quote.lines) {
    const description = splitQuotationDescription(item.description);
    const title = layoutText(description.title, 160, 8.3, true);
    const detail = description.detail ? layoutText(description.detail, 160, 7.2) : null;
    const gst = quotationGstLabel(item);
    const values = [
      String(item.position),
      "",
      item.hsn_sac ?? "-",
      formatQuotationQuantity(item.quantity) +
        (item.unit_label ? `\n${item.unit_label}` : ""),
      formatPaise(item.unit_price_minor),
      gst.rate + (gst.treatment ? `\n(${gst.treatment})` : ""),
      formatPaise(item.line_total_minor),
    ];
    const blocks = values.map((value, index) =>
      layoutText(value, (columns[index]?.width ?? 50) - 14, index === 5 ? 6.2 : 8),
    );
    const taxDetails = [
      item.gst_rate !== null ? `Taxable ${formatPaise(item.taxable_amount_minor)}` : null,
      BigInt(item.cgst_amount_minor) !== BigInt(0)
        ? `CGST ${formatPaise(item.cgst_amount_minor)}`
        : null,
      BigInt(item.sgst_amount_minor) !== BigInt(0)
        ? `SGST ${formatPaise(item.sgst_amount_minor)}`
        : null,
      BigInt(item.igst_amount_minor) !== BigInt(0)
        ? `IGST ${formatPaise(item.igst_amount_minor)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const taxBlock = taxDetails ? layoutText(taxDetails, width - 24, 6.4) : null;
    const contentHeight = Math.max(
      24,
      title.height + (detail ? detail.height + 3 : 0),
      ...blocks.map((block) => block.height),
    );
    const rowHeight = contentHeight + 14 + (taxBlock ? taxBlock.height + 2 : 0);
    ensureSpace(rowHeight, true);
    const rowY = y;
    rule(left, rowY, right);
    columns.forEach((column, index) => {
      const x = columnX[index] ?? left;
      if (index > 0) {
        pdf
          .save()
          .lineWidth(0.4)
          .strokeColor(lineColor)
          .moveTo(x, rowY)
          .lineTo(x, rowY + contentHeight + 12)
          .stroke()
          .restore();
      }
      if (index === 1) {
        drawText(title, x + 8, rowY + 8, 160);
        if (detail) drawText(detail, x + 8, rowY + 11 + title.height, 160, muted);
      } else {
        const block = blocks[index];
        if (block) drawText(block, x + 7, rowY + 8, column.width - 14, ink, column.align);
      }
    });
    if (taxBlock)
      drawText(taxBlock, left + 12, rowY + contentHeight + 11, width - 24, muted);
    y += rowHeight;
    rule(left, y, right);

    let componentIndex = 0;
    while (componentIndex < item.components.length) {
      const nestedWidth = width - 48;
      const componentColumns = [24, nestedWidth - 232, 50, 77, 81];
      const componentXs = componentColumns.map(
        (_, index) =>
          left +
          24 +
          componentColumns.slice(0, index).reduce((sum, value) => sum + value, 0),
      );
      const remaining = item.components.slice(componentIndex).map((component) => {
        const values = [
          String(component.position),
          component.description,
          formatQuotationQuantity(component.quantity) +
            (component.unit_label ? `\n${component.unit_label}` : ""),
          formatPaise(component.unit_price_minor),
          formatPaise(componentAmountMinor(component.quantity, component.unit_price_minor)),
        ];
        const blocks = values.map((value, index) =>
          layoutText(value, (componentColumns[index] ?? 40) - 12, 7.2),
        );
        return {
          blocks,
          height: Math.max(18, ...blocks.map((block) => block.height + 8)),
        };
      });
      const first = remaining[0];
      if (!first) break;
      const materialTitle = layoutText(
        `${headings.materialsTitle} - item ${item.position}${componentIndex ? ", continued" : ""}`,
        width - 69,
        8,
        true,
      );
      const headingHeight = materialTitle.height + 34;
      ensureSpace(headingHeight + first.height + 20, true);
      const selected: typeof remaining = [];
      let rowsHeight = 0;
      for (const row of remaining) {
        if (y + headingHeight + rowsHeight + row.height + 20 > bottom) break;
        selected.push(row);
        rowsHeight += row.height;
      }
      if (!selected.length)
        throw new Error("Quotation subproduct is too long for the PDF layout.");
      const cardY = y + 6;
      const cardHeight = headingHeight + rowsHeight + 5;
      pdf
        .save()
        .roundedRect(left + 12, cardY, width - 24, cardHeight, 5)
        .fillAndStroke("#f7f9f8", lineColor)
        .restore();
      icon("box", left + 23, cardY + 10, 14);
      drawText(materialTitle, left + 45, cardY + 8, width - 69);
      text(
        "Breakdown only - these amounts are not added to the quotation total.",
        left + 45,
        cardY + 10 + materialTitle.height,
        width - 69,
        6.6,
        false,
        muted,
      );
      const nestedHeaderY = cardY + 19 + materialTitle.height;
      pdf
        .save()
        .rect(left + 24, nestedHeaderY, nestedWidth, 17)
        .fill("#eaf2ee")
        .restore();
      ["#", "Item", "Qty", "Rate", "Amount"].forEach((label, index) => {
        text(
          label,
          (componentXs[index] ?? left) + 6,
          nestedHeaderY + 4,
          (componentColumns[index] ?? 40) - 12,
          6.8,
          true,
          ink,
          index >= 3 ? "right" : "left",
        );
      });
      let nestedY = nestedHeaderY + 17;
      selected.forEach((row) => {
        row.blocks.forEach((block, index) => {
          drawText(
            block,
            (componentXs[index] ?? left) + 6,
            nestedY + 5,
            (componentColumns[index] ?? 40) - 12,
            ink,
            index >= 3 ? "right" : "left",
          );
        });
        nestedY += row.height;
        rule(left + 24, nestedY, right - 24);
      });
      componentIndex += selected.length;
      y = cardY + cardHeight + 8;
      rule(left, y, right);
    }
  }

  y += 12;
  const totalRows = quotationTotalRows(quote);
  const grandTitle = layoutText(
    `${headings.totalTitle} (${quote.document.currency_code})`,
    115,
    8.2,
    true,
  );
  const grandHeight = Math.max(31, grandTitle.height + 18);
  const totalHeight = totalRows.length * 16 + grandHeight + 3;
  ensureSpace(totalHeight);
  const totalX = right - 222;
  pdf.save().roundedRect(totalX, y, 222, totalHeight, 6).fill("#f4f6f7").restore();
  totalRows.forEach((row, index) => {
    text(row.label, totalX + 12, y + 8 + index * 16, 102, 8, false, muted);
    text(
      formatPaise(row.value),
      totalX + 109,
      y + 8 + index * 16,
      101,
      8,
      false,
      ink,
      "right",
    );
  });
  const grandY = y + totalRows.length * 16 + 3;
  pdf.save().roundedRect(totalX, grandY, 222, grandHeight, 6).fill("#eaf5ef");
  pdf.rect(totalX, grandY, 222, 8).fill("#eaf5ef").restore();
  drawText(grandTitle, totalX + 11, grandY + 9, 115);
  const grandAmount = formatPaise(quote.totals.total_minor);
  let grandAmountSize = 11;
  pdf.font("QuoteBold").fontSize(grandAmountSize);
  while (pdf.widthOfString(grandAmount) > 81 && grandAmountSize > 6.5) {
    grandAmountSize -= 0.5;
    pdf.fontSize(grandAmountSize);
  }
  text(
    grandAmount,
    totalX + 130,
    grandY + 7,
    81,
    grandAmountSize,
    true,
    "#087546",
    "right",
  );
  text("i", left, y + 2, 10, 9, true, "#0781ba");
  text(quotationPriceNote(quote), left + 16, y + 3, width - 260, 7.4, false, muted);
  y += totalHeight + 12;

  const payments = quotationPaymentDetails(quote);
  const sections = [
    quote.document.terms
      ? { title: headings.termsTitle, value: quote.document.terms }
      : null,
    payments.length ? { title: headings.paymentTitle, value: payments.join("\n") } : null,
  ].filter((section): section is { title: string; value: string } => Boolean(section));

  const acceptanceTitle = layoutText(headings.acceptanceTitle, 240, 10, true);
  const acceptanceHeight = acceptanceTitle.height + 75;
  const acceptance = (top: number) => {
    const x = right - 240;
    drawText(acceptanceTitle, x, top, 240, green);
    const boxY = top + acceptanceTitle.height + 5;
    pdf.save().roundedRect(x, boxY, 240, 68, 6).fill("#eff7f3").restore();
    text("Please confirm your acceptance of this quotation.", x + 11, boxY + 10, 218, 7.3);
    rule(x + 11, boxY + 44, x + 135, "#52645b");
    rule(x + 157, boxY + 44, x + 229, "#52645b");
    text("Signature over printed name", x + 11, boxY + 50, 135, 6.5);
    text("Date", x + 157, boxY + 50, 72, 6.5);
  };
  const sectionBlocks = sections.map((section) => ({
    ...section,
    block: layoutText(section.value, 242, 7.5),
    titleBlock: layoutText(section.title, 242, 10, true),
  }));
  const sectionHeight = sectionBlocks.reduce(
    (sum, section) => sum + section.titleBlock.height + 10 + section.block.height,
    0,
  );
  if (sectionHeight <= 180) {
    ensureSpace(Math.max(sectionHeight, acceptanceHeight) + 13);
    rule(left, y, right, "#a5b5ae");
    y += 13;
    let sectionY = y;
    sectionBlocks.forEach((section) => {
      drawText(section.titleBlock, left, sectionY, 242, green);
      drawText(section.block, left, sectionY + section.titleBlock.height + 6, 242, muted);
      sectionY += section.titleBlock.height + 10 + section.block.height;
    });
    if (sections.length) {
      pdf
        .save()
        .lineWidth(0.6)
        .strokeColor(lineColor)
        .moveTo(right - 254, y)
        .lineTo(right - 254, y + Math.max(sectionHeight, acceptanceHeight))
        .stroke()
        .restore();
    }
    acceptance(y);
    y += Math.max(sectionHeight, acceptanceHeight);
  } else {
    for (const section of sections) {
      const block = layoutText(section.value, width, 8);
      const sectionTitle = layoutText(section.title, width, 10, true);
      ensureSpace(sectionTitle.height + 32);
      rule(left, y, right);
      y += 13;
      drawText(sectionTitle, left, y, width, green);
      y += sectionTitle.height + 7;
      for (const row of block.lines) {
        if (y + 12 > bottom) {
          nextPage();
          const continuedTitle = layoutText(
            `${section.title} (continued)`,
            width,
            10,
            true,
          );
          drawText(continuedTitle, left, y, width, green);
          y += continuedTitle.height + 7;
        }
        text(row, left, y, width, 8, false, muted);
        y += 12;
      }
      y += 15;
    }
    ensureSpace(acceptanceHeight);
    acceptance(y);
  }

  const range = pdf.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    pdf.switchToPage(page);
    const footerMargin = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    rule(left, 798, right);
    const contact = [
      quote.seller.address.split("\n")[0],
      quote.seller.phone,
      quote.seller.email,
    ]
      .filter(Boolean)
      .join(" · ");
    pdf.font("Quote").fontSize(6.3);
    let footerContact = contact;
    while (pdf.widthOfString(footerContact) > width - 181)
      footerContact = footerContact.slice(0, -2);
    if (footerContact !== contact) footerContact += "…";
    text(footerContact, left, 809, width - 173, 6.3, false, muted);
    text(
      "Thank you for your business!",
      right - 168,
      807,
      168,
      8,
      true,
      "#087546",
      "right",
    );
    text(
      `Quotation ${quote.reference} · ${page + 1} / ${range.count}`,
      left,
      831,
      width,
      6.2,
      false,
      muted,
      "center",
    );
    pdf.page.margins.bottom = footerMargin;
  }
  pdf.end();
  return output;
}
