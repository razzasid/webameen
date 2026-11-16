export type ReminderChannel = "whatsapp" | "email" | "sms";

export type ReminderScheduleType =
  | "due_date_relative"
  | "custom_dates"
  | "recurring"
  | "hybrid";

export type ReminderTemplateType =
  | "upcoming"
  | "due_today"
  | "overdue"
  | "part_paid"
  | "follow_up"
  | "custom";

export type ReminderScheduleStatus = "active" | "paused" | "completed" | "cancelled";

export type ReminderOccurrenceStatus =
  | "pending"
  | "processing"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled"
  | "skipped";

export type ReminderDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "undelivered";

export type RelativeReminderEvent = {
  offsetDays: number;
  messageType: ReminderTemplateType;
};

export type CustomReminderDate = {
  date: string; // YYYY-MM-DD
  messageType: ReminderTemplateType;
};

export type RepeatFrequency = "none" | "daily" | "every_3_days" | "weekly" | "custom";

export type ReminderTimingConfig = {
  relativeEvents: RelativeReminderEvent[];
  customDates: CustomReminderDate[];
  repeatFrequency: RepeatFrequency;
  customIntervalDays?: number;
};

export type ReminderSchedule = {
  id: string;
  business_id: string;
  invoice_id: string;
  channels: ReminderChannel[];
  schedule_type: ReminderScheduleType;
  timing_config: ReminderTimingConfig;
  start_date: string;
  end_date: string | null;
  template_type: ReminderTemplateType;
  custom_message: string | null;
  custom_email_subject: string | null;
  auto_send_enabled: boolean;
  status: ReminderScheduleStatus;
  stop_reason: string | null;
  timezone: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ReminderOccurrence = {
  id: string;
  schedule_id: string;
  business_id: string;
  invoice_id: string;
  channel: ReminderChannel;
  scheduled_for: string;
  scheduled_date: string;
  message_type: ReminderTemplateType;
  status: ReminderOccurrenceStatus;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  processing_started_at: string | null;
  processed_at: string | null;
  failure_reason: string | null;
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ReminderDelivery = {
  id: string;
  occurrence_id: string | null;
  schedule_id: string;
  business_id: string;
  invoice_id: string;
  channel: ReminderChannel;
  recipient: string;
  rendered_subject: string | null;
  rendered_body: string;
  provider: string;
  provider_message_id: string | null;
  delivery_status: ReminderDeliveryStatus;
  attempt_number: number;
  sent_at: string;
  delivered_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

export type ContactValidationResult = {
  hasValidEmail: boolean;
  hasValidPhone: boolean;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  channelErrors: {
    whatsapp?: string;
    sms?: string;
    email?: string;
  };
};

export type ReminderScheduleDetail = {
  schedule: ReminderSchedule | null;
  occurrences: ReminderOccurrence[];
  deliveries: ReminderDelivery[];
  nextOccurrence: ReminderOccurrence | null;
  lastDelivery: ReminderDelivery | null;
};
