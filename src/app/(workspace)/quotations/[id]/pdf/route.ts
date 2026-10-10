import { unstable_rethrow } from "next/navigation";
import { toQuotationDocument } from "@/server/modules/quotations/document-model";
import { renderQuotationPdf } from "@/server/modules/quotations/pdf";
import { getLatestSharedQuotationDocument } from "@/server/modules/quotations/queries";
import { isUuid } from "@/server/shared/uuid";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  context: RouteContext<"/quotations/[id]/pdf">,
) {
  const { id } = await context.params;
  if (!isUuid(id))
    return new Response("Quotation unavailable.", { status: 404, headers: privateHeaders });
  try {
    const quotation = await getLatestSharedQuotationDocument(id);
    if (!quotation)
      return new Response("Quotation unavailable.", {
        status: 404,
        headers: privateHeaders,
      });
    const pdf = await renderQuotationPdf(toQuotationDocument(quotation));
    const body = new Uint8Array(pdf.byteLength);
    body.set(pdf);
    return new Response(body, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="quotation.pdf"',
        "Content-Length": String(pdf.byteLength),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    return new Response("Quotation PDF is temporarily unavailable.", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
