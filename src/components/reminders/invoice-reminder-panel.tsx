"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Edit,
  History,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Play,
  RotateCw,
  Send,
  XCircle,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelReminderScheduleAction,
  pauseReminderScheduleAction,
  processDueRemindersNowAction,
  resumeReminderScheduleAction,
  sendInstantReminderEmailAction,
} from "@/server/modules/reminders/actions";
import type { InvoiceReminderSummary } from "@/server/modules/reminders/queries";
import type { ReminderChannel, ReminderDelivery } from "@/server/modules/reminders/types";
import { ReminderDialog } from "./reminder-dialog";

type InvoiceReminderPanelProps = {
  invoiceId: string;
  invoiceReference: string;
  buyerDisplayName: string;
  buyerContactName?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  sellerDisplayName: string;
  invoiceDate: string;
  dueOn?: string | null;
  totalMinor: string;
  paidMinor: string;
  outstandingMinor: string;
  summary: InvoiceReminderSummary;
};

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  } catch {
    return value;
  }
}

function ChannelIcon({ channel }: { channel: ReminderChannel }) {
  switch (channel) {
    case "whatsapp":
      return <MessageSquare className="size-3.5 text-[#25D366]" />;
    case "email":
      return <Mail className="size-3.5 text-[#315b8a]" />;
    case "sms":
      return <Phone className="size-3.5 text-[#8d5400]" />;
  }
}

function DeliveryStatusBadge({ status }: { status: ReminderDelivery["delivery_status"] }) {
  switch (status) {
    case "delivered":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#e2f3eb] text-[#176b4c]">
          <CheckCircle2 className="size-3" />
          Delivered
        </span>
      );
    case "sent":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#e5f0fb] text-[#315b8a]">
          <Send className="size-3" />
          Sent to provider
        </span>
      );
    case "failed":
    case "bounced":
    case "undelivered":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fde8e8] text-[#a32e32]">
          <XCircle className="size-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fff1dd] text-[#8d5400]">
          <Clock className="size-3" />
          Pending
        </span>
      );
  }
}

export function InvoiceReminderPanel({
  invoiceId,
  invoiceReference,
  buyerDisplayName,
  buyerContactName,
  buyerEmail,
  buyerPhone,
  sellerDisplayName,
  invoiceDate,
  dueOn,
  totalMinor,
  paidMinor,
  outstandingMinor,
  summary,
}: InvoiceReminderPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(
    null,
  );
  const [isEditOpen, setIsEditOpen] = useState(false);

  const isPaid = BigInt(outstandingMinor) <= BigInt(0);
  const schedule = summary.schedule;

  const handlePause = () => {
    if (!schedule) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await pauseReminderScheduleAction(invoiceId, schedule.id);
      if (res.error) setFeedback({ message: res.error, isError: true });
      else setFeedback({ message: "Reminder schedule paused.", isError: false });
    });
  };

  const handleResume = () => {
    if (!schedule) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await resumeReminderScheduleAction(invoiceId, schedule.id);
      if (res.error) setFeedback({ message: res.error, isError: true });
      else setFeedback({ message: "Reminder schedule resumed.", isError: false });
    });
  };

  const handleCancel = () => {
    if (!schedule) return;
    if (!confirm("Are you sure you want to cancel this reminder schedule?")) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await cancelReminderScheduleAction(invoiceId, schedule.id);
      if (res.error) setFeedback({ message: res.error, isError: true });
      else setFeedback({ message: "Reminder schedule cancelled.", isError: false });
    });
  };

  const handleProcessDueNow = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await processDueRemindersNowAction();
      setFeedback({ message: res.message, isError: !res.success });
    });
  };

  const handleSendInstantEmail = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await sendInstantReminderEmailAction(invoiceId);
      setFeedback({ message: res.message, isError: !res.success });
    });
  };

  // Check provider status warnings only for active channels
  const unconfiguredProviders = summary.providerStatuses.filter(
    (p) => !p.configured && (schedule?.channels || ["email"]).includes(p.channel),
  );

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_1px_2px_rgb(15_45_36/4%)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--brand)]">
            <Bell className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="font-bold text-[var(--ink)] text-base">
                Automated Payment Reminders
              </h3>
              {schedule ? (
                schedule.status === "active" ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e2f3eb] text-[#176b4c]">
                    <span className="size-1.5 rounded-full bg-current" />
                    Active
                  </span>
                ) : schedule.status === "paused" ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fff1dd] text-[#8d5400]">
                    <Pause className="size-3" />
                    Paused
                  </span>
                ) : schedule.status === "completed" ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e5f0fb] text-[#315b8a]">
                    <CheckCircle2 className="size-3" />
                    Completed ({schedule.stop_reason || "Finished"})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                    Cancelled
                  </span>
                )
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  Not scheduled
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              WhatsApp, Email, and SMS reminders with real-time balance checking before
              send.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!isPaid && (
            <ReminderDialog
              invoiceId={invoiceId}
              invoiceReference={invoiceReference}
              buyerDisplayName={buyerDisplayName}
              buyerContactName={buyerContactName}
              buyerEmail={buyerEmail}
              buyerPhone={buyerPhone}
              sellerDisplayName={sellerDisplayName}
              invoiceDate={invoiceDate}
              dueOn={dueOn}
              totalMinor={totalMinor}
              paidMinor={paidMinor}
              outstandingMinor={outstandingMinor}
              existingSchedule={schedule}
              open={isEditOpen}
              onOpenChange={setIsEditOpen}
              trigger={
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  {schedule ? (
                    <>
                      <Edit className="size-3.5" />
                      Edit Schedule
                    </>
                  ) : (
                    <>
                      <Bell className="size-3.5 text-[var(--brand)]" />
                      Set Reminder
                    </>
                  )}
                </Button>
              }
            />
          )}

          {schedule && schedule.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePause}
              disabled={isPending}
              className="gap-1.5 text-xs"
            >
              <Pause className="size-3.5" />
              Pause
            </Button>
          )}

          {schedule && schedule.status === "paused" && !isPaid && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleResume}
              disabled={isPending}
              className="gap-1.5 text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
            >
              <Play className="size-3.5" />
              Resume
            </Button>
          )}

          {schedule && (schedule.status === "active" || schedule.status === "paused") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              disabled={isPending}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Cancel
            </Button>
          )}

          {schedule && !isPaid && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendInstantEmail}
              disabled={isPending}
              title="Send an email reminder immediately to verify delivery"
              className="text-xs text-[#176b4c] border-[#176b4c]/30 hover:bg-[#e2f3eb] gap-1.5"
            >
              <Send className="size-3.5" />
              Send Email Now
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleProcessDueNow}
            disabled={isPending}
            title="Check and process due reminders immediately"
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--ink)] gap-1"
          >
            <RotateCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
            Run Check
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-medium border ${
            feedback.isError
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-emerald-50 text-emerald-800 border-emerald-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Provider Setup Warning if variables are unconfigured */}
      {unconfiguredProviders.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 flex items-start gap-3">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">Provider Configuration Notice:</p>
            <p className="text-[11px] leading-relaxed">
              For live dispatching, configure the provider API keys in your environment
              (e.g. <code>RESEND_API_KEY</code>, <code>TWILIO_ACCOUNT_SID</code>,{" "}
              <code>TWILIO_AUTH_TOKEN</code>). Unconfigured channels will record the attempt
              as failed with clear diagnostic logs.
            </p>
          </div>
        </div>
      )}

      {/* Schedule Summary Information */}
      {schedule ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#f8faf9] p-3 rounded-xl border border-[var(--line)]">
            <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
              Channels
            </p>
            <div className="mt-1 flex items-center gap-2">
              {schedule.channels.map((ch) => (
                <span
                  key={ch}
                  className="inline-flex items-center gap-1 text-xs font-semibold capitalize bg-white px-2 py-0.5 rounded-md border border-[var(--line)]"
                >
                  <ChannelIcon channel={ch} />
                  {ch}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[#f8faf9] p-3 rounded-xl border border-[var(--line)]">
            <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
              Automatic Sending
            </p>
            <p className="mt-1 text-xs font-bold text-[var(--ink)]">
              {schedule.auto_send_enabled ? (
                <span className="text-[#176b4c]">Enabled (Runs in Background)</span>
              ) : (
                <span className="text-amber-800">Disabled (Manual only)</span>
              )}
            </p>
          </div>

          <div className="bg-[#f8faf9] p-3 rounded-xl border border-[var(--line)]">
            <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
              Next Scheduled Reminder
            </p>
            <p className="mt-1 text-xs font-bold text-[var(--ink)]">
              {summary.nextOccurrence ? (
                `${formatDate(summary.nextOccurrence.scheduled_date)} (${summary.nextOccurrence.channel})`
              ) : (
                <span className="text-[var(--muted-foreground)] font-normal">
                  None remaining
                </span>
              )}
            </p>
          </div>

          <div className="bg-[#f8faf9] p-3 rounded-xl border border-[var(--line)]">
            <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
              Schedule Window
            </p>
            <p className="mt-1 text-xs font-bold text-[var(--ink)]">
              {formatDate(schedule.start_date)}
              {schedule.end_date ? ` to ${formatDate(schedule.end_date)}` : " onward"}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--line)] bg-[#fafcfb] p-6 text-center space-y-2">
          <Clock className="size-8 mx-auto text-[var(--muted-foreground)] opacity-50" />
          <h4 className="text-sm font-semibold text-[var(--ink)]">
            No Reminder Schedule Active
          </h4>
          <p className="text-xs text-[var(--muted-foreground)] max-w-md mx-auto">
            {isPaid
              ? "This invoice is fully paid. No payment reminders are needed."
              : "Set up automated reminders via WhatsApp, Email, or SMS to ensure timely customer settlement."}
          </p>
        </div>
      )}

      {/* Delivery Records History */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
            <History className="size-4 text-[var(--brand)]" />
            Communication & Delivery History ({summary.deliveries.length})
          </h4>
        </div>

        {summary.deliveries.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] italic py-2">
            No reminder messages sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
            <table className="w-full min-w-[650px] border-collapse text-left text-xs">
              <thead className="bg-[#f8faf9] text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Date & Time</th>
                  <th className="px-3 py-2.5 font-semibold">Channel</th>
                  <th className="px-3 py-2.5 font-semibold">Recipient</th>
                  <th className="px-3 py-2.5 font-semibold">Provider</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Notes / Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] bg-white">
                {summary.deliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-[#fbfdfc]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--ink)]">
                      {formatDateTime(delivery.sent_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 capitalize font-medium">
                        <ChannelIcon channel={delivery.channel} />
                        {delivery.channel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--muted-foreground)] truncate max-w-[140px]">
                      {delivery.recipient}
                    </td>
                    <td className="px-3 py-2.5 uppercase text-[10px] text-[var(--muted-foreground)]">
                      {delivery.provider}
                    </td>
                    <td className="px-3 py-2.5">
                      <DeliveryStatusBadge status={delivery.delivery_status} />
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-[var(--muted-foreground)] max-w-[220px] truncate">
                      {delivery.error_message ? (
                        <span className="text-red-700" title={delivery.error_message}>
                          {delivery.error_message}
                        </span>
                      ) : delivery.provider_message_id ? (
                        <span title={delivery.provider_message_id}>
                          ID: {delivery.provider_message_id}
                        </span>
                      ) : (
                        "Sent"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
