"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import { isUuid } from "@/server/shared/uuid";
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
