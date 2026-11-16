import { z } from "zod";
import type { ContactValidationResult, ReminderChannel } from "./types";

export const reminderChannelSchema = z.enum(["whatsapp", "email", "sms"]);

export const reminderTemplateTypeSchema = z.enum([
  "upcoming",
  "due_today",
  "overdue",
  "part_paid",
  "follow_up",
  "custom",
]);

export const repeatFrequencySchema = z.enum([
  "none",
  "daily",
  "every_3_days",
  "weekly",
  "custom",
]);

export const relativeEventSchema = z.object({
  offsetDays: z.coerce.number().int().min(-365).max(365),
  messageType: reminderTemplateTypeSchema,
});

export const customDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be formatted as YYYY-MM-DD"),
  messageType: reminderTemplateTypeSchema,
});

export const reminderFormSchema = z
  .object({
    invoiceId: z.string().uuid("Invalid invoice ID"),
    channels: z.array(reminderChannelSchema).min(1, "Select at least one reminder channel"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD")
      .nullable()
      .optional(),
    relativeEvents: z.array(relativeEventSchema).default([]),
    customDates: z.array(customDateSchema).default([]),
    repeatFrequency: repeatFrequencySchema.default("none"),
    customIntervalDays: z.coerce.number().int().positive().max(365).optional(),
    templateType: reminderTemplateTypeSchema.default("upcoming"),
    customMessage: z
      .string()
      .max(2000, "Message cannot exceed 2000 characters")
      .nullable()
      .optional(),
    customEmailSubject: z
      .string()
      .max(250, "Email subject cannot exceed 250 characters")
      .nullable()
      .optional(),
    autoSendEnabled: z.boolean().default(true),
    timezone: z.string().default("Asia/Kolkata"),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "End date cannot be earlier than start date",
        path: ["endDate"],
      });
    }

    if (data.repeatFrequency === "custom") {
      if (!data.customIntervalDays || data.customIntervalDays < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a positive number of days for custom repeat frequency",
          path: ["customIntervalDays"],
        });
      }
    }

    if (
      data.relativeEvents.length === 0 &&
      data.customDates.length === 0 &&
      data.repeatFrequency === "none"
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Please configure at least one reminder timing option (relative event, custom date, or repeat frequency)",
        path: ["relativeEvents"],
      });
    }
  });

export type ReminderFormInput = z.infer<typeof reminderFormSchema>;

export function validateCustomerContacts(contact: {
  email?: string | null;
  phone?: string | null;
  channels: ReminderChannel[];
}): ContactValidationResult {
  const rawEmail = contact.email ? contact.email.trim() : null;
  const rawPhone = contact.phone ? contact.phone.trim() : null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasValidEmail = Boolean(rawEmail && emailRegex.test(rawEmail));

  // Phone validation: supports 10-digit Indian numbers, +91, 0091, or E.164
  const digitsOnly = rawPhone ? rawPhone.replace(/\D/g, "") : "";
  const hasValidPhone = Boolean(
    rawPhone &&
      digitsOnly.length >= 10 &&
      digitsOnly.length <= 15 &&
      /^\+?[0-9\s\-()]{10,20}$/.test(rawPhone),
  );

  const channelErrors: { whatsapp?: string; sms?: string; email?: string } = {};

  for (const channel of contact.channels) {
    if (channel === "whatsapp" && !hasValidPhone) {
      channelErrors.whatsapp = "Customer has no valid phone number for WhatsApp reminders.";
    }
    if (channel === "sms" && !hasValidPhone) {
      channelErrors.sms = "Customer has no valid phone number for SMS reminders.";
    }
    if (channel === "email" && !hasValidEmail) {
      channelErrors.email = "Customer has no valid email address for Email reminders.";
    }
  }

  return {
    hasValidEmail,
    hasValidPhone,
    normalizedEmail: hasValidEmail && rawEmail ? rawEmail.toLowerCase() : null,
    normalizedPhone: hasValidPhone && rawPhone ? formatPhoneNumber(rawPhone) : null,
    channelErrors,
  };
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  // If 10 digits starting with 6-9 (Indian mobile), prefix +91
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}
