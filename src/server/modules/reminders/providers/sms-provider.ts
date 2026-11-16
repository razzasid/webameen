import { serverEnvironment } from "@/config/env";
import type {
  ChannelProviderStatus,
  ProviderSendOptions,
  ProviderSendResult,
  ReminderChannelProvider,
} from "./types";

export class TwilioSmsProvider implements ReminderChannelProvider {
  channel = "sms" as const;
  name = "twilio_sms";

  getStatus(): ChannelProviderStatus {
    const missing: string[] = [];
    if (!serverEnvironment.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
    if (!serverEnvironment.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
    if (!serverEnvironment.TWILIO_SMS_FROM) missing.push("TWILIO_SMS_FROM");

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
        errorMessage: `SMS provider not configured. Missing environment variables: ${status.missingVariables.join(", ")}`,
      };
    }

    try {
      const accountSid = serverEnvironment.TWILIO_ACCOUNT_SID ?? "";
      const authToken = serverEnvironment.TWILIO_AUTH_TOKEN ?? "";
      const fromNumber = serverEnvironment.TWILIO_SMS_FROM ?? "";
      const toNumber = options.recipient;

      const params = new URLSearchParams();
      params.append("From", fromNumber);
      params.append("To", toNumber);
      params.append("Body", options.body);

      const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          deliveryStatus: "failed",
          errorCode: data?.code ? String(data.code) : `HTTP_${response.status}`,
          errorMessage: data?.message || `Twilio SMS failed with status ${response.status}`,
        };
      }

      return {
        success: true,
        provider: this.name,
        providerMessageId: data?.sid || null,
        deliveryStatus: data?.status === "delivered" ? "delivered" : "sent",
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
