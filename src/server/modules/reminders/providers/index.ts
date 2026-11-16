import type { ReminderChannel } from "../types";
import { ResendEmailProvider } from "./email-provider";
import { TwilioSmsProvider } from "./sms-provider";
import type { ChannelProviderStatus, ReminderChannelProvider } from "./types";
import { TwilioWhatsAppProvider } from "./whatsapp-provider";

export * from "./email-provider";
export * from "./sms-provider";
export * from "./types";
export * from "./whatsapp-provider";

const emailProvider = new ResendEmailProvider();
const whatsAppProvider = new TwilioWhatsAppProvider();
const smsProvider = new TwilioSmsProvider();

export function getChannelProvider(channel: ReminderChannel): ReminderChannelProvider {
  switch (channel) {
    case "email":
      return emailProvider;
    case "whatsapp":
      return whatsAppProvider;
    case "sms":
      return smsProvider;
  }
}

export function getAllProviderStatuses(): ChannelProviderStatus[] {
  return [whatsAppProvider.getStatus(), emailProvider.getStatus(), smsProvider.getStatus()];
}
