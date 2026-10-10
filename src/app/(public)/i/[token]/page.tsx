import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InvoiceDocumentView } from "@/components/invoices/invoice-document-view";
import { publicInvoiceToDocument } from "@/server/modules/invoices/document-model";
import type { PublicInvoice } from "@/server/modules/invoices/public-broker";
import { readPublicInvoice } from "@/server/modules/invoices/public-broker";
import { allowPublicInvoiceRequest } from "@/server/modules/invoices/public-rate-limit";
import { hashInvoiceToken } from "@/server/modules/invoices/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared invoice",
  robots: { index: false, follow: false },
};

function validPublicInvoice(value: unknown): value is PublicInvoice {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicInvoice>;
  return (
    candidate.kind === "invoice" &&
    typeof candidate.reference === "string" &&
    typeof candidate.invoice_date === "string" &&
    candidate.seller !== undefined &&
    candidate.buyer !== undefined &&
    candidate.document !== undefined &&
    candidate.totals !== undefined &&
    candidate.remittance !== undefined &&
    Array.isArray(candidate.lines) &&
    candidate.lines.length > 0 &&
    candidate.lines.length <= 100
  );
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashInvoiceToken(token);
  if (!tokenHash) notFound();

  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client";
  if (!allowPublicInvoiceRequest(clientAddress, "read")) notFound();

  let result: Awaited<ReturnType<typeof readPublicInvoice>> | null = null;
  try {
    result = await readPublicInvoice(tokenHash);
  } catch {
    notFound();
  }
  if (result.error || !validPublicInvoice(result.data)) notFound();

  const invoice = publicInvoiceToDocument(result.data);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <InvoiceDocumentView document={invoice} pdfHref={`/i/${token}/pdf`} />
    </main>
  );
}
