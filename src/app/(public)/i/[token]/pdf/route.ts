import { headers } from "next/headers";
import { publicInvoiceToDocument } from "@/server/modules/invoices/document-model";
import { renderInvoicePdf } from "@/server/modules/invoices/pdf";
import type { PublicInvoice } from "@/server/modules/invoices/public-broker";
import { readPublicInvoice } from "@/server/modules/invoices/public-broker";
import { allowPublicInvoiceRequest } from "@/server/modules/invoices/public-rate-limit";
import { hashInvoiceToken } from "@/server/modules/invoices/token";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function unavailable(status = 404) {
  return new Response("Invoice link unavailable.", {
    status,
    headers: { ...noStoreHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function validPublicInvoice(value: unknown): value is PublicInvoice {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicInvoice>;
  return (
    candidate.kind === "invoice" &&
    typeof candidate.reference === "string" &&
    candidate.document !== undefined &&
    Array.isArray(candidate.lines) &&
    candidate.lines.length > 0 &&
    candidate.lines.length <= 100
  );
}

export async function GET(_request: Request, context: RouteContext<"/i/[token]/pdf">) {
  const { token } = await context.params;
  const tokenHash = hashInvoiceToken(token);
  if (!tokenHash) return unavailable();
  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client";
  if (!allowPublicInvoiceRequest(clientAddress, "pdf")) return unavailable(429);

  try {
    const { data, error } = await readPublicInvoice(tokenHash);
    if (error || !validPublicInvoice(data)) return unavailable();
    const document = publicInvoiceToDocument(data);
    const pdf = await renderInvoicePdf(document);
    const body = new Uint8Array(pdf.byteLength);
    body.set(pdf);
    return new Response(body, {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="invoice.pdf"',
        "Content-Length": String(pdf.byteLength),
      },
    });
  } catch {
    return unavailable(503);
  }
}
