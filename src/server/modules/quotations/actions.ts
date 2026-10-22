"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import { reportSafeFailure } from "@/server/observability/report-safe-failure";
import { isUuid } from "@/server/shared/uuid";
import { quotationHeadingsSchema } from "./template-headings";
import { createQuotationToken } from "./token";
import {
  type QuoteCalculation,
  quoteCategoriesSchema,
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
  } catch (error) {
    return {
      error: reportSafeFailure(
        "quotation.create",
        error,
        "Quotation creation is temporarily unavailable. Please try again.",
      ),
    };
  }
  revalidatePath("/quotations");
  redirect(`/quotations/${quoteId}`);
}

export type DraftActionState = {
  error?: string;
  preview?: QuoteCalculation;
  previewed?: boolean;
};

export async function saveNewQuotationAction(
  _previous: DraftActionState,
  formData: FormData,
): Promise<DraftActionState> {
  await requireAuthenticatedUser();
  const requestKey = String(formData.get("requestKey") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  if (!isUuid(requestKey) || !isUuid(customerId))
    return { error: "Select a customer for this quotation." };
  let snapshot: ReturnType<typeof quoteSnapshotSchema.safeParse>;
  let lines: ReturnType<typeof quoteLinesSchema.safeParse>;
  let categories: ReturnType<typeof quoteCategoriesSchema.safeParse>;
  let headings: ReturnType<typeof quotationHeadingsSchema.safeParse>;
  try {
    snapshot = quoteSnapshotSchema.safeParse(safeJson(formData.get("snapshotJson")));
    lines = quoteLinesSchema.safeParse(safeJson(formData.get("linesJson")));
    categories = quoteCategoriesSchema.safeParse(safeJson(formData.get("categoriesJson")));
    headings = quotationHeadingsSchema.safeParse(safeJson(formData.get("headingsJson")));
  } catch {
    return { error: "The quotation form is incomplete. Your entries have been kept." };
  }
  if (!snapshot.success)
    return { error: snapshot.error.issues[0]?.message ?? "Review the document details." };
  if (!lines.success) {
    const issue = lines.error.issues[0];
    return {
      error: `${typeof issue?.path[0] === "number" ? `Line ${issue.path[0] + 1}: ` : ""}${issue?.message ?? "Review the items."}`,
    };
  }
  if (!headings.success)
    return { error: headings.error.issues[0]?.message ?? "Review the template headings." };
  if (!categories.success)
    return { error: categories.error.issues[0]?.message ?? "Review the main categories." };
  if (
    lines.data.some(
      (line) =>
        !line.categoryId ||
        !categories.data.some((category) => category.id === line.categoryId),
    )
  )
    return { error: "Assign every subcategory item to a main category." };
  const preview = formData.get("intent") === "preview";
  try {
    const supabase = await createSupabaseServerClient();
    if (!preview) {
      const { error: categorySchemaError } = await supabase
        .from("quotation_versions")
        .select("item_categories")
        .limit(0);
      if (categorySchemaError)
        return { error: quotationCategoryStorageError(categorySchemaError) };
    }
    const { data, error } = await supabase.rpc(
      preview ? "preview_new_quotation_draft" : "create_quotation_draft_with_content",
      {
        ...(preview ? {} : { p_request_key: requestKey }),
        p_customer_id: customerId,
        p_snapshot: {
          ...toRpcSnapshot(snapshot.data),
          template_headings: headings.data,
          item_categories: categories.data,
        },
        p_lines: toRpcLines(lines.data),
      },
    );
    if (error)
      return {
        error:
          error.code === "22023"
            ? safeDraftValidationError(error.message)
            : "Could not save this quotation. Your entries have been kept; please try again.",
      };
    if (preview) return { preview: data as QuoteCalculation, previewed: true };
  } catch (error) {
    return {
      error: reportSafeFailure(
        "quotation.create.save",
        error,
        "Quotation creation is temporarily unavailable. Your entries have been kept.",
      ),
    };
  }
  revalidatePath("/quotations");
  redirect(`/quotations/${requestKey}?saved=1`);
}

function safeJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.length > 100_000) throw new Error("Invalid input");
  return JSON.parse(value) as unknown;
}

function quotationCategoryStorageError(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  const missingCategoryColumn =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes("item_categories") && message.includes("schema cache"));
  return missingCategoryColumn
    ? "Quotation categories cannot be saved yet. Apply the pending quotation categories database update, then try again. Your entries have been kept."
    : "Could not verify quotation category storage. Your entries have been kept; try again.";
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
  let rawCategories: unknown;
  try {
    rawSnapshot = safeJson(formData.get("snapshotJson"));
    rawLines = safeJson(formData.get("linesJson"));
    rawCategories = safeJson(formData.get("categoriesJson"));
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
  const categories = quoteCategoriesSchema.safeParse(rawCategories);
  if (!categories.success)
    return { error: categories.error.issues[0]?.message ?? "Review the main categories." };
  if (
    lines.data.some(
      (line) =>
        !line.categoryId ||
        !categories.data.some((category) => category.id === line.categoryId),
    )
  )
    return { error: "Assign every subcategory item to a main category." };

  let headings: ReturnType<typeof quotationHeadingsSchema.safeParse>;
  try {
    headings = quotationHeadingsSchema.safeParse(
      formData.has("headingsJson") ? safeJson(formData.get("headingsJson")) : {},
    );
  } catch {
    return { error: "Review the quotation template headings." };
  }
  if (!headings.success)
    return { error: headings.error.issues[0]?.message ?? "Review the template headings." };
  const intent = formData.get("intent") === "preview" ? "preview" : "save";
  let preview: QuoteCalculation | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    if (intent === "save") {
      const { error: categorySchemaError } = await supabase
        .from("quotation_versions")
        .select("item_categories")
        .limit(0);
      if (categorySchemaError)
        return { error: quotationCategoryStorageError(categorySchemaError) };
    }
    const { data, error } = await supabase.rpc(
      intent === "preview" ? "preview_quotation_draft" : "save_quotation_draft",
      {
        p_quotation_id: quoteId,
        p_expected_edit_sequence: sequence,
        p_snapshot: {
          ...toRpcSnapshot(snapshot.data),
          item_categories: categories.data,
          ...(formData.has("headingsJson") ? { template_headings: headings.data } : {}),
        },
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
      if (error.code === "22023") return { error: safeDraftValidationError(error.message) };
      return { error: "Could not calculate this draft. Please try again." };
    }
    preview = data as QuoteCalculation;
  } catch (error) {
    return {
      error: reportSafeFailure(
        "quotation.draft.save",
        error,
        "Quotation service is temporarily unavailable. Please try again.",
      ),
    };
  }
  if (intent === "preview") return { preview: preview ?? undefined, previewed: true };
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quoteId}`);
  redirect(`/quotations/${quoteId}?saved=1`);
}

function safeDraftValidationError(message: string): string {
  const detail = message.toLowerCase();
  if (detail.includes("time zone")) return "Select a valid document time zone.";
  if (
    detail.includes("currently configured gst rate") ||
    detail.includes("select a configured gst rate")
  ) {
    return "That GST rate is not currently available. Refresh the quotation and choose a rate from the list.";
  }
  if (detail.includes("gst rate applies only to taxable lines")) {
    return "GST rates can only be used on taxable lines. Change the GST category or clear the rate.";
  }
  if (
    detail.includes("seller and buyer states are required") ||
    detail.includes("invalid quotation state or gst route")
  ) {
    return "Check the seller and buyer states and the GST treatment before saving.";
  }
  if (detail.includes("invalid validity date")) {
    return "Enter a valid Valid through date, or clear the field.";
  }
  if (detail.includes("invalid place of supply state")) {
    return "Select a valid place-of-supply state.";
  }
  if (detail.includes("invalid gstin format")) {
    return "Check the seller and buyer GSTIN format.";
  }
  if (detail.includes("invalid document email")) {
    return "Check the seller and buyer email addresses.";
  }
  if (detail.includes("quantity or price is out of range")) {
    return "A line quantity or price is outside the supported range. Review the line values.";
  }
  if (detail.includes("quotation amount is out of range")) {
    return "The quotation total is outside the supported range. Review the line prices and quantities.";
  }
  if (detail.includes("invalid quotation line")) {
    return "Review each line’s description, quantity, price, and GST category.";
  }
  if (detail.includes("invalid document declaration")) {
    return "Review the GST registration and place-of-supply declarations.";
  }
  return "Some quotation details are invalid. Review the document details and line items, then try again.";
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
    if (error) return { error: safeShareError(error.code, error.message) };
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
  } catch (error) {
    return {
      error: reportSafeFailure(
        "quotation.share",
        error,
        "Quotation sharing is temporarily unavailable. Please try again.",
      ),
    };
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
  } catch (error) {
    return {
      error: reportSafeFailure(
        "quotation.link.rotate",
        error,
        "Link rotation is temporarily unavailable. Please try again.",
      ),
    };
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
  } catch (error) {
    return {
      error: reportSafeFailure(
        "quotation.link.revoke",
        error,
        "Link revocation is temporarily unavailable. Please try again.",
      ),
    };
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
  } catch (error) {
    return {
      error: reportSafeFailure(
        "quotation.revision.create",
        error,
        "Quotation revision is temporarily unavailable. Please try again.",
      ),
    };
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

function safeShareError(code: string | undefined, message: string | undefined): string {
  const detail = message?.toLowerCase() ?? "";
  if (code === "42501" || code === "P0002") return "This quotation is unavailable.";
  if (code === "22023") {
    if (detail.includes("complete and review the quotation details"))
      return "Complete the items in the sharing checklist, save the draft, then try again.";
    if (detail.includes("correct the email address"))
      return "Correct the seller or customer email in the draft, save it, then try again.";
    if (detail.includes("add at least one quotation line"))
      return "Add a quotation line and save the draft before sharing.";
    if (detail.includes("currently configured catalog gst rate"))
      return "Choose an available GST rate for each taxable line, save the draft, then try again.";
    if (detail.includes("document image is unavailable"))
      return "A quotation logo or signature is unavailable. Update the document settings, then try again.";
    if (detail.includes("response deadline has passed"))
      return "The Valid through date has passed. Choose a future date, save the draft, then try again.";
    return "Some saved quotation details need attention. Review the checklist and save the draft.";
  }
  if (code === "23514") {
    if (detail.includes("invoiced quotation cannot be shared"))
      return "This quotation already has an invoice and cannot be shared again.";
    if (detail.includes("only the current draft can be shared"))
      return "This draft changed or is no longer current. Reload the quotation before sharing.";
    return "This quotation changed while you were working. Reload and review the current draft.";
  }
  if (code === "40001")
    return "This quotation changed while you were working. Reload and review the current draft.";
  return "The quotation could not be shared. Please try again.";
}
