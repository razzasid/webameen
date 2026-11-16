import { serverEnvironment } from "@/config/env";
import type {
  ChannelProviderStatus,
  ProviderSendOptions,
  ProviderSendResult,
  ReminderChannelProvider,
} from "./types";

export class TwilioWhatsAppProvider implements ReminderChannelProvider {
  channel = "whatsapp" as const;
  name = "twilio_whatsapp";

  getStatus(): ChannelProviderStatus {
    const missing: string[] = [];
    if (!serverEnvironment.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
    if (!serverEnvironment.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
    if (!serverEnvironment.TWILIO_WHATSAPP_FROM) missing.push("TWILIO_WHATSAPP_FROM");

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
        errorMessage: `WhatsApp provider not configured. Missing environment variables: ${status.missingVariables.join(", ")}`,
      };
    }

    try {
      const accountSid = serverEnvironment.TWILIO_ACCOUNT_SID ?? "";
      const authToken = serverEnvironment.TWILIO_AUTH_TOKEN ?? "";
      let fromNumber = serverEnvironment.TWILIO_WHATSAPP_FROM ?? "";
      if (!fromNumber.startsWith("whatsapp:")) {
        fromNumber = `whatsapp:${fromNumber}`;
      }

      let toNumber = options.recipient;
      if (!toNumber.startsWith("whatsapp:")) {
        toNumber = `whatsapp:${toNumber}`;
      }

      const params = new URLSearchParams();
      params.append("From", fromNumber);
      params.append("To", toNumber);

      const contentSid = serverEnvironment.TWILIO_WHATSAPP_CONTENT_SID;
      if (contentSid) {
        params.append("ContentSid", contentSid);
        params.append(
          "ContentVariables",
          JSON.stringify({
            "1": options.body,
          }),
        );
      } else {
        params.append("Body", options.body);
      }

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
          errorMessage:
            data?.message || `Twilio WhatsApp failed with status ${response.status}`,
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
