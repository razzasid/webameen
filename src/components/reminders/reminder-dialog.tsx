"use client";

import {
  AlertCircle,
  Bell,
  Calendar,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveReminderScheduleAction } from "@/server/modules/reminders/actions";
import {
  buildTemplateVariables,
  DEFAULT_TEMPLATES,
  renderReminderMessage,
} from "@/server/modules/reminders/templates";
import type {
  CustomReminderDate,
  RelativeReminderEvent,
  ReminderChannel,
  ReminderSchedule,
  ReminderTemplateType,
  RepeatFrequency,
} from "@/server/modules/reminders/types";
import { validateCustomerContacts } from "@/server/modules/reminders/validation";

type ReminderDialogProps = {
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
  existingSchedule?: ReminderSchedule | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ReminderDialog({
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
  existingSchedule,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ReminderDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen =
    isControlled && controlledOnOpenChange ? controlledOnOpenChange : setInternalOpen;

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states initialized from existingSchedule or intelligent defaults
  const [channels, setChannels] = useState<ReminderChannel[]>(
    existingSchedule?.channels?.filter((c) => c === "email")?.length
      ? ["email"]
      : ["email"],
  );

  const defaultStartDate =
    existingSchedule?.start_date || new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(existingSchedule?.end_date || "");

  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>(
    existingSchedule?.timing_config?.repeatFrequency || "none",
  );
  const [customIntervalDays, setCustomIntervalDays] = useState<number>(
    existingSchedule?.timing_config?.customIntervalDays || 3,
  );

  const defaultRelativeEvents: Array<RelativeReminderEvent & { id: string }> =
    existingSchedule?.timing_config?.relativeEvents?.length
      ? existingSchedule.timing_config.relativeEvents.map((e, idx) => ({
          ...e,
          id: `rel-${idx}-${e.offsetDays}`,
        }))
      : dueOn
        ? [
            { id: "rel-default-1", offsetDays: -3, messageType: "upcoming" },
            { id: "rel-default-2", offsetDays: 0, messageType: "due_today" },
            { id: "rel-default-3", offsetDays: 3, messageType: "overdue" },
          ]
        : [];

  const [relativeEvents, setRelativeEvents] =
    useState<Array<RelativeReminderEvent & { id: string }>>(defaultRelativeEvents);

  const [customDates, setCustomDates] = useState<
    Array<CustomReminderDate & { id: string }>
  >(
    (existingSchedule?.timing_config?.customDates || []).map((c, idx) => ({
      ...c,
      id: `custom-${idx}-${c.date}`,
    })),
  );

  const [templateType, setTemplateType] = useState<ReminderTemplateType>(
    existingSchedule?.template_type || "upcoming",
  );

  const [customMessage, setCustomMessage] = useState(
    existingSchedule?.custom_message || "",
  );
  const [customEmailSubject, setCustomEmailSubject] = useState(
    existingSchedule?.custom_email_subject || "",
  );

  const [autoSendEnabled, setAutoSendEnabled] = useState(
    existingSchedule ? existingSchedule.auto_send_enabled : true,
  );

  const [activeTab, setActiveTab] = useState<"schedule" | "template" | "preview">(
    "schedule",
  );

  // Live Contact Validation
  const contactValidation = validateCustomerContacts({
    email: buyerEmail,
    phone: buyerPhone,
    channels,
  });

  // Calculate live preview variables
  const variables = buildTemplateVariables({
    sellerDisplayName,
    buyerDisplayName,
    buyerContactName,
    invoiceReference,
    invoiceDate,
    dueOn,
    totalMinor,
    paidMinor,
    outstandingMinor,
  });

  const previewRender = renderReminderMessage({
    channel: channels[0] || "whatsapp",
    templateType,
    customMessage: customMessage || null,
    customSubject: customEmailSubject || null,
    variables,
  });

  const toggleChannel = (channel: ReminderChannel) => {
    if (channel !== "email") return; // WhatsApp and SMS are disabled for now
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  };

  const addRelativeEvent = () => {
    setRelativeEvents((prev) => [
      ...prev,
      {
        id: `rel-${Date.now()}-${prev.length}`,
        offsetDays: 7,
        messageType: "overdue",
      },
    ]);
  };

  const removeRelativeEvent = (index: number) => {
    setRelativeEvents((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRelativeEvent = (
    index: number,
    field: "offsetDays" | "messageType",
    val: unknown,
  ) => {
    setRelativeEvents((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const addCustomDate = () => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 3);
    setCustomDates((prev) => [
      ...prev,
      {
        id: `cust-${Date.now()}-${prev.length}`,
        date: nextDate.toISOString().slice(0, 10),
        messageType: "upcoming",
      },
    ]);
  };

  const removeCustomDate = (index: number) => {
    setCustomDates((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCustomDate = (index: number, field: "date" | "messageType", val: unknown) => {
    setCustomDates((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (channels.length === 0) {
      setErrorMessage("Please select at least one channel (WhatsApp, Email, or SMS).");
      return;
    }

    const formData = new FormData();
    for (const ch of channels) {
      formData.append("channels", ch);
    }
    formData.append("startDate", startDate);
    if (endDate) formData.append("endDate", endDate);
    formData.append("repeatFrequency", repeatFrequency);
    if (repeatFrequency === "custom") {
      formData.append("customIntervalDays", String(customIntervalDays));
    }
    formData.append("relativeEvents", JSON.stringify(relativeEvents));
    formData.append("customDates", JSON.stringify(customDates));
    formData.append("templateType", templateType);
    if (customMessage) formData.append("customMessage", customMessage);
    if (customEmailSubject) formData.append("customEmailSubject", customEmailSubject);
    formData.append("autoSendEnabled", autoSendEnabled ? "true" : "false");

    startTransition(async () => {
      const res = await saveReminderScheduleAction(invoiceId, {}, formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage("Reminder schedule saved successfully!");
        setTimeout(() => {
          setIsOpen(false);
        }, 1200);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-2">
            <Bell className="size-4 text-[var(--brand)]" />
            Set Reminder
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--mint)] text-[var(--brand)]">
              <Bell className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold text-[var(--ink)]">
                {existingSchedule ? "Edit Payment Reminder" : "Schedule Payment Reminder"}
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--muted-foreground)]">
                Invoice {invoiceReference} · Customer: {buyerDisplayName} · Outstanding:{" "}
                {variables.outstanding_amount}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab selection */}
        <div className="flex border-b border-[var(--line)]">
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "schedule"
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--ink)]"
            }`}
          >
            1. Channels & Timing
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("template")}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "template"
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--ink)]"
            }`}
          >
            2. Message Template
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "preview"
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--ink)]"
            }`}
          >
            3. Live Preview
          </button>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200 font-medium">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {activeTab === "schedule" && (
            <div className="space-y-5">
              {/* Channels Selection */}
              <div>
                <span className="block text-xs font-semibold text-[var(--ink)] mb-2">
                  Reminder Channels (Select one or more)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* WhatsApp (Disabled) */}
                  <div
                    title="WhatsApp reminders disabled for now"
                    className="flex items-center gap-3 p-3 rounded-xl border border-[var(--line)] bg-[#fafafa] text-[var(--muted-foreground)] opacity-50 cursor-not-allowed select-none"
                  >
                    <MessageSquare className="size-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-[var(--ink)]">WhatsApp</p>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-600 font-medium">Paused</span>
                      </div>
                      <p className="text-[11px] truncate">
                        {buyerPhone || "No phone on file"}
                      </p>
                    </div>
                  </div>

                  {/* Email */}
                  <button
                    type="button"
                    onClick={() => toggleChannel("email")}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      channels.includes("email")
                        ? "border-[#315b8a] bg-[#f0f6fc] text-[#315b8a] ring-1 ring-[#315b8a]"
                        : "border-[var(--line)] bg-white text-[var(--muted-foreground)] hover:bg-[#fafafa]"
                    }`}
                  >
                    <Mail className="size-5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--ink)]">Email</p>
                      <p className="text-[11px] truncate">
                        {buyerEmail || "No email on file"}
                      </p>
                    </div>
                  </button>

                  {/* SMS (Disabled) */}
                  <div
                    title="SMS reminders disabled for now"
                    className="flex items-center gap-3 p-3 rounded-xl border border-[var(--line)] bg-[#fafafa] text-[var(--muted-foreground)] opacity-50 cursor-not-allowed select-none"
                  >
                    <Phone className="size-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-[var(--ink)]">SMS Text</p>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-600 font-medium">Paused</span>
                      </div>
                      <p className="text-[11px] truncate">
                        {buyerPhone || "No phone on file"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Contact Warning if missing info */}
                {Object.values(contactValidation.channelErrors).length > 0 && (
                  <div className="mt-2.5 rounded-lg bg-amber-50 p-2.5 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="font-semibold">Contact Warning:</p>
                      <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                        {Object.entries(contactValidation.channelErrors).map(
                          ([ch, err]) => (
                            <li key={ch}>{err}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Start and End Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="startDateInput"
                    className="block text-xs font-semibold text-[var(--ink)] mb-1"
                  >
                    Schedule Start Date
                  </label>
                  <input
                    id="startDateInput"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--ink)]"
                  />
                  <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                    No reminders sent before this date
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="endDateInput"
                    className="block text-xs font-semibold text-[var(--ink)] mb-1"
                  >
                    Schedule End Date (Optional)
                  </label>
                  <input
                    id="endDateInput"
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--ink)]"
                  />
                  <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                    Stops sending after this date
                  </p>
                </div>
              </div>

              {/* Timing Section A: Relative to Due Date */}
              {dueOn ? (
                <div className="rounded-xl border border-[var(--line)] bg-[#fafcfb] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-[var(--brand)]" />
                        Relative Timing (Invoice Due: {variables.due_date})
                      </h4>
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        Triggered relative to the invoice due date
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addRelativeEvent}
                      className="h-7 text-[11px] gap-1"
                    >
                      <Plus className="size-3" />
                      Add Event
                    </Button>
                  </div>

                  {relativeEvents.length === 0 ? (
                    <p className="text-xs text-[var(--muted-foreground)] italic">
                      No relative events configured.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {relativeEvents.map((event, idx) => (
                        <div
                          key={event.id}
                          className="flex items-center gap-2 bg-white p-2 rounded-lg border border-[var(--line)] text-xs"
                        >
                          <select
                            value={event.offsetDays}
                            onChange={(e) =>
                              updateRelativeEvent(idx, "offsetDays", Number(e.target.value))
                            }
                            className="rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs font-medium"
                          >
                            <option value="-7">7 days before due date</option>
                            <option value="-5">5 days before due date</option>
                            <option value="-3">3 days before due date</option>
                            <option value="-1">1 day before due date</option>
                            <option value="0">On the due date</option>
                            <option value="1">1 day after due date</option>
                            <option value="3">3 days after due date</option>
                            <option value="7">7 days after due date</option>
                            <option value="14">14 days after due date</option>
                          </select>

                          <span className="text-[var(--muted-foreground)]">→</span>

                          <select
                            value={event.messageType}
                            onChange={(e) =>
                              updateRelativeEvent(
                                idx,
                                "messageType",
                                e.target.value as ReminderTemplateType,
                              )
                            }
                            className="rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs font-medium flex-1 min-w-0"
                          >
                            <option value="upcoming">Upcoming reminder</option>
                            <option value="due_today">Payment due today</option>
                            <option value="overdue">Overdue reminder</option>
                            <option value="part_paid">Partial payment reminder</option>
                            <option value="follow_up">Final follow-up</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => removeRelativeEvent(idx)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Remove event"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Timing Section B: Custom Reminder Dates */}
              <div className="rounded-xl border border-[var(--line)] bg-[#fafcfb] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                      <Clock className="size-3.5 text-[var(--brand)]" />
                      Specific Custom Dates
                    </h4>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Send reminders on exact calendar dates
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomDate}
                    className="h-7 text-[11px] gap-1"
                  >
                    <Plus className="size-3" />
                    Add Date
                  </Button>
                </div>

                {customDates.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] italic">
                    No custom dates added.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {customDates.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 bg-white p-2 rounded-lg border border-[var(--line)] text-xs"
                      >
                        <input
                          type="date"
                          value={item.date}
                          min={startDate}
                          max={endDate || undefined}
                          onChange={(e) => updateCustomDate(idx, "date", e.target.value)}
                          className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                        />

                        <select
                          value={item.messageType}
                          onChange={(e) =>
                            updateCustomDate(
                              idx,
                              "messageType",
                              e.target.value as ReminderTemplateType,
                            )
                          }
                          className="rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs font-medium flex-1 min-w-0"
                        >
                          <option value="upcoming">Upcoming reminder</option>
                          <option value="due_today">Payment due today</option>
                          <option value="overdue">Overdue reminder</option>
                          <option value="part_paid">Partial payment reminder</option>
                          <option value="follow_up">Final follow-up</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => removeCustomDate(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove date"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timing Section C: Repeat Frequency */}
              <div className="rounded-xl border border-[var(--line)] bg-white p-3.5 space-y-2">
                <span className="block text-xs font-semibold text-[var(--ink)]">
                  Recurring Repeat Frequency
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(
                    [
                      ["none", "None"],
                      ["daily", "Daily"],
                      ["every_3_days", "Every 3 days"],
                      ["weekly", "Weekly"],
                      ["custom", "Custom days"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRepeatFrequency(val)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-medium text-center transition-colors ${
                        repeatFrequency === val
                          ? "border-[var(--brand)] bg-[var(--mint)] text-[var(--brand)] font-bold"
                          : "border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[#fafafa]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {repeatFrequency === "custom" && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span>Repeat every</span>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={customIntervalDays}
                      onChange={(e) => setCustomIntervalDays(Number(e.target.value))}
                      className="w-16 rounded border border-[var(--line)] px-2 py-1 text-center font-bold"
                    />
                    <span>days</span>
                  </div>
                )}
              </div>

              {/* Automatic Sending Toggle */}
              <div className="rounded-xl border border-[#d9eee5] bg-[#f0fbf6] p-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="autoSend"
                  checked={autoSendEnabled}
                  onChange={(e) => setAutoSendEnabled(e.target.checked)}
                  className="mt-1 size-4 rounded border-[#25D366] text-[var(--brand)] focus:ring-[var(--brand)]"
                />
                <label htmlFor="autoSend" className="text-xs cursor-pointer select-none">
                  <span className="font-bold text-[var(--ink)] block">
                    Automatically send scheduled reminders
                  </span>
                  <span className="text-[var(--muted-foreground)] block mt-0.5">
                    When enabled, Webameen will automatically process reminders in the
                    background even when you are logged out. When disabled, occurrences are
                    saved as a draft and require manual confirmation.
                  </span>
                </label>
              </div>
            </div>
          )}

          {activeTab === "template" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="templateSelect"
                  className="block text-xs font-semibold text-[var(--ink)] mb-1"
                >
                  Base Message Template
                </label>
                <select
                  id="templateSelect"
                  value={templateType}
                  onChange={(e) => setTemplateType(e.target.value as ReminderTemplateType)}
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--ink)]"
                >
                  <option value="upcoming">Upcoming payment reminder</option>
                  <option value="due_today">Payment due today</option>
                  <option value="overdue">Overdue payment reminder</option>
                  <option value="part_paid">Partial payment received</option>
                  <option value="follow_up">Final payment follow-up</option>
                  <option value="custom">Custom message</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="emailSubjectInput"
                  className="block text-xs font-semibold text-[var(--ink)] mb-1"
                >
                  Email Subject Line (For Email channel)
                </label>
                <input
                  id="emailSubjectInput"
                  type="text"
                  value={
                    customEmailSubject || DEFAULT_TEMPLATES[templateType]?.subject || ""
                  }
                  onChange={(e) => setCustomEmailSubject(e.target.value)}
                  placeholder="Payment reminder: Invoice {{invoice_number}}"
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--ink)]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="messageBodyTextarea"
                    className="block text-xs font-semibold text-[var(--ink)]"
                  >
                    Message Body
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMessage(DEFAULT_TEMPLATES[templateType]?.body || "");
                    }}
                    className="text-[11px] text-[var(--brand)] hover:underline"
                  >
                    Reset to default template
                  </button>
                </div>
                <textarea
                  id="messageBodyTextarea"
                  rows={4}
                  value={customMessage || DEFAULT_TEMPLATES[templateType]?.body || ""}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-white p-3 text-xs text-[var(--ink)] font-mono leading-relaxed"
                />
                <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                  <span className="font-semibold text-[var(--ink)]">
                    Supported Variables:
                  </span>{" "}
                  <code>{"{{customer_name}}"}</code>, <code>{"{{invoice_number}}"}</code>,{" "}
                  <code>{"{{outstanding_amount}}"}</code>, <code>{"{{due_date}}"}</code>,{" "}
                  <code>{"{{business_name}}"}</code>, <code>{"{{invoice_total}}"}</code>,{" "}
                  <code>{"{{amount_paid}}"}</code>
                </div>
              </div>
            </div>
          )}

          {activeTab === "preview" && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--muted-foreground)]">
                This is a live preview of the message customer{" "}
                <span className="font-semibold text-[var(--ink)]">{buyerDisplayName}</span>{" "}
                will receive. Notice that outstanding balances and amounts always use INR
                formatting.
              </p>

              <div className="rounded-xl border border-[var(--line)] bg-[#fafcfb] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-[var(--line)] pb-2">
                  <span className="font-semibold text-[var(--ink)]">
                    Recipient: {buyerDisplayName}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    Channels: {channels.join(", ")}
                  </span>
                </div>

                {channels.includes("email") && (
                  <div className="text-xs bg-white p-2.5 rounded-lg border border-[var(--line)]">
                    <span className="text-[var(--muted-foreground)] font-semibold">
                      Subject:{" "}
                    </span>
                    <span className="font-medium text-[var(--ink)]">
                      {previewRender.subject}
                    </span>
                  </div>
                )}

                <div className="bg-white p-4 rounded-xl border border-[var(--line)] text-xs text-[var(--ink)] whitespace-pre-wrap leading-relaxed shadow-xs">
                  {previewRender.body}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || channels.length === 0}
              className="bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90 gap-1.5"
            >
              {isPending ? (
                "Saving Schedule..."
              ) : (
                <>
                  <Send className="size-3.5" />
                  Save Reminder Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
