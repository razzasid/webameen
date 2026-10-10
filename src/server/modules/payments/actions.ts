"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import { isUuid } from "@/server/shared/uuid";
import {
  type PaymentActionState,
  paymentFieldErrors,
  paymentFormSchema,
  readPaymentForm,
  reversalReasonSchema,
} from "./validation";

function paymentFailure(code?: string): string {
  if (code === "P0002" || code === "42501") {
    return "This invoice or payment is unavailable in your business.";
  }
  if (code === "23505") {
    return "This payment was already recorded or corrected. Refresh the invoice and review its history.";
  }
  if (code === "23514") {
    return "The payment no longer fits the invoice balance or its recorded dates. Review the invoice and try again.";
  }
  return "We couldn't save this payment. Check the details and try again.";
}

export async function recordInvoicePaymentAction(
  invoiceId: string,
  _previousState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  await requireAuthenticatedUser();
  const values = readPaymentForm(formData);
  if (!isUuid(invoiceId)) return { error: "This invoice is unavailable.", values };
  const parsed = paymentFormSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: paymentFieldErrors(parsed.error) };
  }

  let receiptId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("record_invoice_payment", {
      p_invoice_id: invoiceId,
      p_request_key: parsed.data.requestKey,
      p_amount_minor: parsed.data.amountMinor,
      p_received_local: parsed.data.receivedAt,
      p_method: parsed.data.method,
      p_external_reference: parsed.data.externalReference,
      p_replaces_payment_id: parsed.data.replacesPaymentId,
    });
    if (error || !data || typeof data !== "object") {
      return { error: paymentFailure(error?.code), values };
    }
    const result = data as { receipt_id?: unknown };
    if (typeof result.receipt_id !== "string" || !isUuid(result.receipt_id)) {
      return {
        error: "The receipt is unavailable. Refresh the invoice and review its history.",
        values,
      };
    }
    receiptId = result.receipt_id;
  } catch {
    return { error: paymentFailure(), values };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/receipts/${receiptId}`);
  redirect(`/receipts/${receiptId}`);
}

export type ReversePaymentActionState = {
  reason?: string;
  error?: string;
  fieldError?: string;
};

export async function reverseInvoicePaymentAction(
  invoiceId: string,
  paymentId: string,
  _previousState: ReversePaymentActionState,
  formData: FormData,
): Promise<ReversePaymentActionState> {
  await requireAuthenticatedUser();
  const reason = String(formData.get("reason") ?? "");
  if (!isUuid(invoiceId) || !isUuid(paymentId)) {
    return { reason, error: "This invoice payment is unavailable." };
  }
  const parsedReason = reversalReasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return { reason, fieldError: parsedReason.error.issues[0]?.message };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("reverse_invoice_payment", {
      p_payment_id: paymentId,
      p_reason: parsedReason.data,
    });
    if (error) return { reason, error: paymentFailure(error.code) };
  } catch {
    return { reason, error: paymentFailure() };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}?paymentUpdated=1`);
}
