import { describe, expect, it } from "vitest";
import {
  formatPhoneNumber,
  reminderFormSchema,
  validateCustomerContacts,
} from "./validation";

describe("reminder form validation", () => {
  const validBase = {
    invoiceId: "11111111-1111-4111-8111-111111111111",
    channels: ["whatsapp", "email"] as const,
    startDate: "2026-11-15",
    endDate: "2026-12-15",
    relativeEvents: [{ offsetDays: -3, messageType: "upcoming" as const }],
    customDates: [],
    repeatFrequency: "none" as const,
    templateType: "upcoming" as const,
    autoSendEnabled: true,
    timezone: "Asia/Kolkata",
  };

  it("accepts valid reminder schedule input", () => {
    const res = reminderFormSchema.safeParse(validBase);
    expect(res.success).toBe(true);
  });

  it("allows selecting all three channels simultaneously", () => {
    const res = reminderFormSchema.safeParse({
      ...validBase,
      channels: ["whatsapp", "email", "sms"],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.channels).toHaveLength(3);
    }
  });

  it("rejects when no channels are selected", () => {
    const res = reminderFormSchema.safeParse({
      ...validBase,
      channels: [],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/at least one reminder channel/i);
    }
  });

  it("rejects when end date is earlier than start date", () => {
    const res = reminderFormSchema.safeParse({
      ...validBase,
      startDate: "2026-11-20",
      endDate: "2026-11-10",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/cannot be earlier than start date/i);
    }
  });

  it("validates custom repeat interval requires positive days", () => {
    const res = reminderFormSchema.safeParse({
      ...validBase,
      repeatFrequency: "custom",
      customIntervalDays: 0,
    });
    expect(res.success).toBe(false);

    const validRes = reminderFormSchema.safeParse({
      ...validBase,
      repeatFrequency: "custom",
      customIntervalDays: 5,
    });
    expect(validRes.success).toBe(true);
  });

  it("rejects schedule without any timing options configured", () => {
    const res = reminderFormSchema.safeParse({
      ...validBase,
      relativeEvents: [],
      customDates: [],
      repeatFrequency: "none",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(
        /configure at least one reminder timing/i,
      );
    }
  });

  it("accepts custom dates and custom messages", () => {
    const res = reminderFormSchema.safeParse({
      ...validBase,
      relativeEvents: [],
      customDates: [
        { date: "2026-11-18", messageType: "due_today" as const },
        { date: "2026-11-25", messageType: "overdue" as const },
      ],
      customMessage: "Dear customer, kindly settle invoice {{invoice_number}}.",
      customEmailSubject: "Urgent Payment Reminder: {{invoice_number}}",
    });
    expect(res.success).toBe(true);
  });
});

describe("customer contact validation", () => {
  it("validates eligible email and phone", () => {
    const res = validateCustomerContacts({
      email: "buyer@example.com",
      phone: "+919876543210",
      channels: ["whatsapp", "email", "sms"],
    });

    expect(res.hasValidEmail).toBe(true);
    expect(res.hasValidPhone).toBe(true);
    expect(res.normalizedEmail).toBe("buyer@example.com");
    expect(res.normalizedPhone).toBe("+919876543210");
    expect(Object.keys(res.channelErrors)).toHaveLength(0);
  });

  it("detects missing email for email channel", () => {
    const res = validateCustomerContacts({
      email: null,
      phone: "9876543210",
      channels: ["email"],
    });

    expect(res.hasValidEmail).toBe(false);
    expect(res.channelErrors.email).toBeDefined();
  });

  it("detects missing phone for WhatsApp and SMS channels", () => {
    const res = validateCustomerContacts({
      email: "client@test.com",
      phone: "",
      channels: ["whatsapp", "sms"],
    });

    expect(res.hasValidPhone).toBe(false);
    expect(res.channelErrors.whatsapp).toBeDefined();
    expect(res.channelErrors.sms).toBeDefined();
  });

  it("formats 10-digit Indian numbers with +91 country prefix", () => {
    expect(formatPhoneNumber("9876543210")).toBe("+919876543210");
    expect(formatPhoneNumber("+919876543210")).toBe("+919876543210");
    expect(formatPhoneNumber("+14155552671")).toBe("+14155552671");
  });
});
