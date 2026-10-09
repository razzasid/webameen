"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import { isUuid } from "@/server/shared/uuid";
import { createQuotationToken } from "./token";
import {
  type QuoteCalculation,
  quoteLinesSchema,
  quoteSnapshotSchema,
  toRpcLines,
  toRpcSnapshot,
} from "./validation";

export type NewQuotationState = { error?: string };
export async function createQuotationAction(
  _previous: NewQuotationState,
  formData: FormData,
): Promise<NewQuotationState> {
  await requireAuthenticatedUser();
  const customerId = String(formData.get("customerId") ?? "");
  const requestKey = String(formData.get("requestKey") ?? "");
  if (!isUuid(customerId) || !isUuid(requestKey)) {
    return { error: "Select an active customer and try again." };
  }
  let quoteId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_quotation_draft", {
      p_request_key: requestKey,
      p_customer_id: customerId,
    });
    if (error)
      return {
        error:
          error.code === "22023"
            ? "Select an active customer."
            : "Could not create the draft. Please try again.",
      };
    quoteId = data as string;
  } catch {
    return { error: "Quotation creation is temporarily unavailable. Please try again." };
  }
  revalidatePath("/quotations");
  redirect(`/quotations/${quoteId}`);
}

export type DraftActionState = {
  error?: string;
  preview?: QuoteCalculation;
  previewed?: boolean;
};

function safeJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.length > 100_000) throw new Error("Invalid input");
  return JSON.parse(value) as unknown;
}

export async function editQuotationDraftAction(
  _previous: DraftActionState,
  formData: FormData,
): Promise<DraftActionState> {
  await requireAuthenticatedUser();
  const quoteId = String(formData.get("quoteId") ?? "");
  const sequenceText = String(formData.get("editSequence") ?? "");
  if (!isUuid(quoteId) || !/^\d{1,10}$/.test(sequenceText)) {
    return { error: "Reload this draft and try again." };
  }
  const sequence = Number(sequenceText);
  if (!Number.isSafeInteger(sequence) || sequence > 2147483647) {
    return { error: "Reload this draft and try again." };
  }
  let rawSnapshot: unknown;
  let rawLines: unknown;
  try {
    rawSnapshot = safeJson(formData.get("snapshotJson"));
    rawLines = safeJson(formData.get("linesJson"));
  } catch {
    return { error: "The quotation form is incomplete. Please try again." };
  }
  const snapshot = quoteSnapshotSchema.safeParse(rawSnapshot);
  if (!snapshot.success) {
    const issue = snapshot.error.issues[0];
    return { error: `${String(issue.path[0] ?? "Document")}: ${issue.message}` };
  }
  const lines = quoteLinesSchema.safeParse(rawLines);
  if (!lines.success) {
    const issue = lines.error.issues[0];
    const lineNumber = typeof issue.path[0] === "number" ? issue.path[0] + 1 : null;
    return { error: `${lineNumber ? `Line ${lineNumber}: ` : ""}${issue.message}` };
  }

  const intent = formData.get("intent") === "preview" ? "preview" : "save";
  let preview: QuoteCalculation | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      intent === "preview" ? "preview_quotation_draft" : "save_quotation_draft",
      {
        p_quotation_id: quoteId,
        p_expected_edit_sequence: sequence,
        p_snapshot: toRpcSnapshot(snapshot.data),
        p_lines: toRpcLines(lines.data),
      },
    );
    if (error) {
      if (error.code === "40001")
        return { error: "This draft changed elsewhere. Reload before editing again." };
      if (error.code === "P0002" || error.code === "42501")
        return { error: "This quotation is unavailable." };
      if (error.code === "23514")
        return { error: "This quotation is no longer an editable draft." };
      if (error.code === "22023")
        return {
          error: error.message.includes("time zone")
            ? "Select a valid document time zone."
            : "Review the document details, lines, and currently configured GST rates.",
        };
      return { error: "Could not calculate this draft. Please try again." };
    }
    preview = data as QuoteCalculation;
  } catch {
    return { error: "Quotation service is temporarily unavailable. Please try again." };
  }
  if (intent === "preview") return { preview: preview ?? undefined, previewed: true };
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quoteId}`);
  redirect(`/quotations/${quoteId}?saved=1`);
}

export type QuotationWorkflowActionState = {
  error?: string;
  message?: string;
  rawToken?: string;
};

export async function shareQuotationAction(
  _previous: QuotationWorkflowActionState,
  formData: FormData,
): Promise<QuotationWorkflowActionState> {
  await requireAuthenticatedUser();
  const quotationId = String(formData.get("quotationId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const requestKey = String(formData.get("requestKey") ?? "");
  if (![quotationId, versionId, requestKey].every(isUuid))
    return { error: "Reload the quotation and try again." };

  const { token, tokenHashHex } = createQuotationToken();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("share_quotation_draft", {
      p_quotation_id: quotationId,
      p_version_id: versionId,
      p_creation_request_key: requestKey,
      p_token_hash_hex: tokenHashHex,
      p_access_expires_at: null,
    });
    if (error) return { error: safeWorkflowError(error.code) };
    const result = data as { created?: boolean };
    if (!result.created)
      return {
        message:
          "This share attempt already completed. Its link cannot be recovered; rotate it to create a new link.",
      };
    return {
      rawToken: token,
      message: "Quotation shared. Copy this link now; Webameen cannot show it again.",
    };
  } catch {
    return { error: "Quotation sharing is temporarily unavailable. Please try again." };
  }
}

export async function rotateQuotationLinkAction(
  _previous: QuotationWorkflowActionState,
  formData: FormData,
): Promise<QuotationWorkflowActionState> {
  await requireAuthenticatedUser();
  const quotationId = String(formData.get("quotationId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const requestKey = String(formData.get("requestKey") ?? "");
  if (![quotationId, versionId, requestKey].every(isUuid))
    return { error: "Reload the quotation and try again." };
  const { token, tokenHashHex } = createQuotationToken();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("rotate_quotation_link", {
      p_quotation_id: quotationId,
      p_version_id: versionId,
      p_creation_request_key: requestKey,
      p_token_hash_hex: tokenHashHex,
      p_access_expires_at: null,
    });
    if (error) return { error: safeWorkflowError(error.code) };
    const result = data as { created?: boolean };
    if (!result.created)
      return {
        message:
          "This rotation already completed. Create a new rotation to reveal a replacement link.",
      };
    return {
      rawToken: token,
      message: "A replacement link is ready. The previous link has been revoked.",
    };
  } catch {
    return { error: "Link rotation is temporarily unavailable. Please try again." };
  }
}

export async function revokeQuotationLinkAction(
  _previous: QuotationWorkflowActionState,
  formData: FormData,
): Promise<QuotationWorkflowActionState> {
  await requireAuthenticatedUser();
  const quotationId = String(formData.get("quotationId") ?? "");
  const linkId = String(formData.get("linkId") ?? "");
  if (![quotationId, linkId].every(isUuid))
    return { error: "Reload the quotation and try again." };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("revoke_quotation_link", {
      p_quotation_id: quotationId,
      p_link_id: linkId,
    });
    if (error) return { error: safeWorkflowError(error.code) };
    revalidatePath(`/quotations/${quotationId}`);
    return { message: "The quotation link has been revoked." };
  } catch {
    return { error: "Link revocation is temporarily unavailable. Please try again." };
  }
}

export async function createQuotationRevisionAction(
  _previous: QuotationWorkflowActionState,
  formData: FormData,
): Promise<QuotationWorkflowActionState> {
  await requireAuthenticatedUser();
  const quotationId = String(formData.get("quotationId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (![quotationId, versionId].every(isUuid))
    return { error: "Reload the quotation and try again." };
  let revisionId: string;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_quotation_revision", {
      p_quotation_id: quotationId,
      p_predecessor_version_id: versionId,
    });
    if (error) return { error: safeWorkflowError(error.code) };
    revisionId = data as string;
  } catch {
    return { error: "Quotation revision is temporarily unavailable. Please try again." };
  }
  revalidatePath("/quotations");
  redirect(`/quotations/${quotationId}?revision=${revisionId}`);
}

function safeWorkflowError(code: string | undefined): string {
  if (code === "42501" || code === "P0002") return "This quotation is unavailable.";
  if (code === "23514" || code === "22023")
    return "This quotation cannot complete that action in its current state. Reload and review it.";
  return "The quotation could not be updated. Please try again.";
}
