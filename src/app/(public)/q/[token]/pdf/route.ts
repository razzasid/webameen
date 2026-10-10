import { headers } from "next/headers";
import { toQuotationDocument } from "@/server/modules/quotations/document-model";
import { renderQuotationPdf } from "@/server/modules/quotations/pdf";
import type { PublicQuotation } from "@/server/modules/quotations/public-broker";
import { readPublicQuotation } from "@/server/modules/quotations/public-broker";
import { allowPublicQuotationRequest } from "@/server/modules/quotations/rate-limit";
import { hashQuotationToken } from "@/server/modules/quotations/token";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function unavailable(status = 404) {
  return new Response("Quotation link unavailable.", {
    status,
    headers: { ...noStoreHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(_request: Request, context: RouteContext<"/q/[token]/pdf">) {
  const { token } = await context.params;
  const tokenHash = hashQuotationToken(token);
  if (!tokenHash) return unavailable();
  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client";
  if (!allowPublicQuotationRequest(clientAddress, "pdf")) return unavailable(429);

  try {
    const { data, error } = await readPublicQuotation(tokenHash);
    if (error || !data) return unavailable();
    const quote = toQuotationDocument(data as unknown as PublicQuotation);
    const pdf = await renderQuotationPdf(quote);
    const body = new Uint8Array(pdf.byteLength);
    body.set(pdf);
    return new Response(body, {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="quotation.pdf"',
        "Content-Length": String(pdf.byteLength),
      },
    });
  } catch {
    return unavailable(503);
  }
}
