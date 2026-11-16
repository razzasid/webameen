import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const publicEnvironmentSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalKey,
  })
  .superRefine((environment, context) => {
    const hasUrl = Boolean(environment.NEXT_PUBLIC_SUPABASE_URL);
    const hasKey = Boolean(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

    if (hasUrl !== hasKey) {
      context.addIssue({
        code: "custom",
        message: "Set both Supabase public values or leave both blank.",
        path: ["NEXT_PUBLIC_SUPABASE_URL"],
      });
    }
  });

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  source: Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export const publicEnvironment = parsePublicEnvironment({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

const serverEnvironmentSchema = z.object({
  SUPABASE_QUOTE_BROKER_KEY: optionalKey,
  SUPABASE_INVOICE_BROKER_KEY: optionalKey,
  SUPABASE_SERVICE_ROLE_KEY: optionalKey,
  WEBAMEEN_REMINDER_WORKER_KEY: optionalKey,
  CRON_SECRET: optionalKey,
  RESEND_API_KEY: optionalKey,
  EMAIL_FROM: optionalKey,
  TWILIO_ACCOUNT_SID: optionalKey,
  TWILIO_AUTH_TOKEN: optionalKey,
  TWILIO_WHATSAPP_FROM: optionalKey,
  TWILIO_WHATSAPP_CONTENT_SID: optionalKey,
  TWILIO_SMS_FROM: optionalKey,
  META_WHATSAPP_TOKEN: optionalKey,
  META_WHATSAPP_PHONE_NUMBER_ID: optionalKey,
});

export const serverEnvironment = serverEnvironmentSchema.parse({
  SUPABASE_QUOTE_BROKER_KEY: process.env.SUPABASE_QUOTE_BROKER_KEY,
  SUPABASE_INVOICE_BROKER_KEY: process.env.SUPABASE_INVOICE_BROKER_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  WEBAMEEN_REMINDER_WORKER_KEY: process.env.WEBAMEEN_REMINDER_WORKER_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
  TWILIO_WHATSAPP_CONTENT_SID: process.env.TWILIO_WHATSAPP_CONTENT_SID,
  TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM,
  META_WHATSAPP_TOKEN: process.env.META_WHATSAPP_TOKEN,
  META_WHATSAPP_PHONE_NUMBER_ID: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
});

export function isSupabaseConfigured(): boolean {
  return Boolean(
    publicEnvironment.NEXT_PUBLIC_SUPABASE_URL &&
      publicEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
