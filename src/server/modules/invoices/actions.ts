"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import { isUuid } from "@/server/shared/uuid";

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid calendar date.")
  .refine(isCalendarDate, {
    message: "Use a valid calendar date.",
  });

const numberPeriodSchema = z
  .object({
    periodKey: z.string().trim().min(1, "Enter a period name.").max(80),
    startsOn: dateSchema,
    endsBefore: dateSchema,
    prefix: z.string().max(80, "Prefix is too long."),
    formatTemplate: z.string().trim().min(1, "Enter an invoice format.").max(160),
    minimumDigits: z.coerce.number().int().min(1).max(19),
    startingNumber: z
      .string()
      .regex(/^[1-9]\d{0,18}$/, "Enter a positive whole number.")
      .refine(
        (value) => value.length < 19 || value <= "9223372036854775807",
        "Starting number is too large.",
      ),
  })
  .superRefine((value, context) => {
    if (value.startsOn >= value.endsBefore) {
      context.addIssue({
        code: "custom",
        path: ["endsBefore"],
        message: "End date must be after start date.",
      });
    }
    const template = value.formatTemplate;
    if (
      template.split("{number}").length !== 2 ||
      template
        .replaceAll("{number}", "")
        .replaceAll("{prefix}", "")
        .replaceAll("{period}", "")
        .match(/[{}]/)
    ) {
      context.addIssue({
        code: "custom",
        path: ["formatTemplate"],
        message: "Use {number} once, with optional {prefix} and {period} placeholders.",
      });
    }
  });

export type InvoiceNumberPeriodValues = {
  periodKey: string;
  startsOn: string;
  endsBefore: string;
  prefix: string;
  formatTemplate: string;
  minimumDigits: string;
  startingNumber: string;
};

export type InvoiceNumberPeriodActionState = {
  values?: InvoiceNumberPeriodValues;
  fieldErrors?: Partial<Record<keyof InvoiceNumberPeriodValues, string>>;
  error?: string;
  saved?: boolean;
};

function readPeriodValues(formData: FormData): InvoiceNumberPeriodValues {
  return {
    periodKey: String(formData.get("periodKey") ?? ""),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsBefore: String(formData.get("endsBefore") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
    formatTemplate: String(formData.get("formatTemplate") ?? ""),
    minimumDigits: String(formData.get("minimumDigits") ?? ""),
    startingNumber: String(formData.get("startingNumber") ?? ""),
  };
}

export async function configureInvoiceNumberPeriodAction(
  _previous: InvoiceNumberPeriodActionState,
  formData: FormData,
): Promise<InvoiceNumberPeriodActionState> {
  await requireAuthenticatedUser();
  const values = readPeriodValues(formData);
  const parsed = numberPeriodSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: NonNullable<InvoiceNumberPeriodActionState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof InvoiceNumberPeriodValues | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { values, fieldErrors };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("configure_invoice_number_period", {
      p_period_key: parsed.data.periodKey,
      p_starts_on: parsed.data.startsOn,
      p_ends_before: parsed.data.endsBefore,
      p_prefix: parsed.data.prefix,
      p_format_template: parsed.data.formatTemplate,
      p_minimum_digits: parsed.data.minimumDigits,
      p_starting_number: parsed.data.startingNumber,
    });
    if (error) {
      return {
        values,
        error:
          error.code === "23514"
            ? "This period overlaps another period or has already issued invoices. Review the existing periods."
            : error.code === "22023"
              ? "Review the period dates and invoice format, then try again."
              : "We couldn't save this numbering period. Please try again.",
      };
    }
  } catch {
    return {
      values,
      error: "Invoice numbering settings are temporarily unavailable. Please try again.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return { saved: true };
}

export type IssueInvoiceActionState = {
  error?: string;
  invoiceId?: string;
  created?: boolean;
  dueOn?: string;
};

export async function issueApprovedQuotationAction(
  _previous: IssueInvoiceActionState,
  formData: FormData,
): Promise<IssueInvoiceActionState> {
  await requireAuthenticatedUser();
  const quotationId = String(formData.get("quotationId") ?? "");
  const dueOn = String(formData.get("dueOn") ?? "");
  const reviewed = formData.get("reviewed") === "on";
  if (!isUuid(quotationId)) return { error: "Reload the quotation and try again.", dueOn };
  if (dueOn && !dateSchema.safeParse(dueOn).success) {
    return { error: "Enter a valid due date.", dueOn };
  }
  if (!reviewed) {
    return {
      error: "Review the approved quotation and confirm before issuing the invoice.",
      dueOn,
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("convert_approved_quotation", {
      p_quotation_id: quotationId,
      p_due_on: dueOn || null,
      p_confirmed_review: reviewed,
    });
    if (error) {
      if (error.code === "42501" || error.code === "P0002") {
        return { error: "This quotation is unavailable.", dueOn };
      }
      if (error.code === "23514") {
        return {
          error:
            "This quotation no longer has current customer approval. Reload its history and review it.",
          dueOn,
        };
      }
      if (error.code === "22003") {
        return {
          error:
            "This numbering period has run out of numbers. Configure another period in Settings.",
          dueOn,
        };
      }
      if (error.code === "22023") {
        return {
          error: error.message.includes("numbering period")
            ? "No invoice numbering period covers today's date. Configure one in Settings before issuing."
            : error.message.includes("Due date")
              ? "Due date cannot be before the invoice date."
              : "Review the approved quotation and invoice details, then try again.",
          dueOn,
        };
      }
      if (error.code === "40001") {
        return {
          error: "The numbering period changed while issuing. Retry the invoice issue.",
          dueOn,
        };
      }
      return { error: "We couldn't issue this invoice. Please try again.", dueOn };
    }
    const result = data as { invoice_id?: string; created?: boolean } | null;
    if (!result?.invoice_id || !isUuid(result.invoice_id)) {
      return {
        error:
          "The invoice result could not be confirmed. Reload the quotation before retrying.",
        dueOn,
      };
    }
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${result.invoice_id}`);
    return { invoiceId: result.invoice_id, created: result.created === true, dueOn };
  } catch {
    return {
      error: "Invoice issuance is temporarily unavailable. Please try again.",
      dueOn,
    };
  }
}
