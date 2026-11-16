import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createReminderWorkerClient } from "./client";
import {
  getAuthoritativePaymentStatus,
  stopScheduleDueToFullPayment,
} from "./payment-check";
import { getChannelProvider } from "./providers";
import { buildTemplateVariables, renderReminderMessage } from "./templates";
import type { ReminderChannel, ReminderTemplateType } from "./types";
import { validateCustomerContacts } from "./validation";

export type ClaimedReminderOccurrence = {
  occurrence_id: string;
  schedule_id: string;
  business_id: string;
  invoice_id: string;
  channel: ReminderChannel;
  scheduled_for: string;
  scheduled_date: string;
  message_type: ReminderTemplateType;
  attempt_count: number;
  max_attempts: number;
  timezone: string;
  auto_send_enabled: boolean;
  template_type: ReminderTemplateType;
  custom_message: string | null;
  custom_email_subject: string | null;
  schedule_status: string;
};

export type ProcessResult = {
  claimedCount: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  errors: string[];
};

export function computeNextRetry(attemptCount: number): string {
  // Exponential backoff: 5m, 15m, 45m
  const delayMinutes = Math.min(5 * 3 ** (attemptCount - 1), 60);
  const nextDate = new Date();
  nextDate.setMinutes(nextDate.getMinutes() + delayMinutes);
  return nextDate.toISOString();
}

export async function processDueReminders(options?: {
  batchSize?: number;
  client?: SupabaseClient;
}): Promise<ProcessResult> {
  const supabase = options?.client || createReminderWorkerClient();
  const batchSize = options?.batchSize || 10;

  const result: ProcessResult = {
    claimedCount: 0,
    processedCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  // 1. Atomically claim due occurrences using FOR UPDATE SKIP LOCKED stored procedure
  const { data: rawClaimed, error: claimError } = await supabase.rpc(
    "claim_due_reminder_occurrences",
    { p_batch_size: batchSize },
  );

  if (claimError) {
    result.errors.push(`Claim error: ${claimError.message}`);
    return result;
  }

  const claimed: ClaimedReminderOccurrence[] = Array.isArray(rawClaimed)
    ? (rawClaimed as ClaimedReminderOccurrence[])
    : [];

  result.claimedCount = claimed.length;
  if (claimed.length === 0) return result;

  // Process each claimed occurrence
  for (const item of claimed) {
    try {
      result.processedCount++;
      const nowIso = new Date().toISOString();

      // 2. Schedule and Auto-Send check
      if (item.schedule_status !== "active" || !item.auto_send_enabled) {
        await supabase
          .from("invoice_reminder_occurrences")
          .update({
            status: "skipped",
            skip_reason:
              item.schedule_status !== "active"
                ? `Schedule is ${item.schedule_status}`
                : "Automatic sending is disabled",
            processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", item.occurrence_id);

        result.skippedCount++;
        continue;
      }

      // 3. MANDATORY Smart Payment Status Check
      const paymentStatus = await getAuthoritativePaymentStatus(item.invoice_id, supabase);

      if (!paymentStatus) {
        await supabase
          .from("invoice_reminder_occurrences")
          .update({
            status: "failed",
            failure_reason: "Invoice no longer exists or unavailable",
            processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", item.occurrence_id);

        result.failedCount++;
        continue;
      }

      // Rule: If fully paid, STOP schedule and cancel pending occurrences!
      if (BigInt(paymentStatus.outstanding_minor) <= BigInt(0)) {
        await stopScheduleDueToFullPayment(
          item.schedule_id,
          item.invoice_id,
          item.business_id,
          supabase,
        );

        result.skippedCount++;
        continue;
      }

      // 4. Validate customer recipient contact for the specific channel
      const contactValidation = validateCustomerContacts({
        email: paymentStatus.buyer_email,
        phone: paymentStatus.buyer_phone,
        channels: [item.channel],
      });

      let recipient = "";
      if (item.channel === "email") {
        if (!contactValidation.hasValidEmail) {
          await markOccurrenceFailed(
            supabase,
            item,
            "Customer is missing a valid email address",
          );
          result.failedCount++;
          continue;
        }
        recipient = contactValidation.normalizedEmail ?? "";
      } else if (item.channel === "whatsapp") {
        if (!contactValidation.hasValidPhone) {
          await markOccurrenceFailed(
            supabase,
            item,
            "Customer is missing a valid phone number for WhatsApp",
          );
          result.failedCount++;
          continue;
        }
        recipient = contactValidation.normalizedPhone ?? "";
      } else if (item.channel === "sms") {
        if (!contactValidation.hasValidPhone) {
          await markOccurrenceFailed(
            supabase,
            item,
            "Customer is missing a valid phone number for SMS",
          );
          result.failedCount++;
          continue;
        }
        recipient = contactValidation.normalizedPhone ?? "";
      }

      // 5. Look up active public link if present
      const { data: activeLink } = await supabase
        .from("invoice_public_links")
        .select("id")
        .eq("business_id", item.business_id)
        .eq("invoice_id", item.invoice_id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const appUrl = process.env.APP_URL || "https://app.webameen.com";
      const invoiceLink = activeLink ? `${appUrl}/i/${activeLink.id}` : null;

      // 6. Build template variables with LATEST authoritative amounts
      const variables = buildTemplateVariables({
        sellerDisplayName: paymentStatus.seller_display_name,
        buyerDisplayName: paymentStatus.buyer_display_name,
        buyerContactName: paymentStatus.buyer_contact_name,
        invoiceReference: paymentStatus.reference,
        invoiceDate: paymentStatus.local_today,
        dueOn: paymentStatus.due_on,
        totalMinor: paymentStatus.total_minor,
        paidMinor: paymentStatus.paid_minor,
        outstandingMinor: paymentStatus.outstanding_minor,
        currencyCode: paymentStatus.currency_code,
        invoiceLink,
      });

      // 7. Render message for channel
      const rendered = renderReminderMessage({
        channel: item.channel,
        templateType: item.message_type,
        customMessage: item.custom_message,
        customSubject: item.custom_email_subject,
        variables,
      });

      // 8. Send through channel provider
      const provider = getChannelProvider(item.channel);
      const sendResult = await provider.send({
        recipient,
        subject: rendered.subject,
        body: rendered.body,
        htmlBody: rendered.htmlBody,
      });

      // 9. Record provider response in delivery records
      await supabase.from("invoice_reminder_deliveries").insert({
        occurrence_id: item.occurrence_id,
        schedule_id: item.schedule_id,
        business_id: item.business_id,
        invoice_id: item.invoice_id,
        channel: item.channel,
        recipient,
        rendered_subject: rendered.subject,
        rendered_body: rendered.body,
        provider: sendResult.provider,
        provider_message_id: sendResult.providerMessageId || null,
        delivery_status: sendResult.deliveryStatus,
        attempt_number: item.attempt_count,
        sent_at: nowIso,
        delivered_at: sendResult.deliveredAt || null,
        failed_at: sendResult.success ? null : nowIso,
        error_code: sendResult.errorCode || null,
        error_message: sendResult.errorMessage || null,
      });

      // 10. Update occurrence status
      if (sendResult.success) {
        await supabase
          .from("invoice_reminder_occurrences")
          .update({
            status: sendResult.deliveryStatus,
            processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", item.occurrence_id);

        result.sentCount++;
      } else {
        const canRetry = item.attempt_count < item.max_attempts;
        await supabase
          .from("invoice_reminder_occurrences")
          .update({
            status: "failed",
            failure_reason: sendResult.errorMessage,
            next_retry_at: canRetry ? computeNextRetry(item.attempt_count) : null,
            processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", item.occurrence_id);

        result.failedCount++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Error on occurrence ${item.occurrence_id}: ${errMsg}`);
      result.failedCount++;

      await markOccurrenceFailed(supabase, item, errMsg);
    }
  }

  return result;
}

async function markOccurrenceFailed(
  supabase: SupabaseClient,
  item: ClaimedReminderOccurrence,
  reason: string,
) {
  const nowIso = new Date().toISOString();
  const canRetry = item.attempt_count < item.max_attempts;

  await supabase
    .from("invoice_reminder_occurrences")
    .update({
      status: "failed",
      failure_reason: reason,
      next_retry_at: canRetry ? computeNextRetry(item.attempt_count) : null,
      processed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", item.occurrence_id);

  await supabase.from("invoice_reminder_deliveries").insert({
    occurrence_id: item.occurrence_id,
    schedule_id: item.schedule_id,
    business_id: item.business_id,
    invoice_id: item.invoice_id,
    channel: item.channel,
    recipient: "unknown",
    rendered_subject: null,
    rendered_body: "Failed before message rendering",
    provider: "none",
    provider_message_id: null,
    delivery_status: "failed",
    attempt_number: item.attempt_count,
    sent_at: nowIso,
    failed_at: nowIso,
    error_code: "PROCESSING_FAILED",
    error_message: reason,
  });
}
