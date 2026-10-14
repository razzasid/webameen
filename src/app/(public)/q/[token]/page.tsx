import { Download } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicResponseForm } from "@/components/quotations/public-response-form";
import { QuotationDocumentView } from "@/components/quotations/quotation-document";
import styles from "@/components/quotations/quotation-document.module.css";
import { toQuotationDocument } from "@/server/modules/quotations/document-model";
import {
  type PublicQuotation,
  readPublicQuotation,
} from "@/server/modules/quotations/public-broker";
import { allowPublicQuotationRequest } from "@/server/modules/quotations/rate-limit";
import { hashQuotationToken } from "@/server/modules/quotations/token";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicQuotationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHashHex = hashQuotationToken(token);
  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client";
  if (!tokenHashHex || !allowPublicQuotationRequest(clientAddress, "read")) notFound();
  const { data, error } = await readPublicQuotation(tokenHashHex);
  if (error || !data) notFound();
  const quote = data as unknown as PublicQuotation;
  const document = toQuotationDocument(quote);
  const canRespond =
    quote.state === "shared" &&
    !quote.response_deadline_passed &&
    !quote.revision_in_preparation &&
    !quote.response;

  const notice = quote.revision_in_preparation ? (
    <p role="status">
      The business is preparing a revised quotation. This earlier version is shown for
      reference and cannot receive a response.
    </p>
  ) : quote.response_deadline_passed && !quote.response ? (
    <p role="status">
      The response period has ended. This quotation remains available for viewing.
    </p>
  ) : quote.response ? (
    <p role="status">
      Response recorded: {quote.response.kind.replaceAll("_", " ")} on{" "}
      {new Date(quote.response.responded_at).toLocaleString("en-IN", {
        timeZone: document.document.document_time_zone,
      })}
      .
    </p>
  ) : null;

  return (
    <div className={styles.canvas}>
      <main className={styles.page}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarInfo}>
            <span>Quotation {quote.reference}</span>
            <span>Version {quote.version_number}</span>
            <span className={styles.statusBadge}>{quote.state.replaceAll("_", " ")}</span>
          </div>
          <a href={`/q/${token}/pdf`} className={styles.download}>
            <Download size={16} aria-hidden="true" />
            Download PDF
          </a>
        </div>
        <QuotationDocumentView
          quotation={document}
          notice={notice}
          acceptance={
            canRespond ? (
              <PublicResponseForm token={token} />
            ) : (
              <p className={styles.acceptanceText}>
                {quote.response
                  ? "Your response has already been recorded for this version."
                  : quote.revision_in_preparation
                    ? "A revised quotation is being prepared."
                    : "This quotation is available for viewing. Responses are currently closed."}
              </p>
            )
          }
        />
        <p className={styles.documentNote}>
          This page shows the quotation version shared with you. Responses are recorded once
          per version; names entered here are not verified identities.
        </p>
      </main>
    </div>
  );
}
