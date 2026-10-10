import { z } from "zod";
import { rupeesToPaise } from "@/server/modules/catalog/validation";
import { isUuid } from "@/server/shared/uuid";

const rupeePattern = /^(?:\d+)(?:\.\d{1,2})?$/;
const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export function isValidLocalDateTime(value: string): boolean {
  const match = localDateTimePattern.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const rawPaymentSchema = z
  .object({
    requestKey: z.string().refine(isUuid, "Refresh and try again."),
    amount: z
      .string()
      .trim()
      .min(1, "Enter the amount received.")
      .max(24, "Enter a smaller amount.")
      .regex(rupeePattern, "Enter an amount with up to two decimal places."),
    receivedAt: z
      .string()
      .refine(isValidLocalDateTime, "Enter a valid received date and time."),
    method: z.string().trim().min(1, "Enter the payment method.").max(80),
    externalReference: z.string().trim().max(200, "Reference is too long."),
    replacesPaymentId: z
      .string()
      .refine(
        (value) => value === "" || isUuid(value),
        "This replacement payment is invalid.",
      ),
  })
  .superRefine((values, context) => {
    if (!rupeePattern.test(values.amount) || values.amount.length > 24) return;
    try {
      const amountMinor = rupeesToPaise(values.amount);
      if (!amountMinor || BigInt(amountMinor) <= BigInt(0)) {
        context.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Enter an amount greater than zero.",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter a smaller amount.",
      });
    }
  });

export const paymentFormSchema = rawPaymentSchema.transform((values) => ({
  ...values,
  amountMinor: rupeesToPaise(values.amount) ?? "0",
  externalReference: values.externalReference || null,
  replacesPaymentId: values.replacesPaymentId || null,
}));

export type PaymentFormValues = {
  requestKey: string;
  amount: string;
  receivedAt: string;
  method: string;
  externalReference: string;
  replacesPaymentId: string;
};

export type PaymentField = keyof PaymentFormValues;

export type PaymentActionState = {
  values?: PaymentFormValues;
  fieldErrors?: Partial<Record<PaymentField, string>>;
  error?: string;
};

export function readPaymentForm(formData: FormData): PaymentFormValues {
  return {
    requestKey: String(formData.get("requestKey") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    receivedAt: String(formData.get("receivedAt") ?? ""),
    method: String(formData.get("method") ?? ""),
    externalReference: String(formData.get("externalReference") ?? ""),
    replacesPaymentId: String(formData.get("replacesPaymentId") ?? ""),
  };
}

export function paymentFieldErrors(error: z.ZodError): PaymentActionState["fieldErrors"] {
  const fieldErrors: PaymentActionState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as PaymentField | undefined;
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export const reversalReasonSchema = z
  .string()
  .trim()
  .min(1, "Enter why this payment needs correction.")
  .max(1000, "Keep the reason under 1,000 characters.");
