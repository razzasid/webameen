import type { ReminderChannel, ReminderDeliveryStatus } from "../types";

export type ProviderSendOptions = {
  recipient: string;
  subject?: string | null;
  body: string;
  htmlBody?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderSendResult = {
  success: boolean;
  provider: string;
  providerMessageId?: string | null;
  deliveryStatus: ReminderDeliveryStatus;
  deliveredAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type ChannelProviderStatus = {
  channel: ReminderChannel;
  configured: boolean;
  providerName: string;
  missingVariables: string[];
};

export interface ReminderChannelProvider {
  channel: ReminderChannel;
  name: string;
  getStatus(): ChannelProviderStatus;
  send(options: ProviderSendOptions): Promise<ProviderSendResult>;
}
