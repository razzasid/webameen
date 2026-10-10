import { unstable_rethrow } from "next/navigation";
import { toInvoiceDocument } from "@/server/modules/invoices/document-model";
import { renderInvoicePdf } from "@/server/modules/invoices/pdf";
import { findInvoiceForOwner } from "@/server/modules/invoices/queries";
import { isUuid } from "@/server/shared/uuid";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_request: Request, context: RouteContext<"/invoices/[id]/pdf">) {
  const { id } = await context.params;
  if (!isUuid(id))
    return new Response("Invoice unavailable.", { status: 404, headers: privateHeaders });
  try {
    const invoice = await findInvoiceForOwner(id);
    if (!invoice)
      return new Response("Invoice unavailable.", { status: 404, headers: privateHeaders });
    const pdf = await renderInvoicePdf(toInvoiceDocument(invoice));
    const body = new Uint8Array(pdf.byteLength);
    body.set(pdf);
    return new Response(body, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="invoice.pdf"',
        "Content-Length": String(pdf.byteLength),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    return new Response("Invoice PDF is temporarily unavailable.", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
