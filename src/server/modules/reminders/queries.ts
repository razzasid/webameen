import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { isUuid } from "@/server/shared/uuid";
import { getAllProviderStatuses } from "./providers";
import type { ChannelProviderStatus } from "./providers/types";
import type { ReminderDelivery, ReminderOccurrence, ReminderSchedule } from "./types";

export type InvoiceReminderSummary = {
  schedule: ReminderSchedule | null;
  hasActiveSchedule: boolean;
  status: ReminderSchedule["status"] | null;
  autoSendEnabled: boolean;
  channels: ReminderSchedule["channels"];
  nextOccurrence: ReminderOccurrence | null;
  lastDelivery: ReminderDelivery | null;
  totalOccurrences: number;
  pendingOccurrences: number;
  sentDeliveriesCount: number;
  failedDeliveriesCount: number;
  occurrences: ReminderOccurrence[];
  deliveries: ReminderDelivery[];
  providerStatuses: ChannelProviderStatus[];
};

export async function getInvoiceReminderSummary(
  invoiceId: string,
): Promise<InvoiceReminderSummary> {
  const providerStatuses = getAllProviderStatuses();

  const emptySummary: InvoiceReminderSummary = {
    schedule: null,
    hasActiveSchedule: false,
    status: null,
    autoSendEnabled: false,
    channels: [],
    nextOccurrence: null,
    lastDelivery: null,
    totalOccurrences: 0,
    pendingOccurrences: 0,
    sentDeliveriesCount: 0,
    failedDeliveriesCount: 0,
    occurrences: [],
    deliveries: [],
    providerStatuses,
  };

  if (!isUuid(invoiceId)) return emptySummary;
  const context = await getBusinessContext();
  if (context.status !== "ready") return emptySummary;

  const supabase = await createSupabaseServerClient();

  // Find latest schedule for this invoice
  const { data: scheduleData } = await supabase
    .from("invoice_reminder_schedules")
    .select("*")
    .eq("business_id", context.business.id)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!scheduleData) return emptySummary;
  const schedule = scheduleData as ReminderSchedule;

  // Retrieve occurrences for this schedule
  const { data: occurrencesData } = await supabase
    .from("invoice_reminder_occurrences")
    .select("*")
    .eq("business_id", context.business.id)
    .eq("schedule_id", schedule.id)
    .order("scheduled_for", { ascending: true });

  const occurrences = (occurrencesData || []) as ReminderOccurrence[];

  // Retrieve delivery records for this invoice
  const { data: deliveriesData } = await supabase
    .from("invoice_reminder_deliveries")
    .select("*")
    .eq("business_id", context.business.id)
    .eq("invoice_id", invoiceId)
    .order("sent_at", { ascending: false });

  const deliveries = (deliveriesData || []) as ReminderDelivery[];

  const nextOccurrence =
    occurrences.find((o) => o.status === "pending" || o.status === "failed") || null;

  const lastDelivery = deliveries[0] || null;

  const pendingOccurrences = occurrences.filter(
    (o) => o.status === "pending" || o.status === "processing",
  ).length;

  const sentDeliveriesCount = deliveries.filter(
    (d) => d.delivery_status === "sent" || d.delivery_status === "delivered",
  ).length;

  const failedDeliveriesCount = deliveries.filter(
    (d) => d.delivery_status === "failed",
  ).length;

  return {
    schedule,
    hasActiveSchedule: schedule.status === "active",
    status: schedule.status,
    autoSendEnabled: schedule.auto_send_enabled,
    channels: schedule.channels,
    nextOccurrence,
    lastDelivery,
    totalOccurrences: occurrences.length,
    pendingOccurrences,
    sentDeliveriesCount,
    failedDeliveriesCount,
    occurrences,
    deliveries,
    providerStatuses,
  };
}
