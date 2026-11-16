import { describe, expect, it } from "vitest";
import {
  getAllProviderStatuses,
  getChannelProvider,
  ResendEmailProvider,
  TwilioSmsProvider,
  TwilioWhatsAppProvider,
} from "./providers";

describe("channel provider integrations", () => {
  it("resolves providers for each channel", () => {
    const email = getChannelProvider("email");
    expect(email.channel).toBe("email");
    expect(email.name).toBe("resend");

    const whatsapp = getChannelProvider("whatsapp");
    expect(whatsapp.channel).toBe("whatsapp");
    expect(whatsapp.name).toBe("twilio_whatsapp");

    const sms = getChannelProvider("sms");
    expect(sms.channel).toBe("sms");
    expect(sms.name).toBe("twilio_sms");
  });

  it("reports unconfigured provider status honestly when credentials are missing", () => {
    const emailProvider = new ResendEmailProvider();
    const status = emailProvider.getStatus();

    expect(status.channel).toBe("email");
    expect(status.providerName).toBe("resend");
    // If RESEND_API_KEY is not set in environment, configured must be false
    if (!process.env.RESEND_API_KEY) {
      expect(status.configured).toBe(false);
      expect(status.missingVariables).toContain("RESEND_API_KEY");
    }
  });

  it("refuses to simulate delivery and returns failed result when unconfigured", async () => {
    const whatsappProvider = new TwilioWhatsAppProvider();

    // In local test environment without TWILIO credentials:
    const res = await whatsappProvider.send({
      recipient: "+919876543210",
      body: "Test reminder",
    });

    if (!process.env.TWILIO_ACCOUNT_SID) {
      expect(res.success).toBe(false);
      expect(res.deliveryStatus).toBe("failed");
      expect(res.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
      expect(res.errorMessage).toContain("WhatsApp provider not configured");
    }
  });

  it("checks SMS provider returns failure when unconfigured", async () => {
    const smsProvider = new TwilioSmsProvider();
    const res = await smsProvider.send({
      recipient: "+919876543210",
      body: "Test SMS reminder",
    });

    if (!process.env.TWILIO_ACCOUNT_SID) {
      expect(res.success).toBe(false);
      expect(res.deliveryStatus).toBe("failed");
      expect(res.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
    }
  });

  it("aggregates status for all three channels", () => {
    const statuses = getAllProviderStatuses();
    expect(statuses).toHaveLength(3);
    const channels = statuses.map((s) => s.channel);
    expect(channels).toContain("whatsapp");
    expect(channels).toContain("email");
    expect(channels).toContain("sms");
  });
});
