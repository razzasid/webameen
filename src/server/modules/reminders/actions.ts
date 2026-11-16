"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import { reportSafeFailure } from "@/server/observability/report-safe-failure";
import { isUuid } from "@/server/shared/uuid";
import { getAuthoritativePaymentStatus } from "./payment-check";
import { createReminderWorkerClient } from "./client";
import { processDueReminders } from "./processor";
import { calculateReminderOccurrences } from "./schedule-calculator";
import type {
  ReminderChannel,
  ReminderScheduleType,
  ReminderTemplateType,
  RepeatFrequency,
} from "./types";
import { reminderFormSchema, validateCustomerContacts } from "./validation";

export type ReminderActionState = {
  success?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function saveReminderScheduleAction(
  invoiceId: string,
  _previousState: ReminderActionState,
  formData: FormData,
): Promise<ReminderActionState> {
  const user = await requireAuthenticatedUser();
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return { error: "Active business membership required." };
  }

  if (!isUuid(invoiceId)) {
    return { error: "Invalid invoice identifier." };
  }

  // Parse raw form values
  const rawChannels = formData.getAll("channels") as ReminderChannel[];
  const startDate = String(formData.get("startDate") ?? "");
  const rawEndDate = formData.get("endDate");
  const endDate = rawEndDate ? String(rawEndDate) : null;
  const repeatFrequency = (formData.get("repeatFrequency") ?? "none") as RepeatFrequency;
  const customIntervalDays = formData.get("customIntervalDays")
    ? Number(formData.get("customIntervalDays"))
    : undefined;
  const templateType = (formData.get("templateType") ?? "upcoming") as ReminderTemplateType;
  const customMessage = formData.get("customMessage")
    ? String(formData.get("customMessage"))
    : null;
  const customEmailSubject = formData.get("customEmailSubject")
    ? String(formData.get("customEmailSubject"))
    : null;
  const autoSendEnabled =
    formData.get("autoSendEnabled") === "true" || formData.get("autoSendEnabled") === "on";

  // Parse relative events JSON or form lists
  let relativeEvents: Array<{ offsetDays: number; messageType: ReminderTemplateType }> = [];
  try {
    const rawEvents = formData.get("relativeEvents");
    if (rawEvents) {
      relativeEvents = JSON.parse(String(rawEvents));
    }
  } catch {
    relativeEvents = [];
  }

  // Parse custom dates JSON
  let customDates: Array<{ date: string; messageType: ReminderTemplateType }> = [];
  try {
    const rawCustom = formData.get("customDates");
    if (rawCustom) {
      customDates = JSON.parse(String(rawCustom));
    }
  } catch {
    customDates = [];
  }

  const parsed = reminderFormSchema.safeParse({
    invoiceId,
    channels: rawChannels,
    startDate,
    endDate,
    relativeEvents,
    customDates,
    repeatFrequency,
    customIntervalDays,
    templateType,
    customMessage,
    customEmailSubject,
    autoSendEnabled,
    timezone: (formData.get("timezone") as string) || "Asia/Kolkata",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : "general";
      fieldErrors[field] = issue.message;
    }
    return {
      error: parsed.error.issues[0]?.message || "Invalid reminder configuration.",
      fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();

  // Verify invoice ownership and retrieve payment status
  const paymentStatus = await getAuthoritativePaymentStatus(invoiceId, supabase);
  if (!paymentStatus || paymentStatus.business_id !== context.business.id) {
    return { error: "This invoice is unavailable or does not belong to your business." };
  }

  // Mandatory check: if already fully paid, reject reminder schedule creation
  if (BigInt(paymentStatus.outstanding_minor) <= BigInt(0)) {
    return {
      error:
        "This invoice is already fully paid. Automated reminders cannot be set for paid invoices.",
    };
  }

  // Validate customer contact information for the selected channels
  const contactValidation = validateCustomerContacts({
    email: paymentStatus.buyer_email,
    phone: paymentStatus.buyer_phone,
    channels: parsed.data.channels,
  });

  const missingChannels = Object.values(contactValidation.channelErrors);
  if (missingChannels.length > 0) {
    return {
      error: `Missing required contact information: ${missingChannels.join(" ")}`,
      fieldErrors: contactValidation.channelErrors,
    };
  }

  // Determine schedule type
  let scheduleType: ReminderScheduleType = "due_date_relative";
  if (parsed.data.relativeEvents.length > 0 && parsed.data.customDates.length > 0) {
    scheduleType = "hybrid";
  } else if (parsed.data.customDates.length > 0) {
    scheduleType = "custom_dates";
  } else if (parsed.data.repeatFrequency !== "none") {
    scheduleType = "recurring";
  }

  const timingConfig = {
    relativeEvents: parsed.data.relativeEvents,
    customDates: parsed.data.customDates,
    repeatFrequency: parsed.data.repeatFrequency,
    customIntervalDays: parsed.data.customIntervalDays,
  };

  try {
    // Check if an existing active/paused schedule exists for this invoice
    const { data: existingSchedule } = await supabase
      .from("invoice_reminder_schedules")
      .select("id, status")
      .eq("business_id", context.business.id)
      .eq("invoice_id", invoiceId)
      .in("status", ["active", "paused"])
      .maybeSingle();

    let scheduleId = existingSchedule?.id;

    if (existingSchedule) {
      // Update existing schedule
      const { error: updateError } = await supabase
        .from("invoice_reminder_schedules")
        .update({
          channels: parsed.data.channels,
          schedule_type: scheduleType,
          timing_config: timingConfig,
          start_date: parsed.data.startDate,
          end_date: parsed.data.endDate,
          template_type: parsed.data.templateType,
          custom_message: parsed.data.customMessage,
          custom_email_subject: parsed.data.customEmailSubject,
          auto_send_enabled: parsed.data.autoSendEnabled,
          timezone: parsed.data.timezone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSchedule.id)
        .eq("business_id", context.business.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Delete future pending occurrences that have not been processed
      await supabase
        .from("invoice_reminder_occurrences")
        .delete()
        .eq("schedule_id", existingSchedule.id)
        .eq("status", "pending");
    } else {
      // Create new schedule
      const { data: newSchedule, error: insertError } = await supabase
        .from("invoice_reminder_schedules")
        .insert({
          business_id: context.business.id,
          invoice_id: invoiceId,
          channels: parsed.data.channels,
          schedule_type: scheduleType,
          timing_config: timingConfig,
          start_date: parsed.data.startDate,
          end_date: parsed.data.endDate,
          template_type: parsed.data.templateType,
          custom_message: parsed.data.customMessage,
          custom_email_subject: parsed.data.customEmailSubject,
          auto_send_enabled: parsed.data.autoSendEnabled,
          status: "active",
          timezone: parsed.data.timezone,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertError || !newSchedule) {
        throw new Error(insertError?.message || "Failed to create reminder schedule.");
      }

      scheduleId = newSchedule.id;
    }

    // Calculate occurrences
    const calculatedOccurrences = calculateReminderOccurrences({
      channels: parsed.data.channels,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      dueOn: paymentStatus.due_on,
      timingConfig,
      timezone: parsed.data.timezone,
    });

    if (calculatedOccurrences.length > 0 && scheduleId) {
      const activeScheduleId = scheduleId;
      const occurrenceRows = calculatedOccurrences.map((occ) => ({
        schedule_id: activeScheduleId,
        business_id: context.business.id,
        invoice_id: invoiceId,
        channel: occ.channel,
        scheduled_for: occ.scheduledFor,
        scheduled_date: occ.scheduledDate,
        message_type: occ.messageType,
        status: "pending",
        attempt_count: 0,
        max_attempts: 3,
      }));

      const { error: occError } = await supabase
        .from("invoice_reminder_occurrences")
        .upsert(occurrenceRows, {
          onConflict: "schedule_id,channel,scheduled_date,message_type",
          ignoreDuplicates: true,
        });

      if (occError) {
        throw new Error(`Failed to generate reminder occurrences: ${occError.message}`);
      }
    }
  } catch (error) {
    return {
      error: reportSafeFailure(
        "invoice.reminder.save",
        error,
        "We could not save the reminder schedule. Please check the details and try again.",
      ),
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return {
    success: true,
    message: "Reminder schedule saved successfully.",
  };
}

export async function pauseReminderScheduleAction(
  invoiceId: string,
  scheduleId: string,
): Promise<ReminderActionState> {
  await requireAuthenticatedUser();
  const context = await getBusinessContext();
  if (context.status !== "ready") return { error: "Authentication required." };
  if (!isUuid(invoiceId) || !isUuid(scheduleId)) return { error: "Invalid ID." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("invoice_reminder_schedules")
      .update({
        status: "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId)
      .eq("business_id", context.business.id)
      .eq("invoice_id", invoiceId);

    if (error) throw new Error(error.message);
  } catch (error) {
    return {
      error: reportSafeFailure(
        "invoice.reminder.pause",
        error,
        "Could not pause reminder schedule.",
      ),
    };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true, message: "Reminder schedule paused." };
}

export async function resumeReminderScheduleAction(
  invoiceId: string,
  scheduleId: string,
): Promise<ReminderActionState> {
  await requireAuthenticatedUser();
  const context = await getBusinessContext();
  if (context.status !== "ready") return { error: "Authentication required." };
  if (!isUuid(invoiceId) || !isUuid(scheduleId)) return { error: "Invalid ID." };

  try {
    const supabase = await createSupabaseServerClient();

    // Check payment status first: if fully paid, cannot resume
    const paymentStatus = await getAuthoritativePaymentStatus(invoiceId, supabase);
    if (paymentStatus && BigInt(paymentStatus.outstanding_minor) <= BigInt(0)) {
      await supabase
        .from("invoice_reminder_schedules")
        .update({
          status: "completed",
          stop_reason: "fully_paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", scheduleId)
        .eq("business_id", context.business.id);

      revalidatePath(`/invoices/${invoiceId}`);
      return {
        error: "This invoice is already fully paid. Schedule has been marked as completed.",
      };
    }

    const nowIso = new Date().toISOString();

    // Mark past occurrences that were missed during pause as skipped
    await supabase
      .from("invoice_reminder_occurrences")
      .update({
        status: "skipped",
        skip_reason: "paused_during_scheduled_time",
        updated_at: nowIso,
      })
      .eq("schedule_id", scheduleId)
      .eq("status", "pending")
      .lt("scheduled_for", nowIso);

    const { error } = await supabase
      .from("invoice_reminder_schedules")
      .update({
        status: "active",
        updated_at: nowIso,
      })
      .eq("id", scheduleId)
      .eq("business_id", context.business.id)
      .eq("invoice_id", invoiceId);

    if (error) throw new Error(error.message);
  } catch (error) {
    return {
      error: reportSafeFailure(
        "invoice.reminder.resume",
        error,
        "Could not resume reminder schedule.",
      ),
    };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true, message: "Reminder schedule resumed." };
}

export async function cancelReminderScheduleAction(
  invoiceId: string,
  scheduleId: string,
): Promise<ReminderActionState> {
  await requireAuthenticatedUser();
  const context = await getBusinessContext();
  if (context.status !== "ready") return { error: "Authentication required." };
  if (!isUuid(invoiceId) || !isUuid(scheduleId)) return { error: "Invalid ID." };

  try {
    const supabase = await createSupabaseServerClient();
    const nowIso = new Date().toISOString();

    // Cancel schedule permanently
    const { error } = await supabase
      .from("invoice_reminder_schedules")
      .update({
        status: "cancelled",
        stop_reason: "cancelled_by_user",
        updated_at: nowIso,
      })
      .eq("id", scheduleId)
      .eq("business_id", context.business.id)
      .eq("invoice_id", invoiceId);

    if (error) throw new Error(error.message);

    // Cancel pending occurrences
    await supabase
      .from("invoice_reminder_occurrences")
      .update({
        status: "cancelled",
        updated_at: nowIso,
      })
      .eq("schedule_id", scheduleId)
      .in("status", ["pending", "failed"]);
  } catch (error) {
    return {
      error: reportSafeFailure(
        "invoice.reminder.cancel",
        error,
        "Could not cancel reminder schedule.",
      ),
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true, message: "Reminder schedule cancelled." };
}

export async function processDueRemindersNowAction(): Promise<{
  success: boolean;
  message: string;
}> {
  await requireAuthenticatedUser();
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return { success: false, message: "Authentication required." };
  }

  try {
    const result = await processDueReminders({ batchSize: 20 });
    revalidatePath("/invoices");
    return {
      success: true,
      message: `Processed ${result.claimedCount} reminder occurrences (${result.sentCount} sent, ${result.failedCount} failed, ${result.skippedCount} skipped).`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error processing reminders";
    return { success: false, message: msg };
  }
}

export async function sendInstantReminderEmailAction(invoiceId: string): Promise<{
  success: boolean;
  message: string;
}> {
  await requireAuthenticatedUser();
  const context = await getBusinessContext();
  if (context.status !== "ready") {
    return { success: false, message: "Authentication required." };
  }

  if (!isUuid(invoiceId)) {
    return { success: false, message: "Invalid invoice identifier." };
  }

  const supabase = createReminderWorkerClient();

  // Find existing schedule
  const { data: schedule } = await supabase
    .from("invoice_reminder_schedules")
    .select("id, status")
    .eq("business_id", context.business.id)
    .eq("invoice_id", invoiceId)
    .in("status", ["active", "paused"])
    .maybeSingle();

  if (!schedule) {
    return {
      success: false,
      message: "Please configure and save a reminder schedule first.",
    };
  }

  // Ensure schedule is active and auto_send_enabled is true
  await supabase
    .from("invoice_reminder_schedules")
    .update({ status: "active", auto_send_enabled: true })
    .eq("id", schedule.id);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dueRightNow = new Date(Date.now() - 60000).toISOString();

  // Reset or create an email occurrence due right now
  const { data: existingOcc } = await supabase
    .from("invoice_reminder_occurrences")
    .select("id")
    .eq("schedule_id", schedule.id)
    .eq("channel", "email")
    .eq("scheduled_date", todayStr)
    .maybeSingle();

  if (existingOcc) {
    await supabase
      .from("invoice_reminder_occurrences")
      .update({
        status: "pending",
        scheduled_for: dueRightNow,
        attempt_count: 0,
        next_retry_at: null,
        failure_reason: null,
      })
      .eq("id", existingOcc.id);
  } else {
    await supabase.from("invoice_reminder_occurrences").insert({
      schedule_id: schedule.id,
      business_id: context.business.id,
      invoice_id: invoiceId,
      channel: "email",
      scheduled_for: dueRightNow,
      scheduled_date: todayStr,
      message_type: "upcoming",
      status: "pending",
      attempt_count: 0,
      max_attempts: 3,
    });
  }

  // Immediately process due reminders
  const result = await processDueReminders({ batchSize: 10, client: supabase });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");

  if (result.sentCount > 0) {
    return {
      success: true,
      message: "Reminder email sent successfully! Check your inbox.",
    };
  }

  if (result.failedCount > 0) {
    return {
      success: false,
      message: result.errors[0] || "Delivery failed. Check provider configuration.",
    };
  }

  return {
    success: true,
    message: `Processed. Claimed: ${result.claimedCount}, Sent: ${result.sentCount}.`,
  };
}
