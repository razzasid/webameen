import { serverEnvironment } from "@/config/env";
import type {
  ChannelProviderStatus,
  ProviderSendOptions,
  ProviderSendResult,
  ReminderChannelProvider,
} from "./types";

export class ResendEmailProvider implements ReminderChannelProvider {
  channel = "email" as const;
  name = "resend";

  getStatus(): ChannelProviderStatus {
    const missing: string[] = [];
    if (!serverEnvironment.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!serverEnvironment.EMAIL_FROM) missing.push("EMAIL_FROM");

    return {
      channel: this.channel,
      configured: missing.length === 0,
      providerName: this.name,
      missingVariables: missing,
    };
  }

  async send(options: ProviderSendOptions): Promise<ProviderSendResult> {
    const status = this.getStatus();
    if (!status.configured) {
      return {
        success: false,
        provider: this.name,
        deliveryStatus: "failed",
        errorCode: "PROVIDER_NOT_CONFIGURED",
        errorMessage: `Email provider not configured. Missing environment variables: ${status.missingVariables.join(", ")}`,
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serverEnvironment.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: serverEnvironment.EMAIL_FROM,
          to: [options.recipient],
          subject: options.subject || "Invoice Payment Reminder",
          text: options.body,
          html: options.htmlBody || `<p>${options.body.replace(/\n/g, "<br/>")}</p>`,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          deliveryStatus: "failed",
          errorCode: `HTTP_${response.status}`,
          errorMessage: data?.message || `Resend API failed with status ${response.status}`,
        };
      }

      return {
        success: true,
        provider: this.name,
        providerMessageId: data?.id || null,
        deliveryStatus: "sent",
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        deliveryStatus: "failed",
        errorCode: "NETWORK_ERROR",
        errorMessage: error instanceof Error ? error.message : "Unknown network error",
      };
    }
  }
}
