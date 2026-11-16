import { formatPaise } from "@/server/modules/catalog/validation";
import type { ReminderChannel, ReminderTemplateType } from "./types";

export type TemplateVariables = {
  business_name: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  invoice_total: string;
  amount_paid: string;
  outstanding_amount: string;
  currency: string;
  invoice_link?: string | null;
};

export const DEFAULT_TEMPLATES: Record<
  ReminderTemplateType,
  { subject: string; body: string }
> = {
  upcoming: {
    subject: "Payment reminder: Invoice {{invoice_number}} from {{business_name}}",
    body: "Hello {{customer_name}}, this is a friendly reminder that invoice {{invoice_number}} from {{business_name}} for {{outstanding_amount}} is due on {{due_date}}. Please arrange payment at your convenience. Thank you.",
  },
  due_today: {
    subject: "Invoice {{invoice_number}} is due today - {{business_name}}",
    body: "Hello {{customer_name}}, invoice {{invoice_number}} for {{outstanding_amount}} is due today. Please let us know if payment has already been made. Thank you, {{business_name}}.",
  },
  overdue: {
    subject: "Overdue payment reminder: Invoice {{invoice_number}}",
    body: "Hello {{customer_name}}, invoice {{invoice_number}} from {{business_name}} is overdue. The outstanding balance is {{outstanding_amount}}. Please arrange payment or contact us if you need assistance.",
  },
  part_paid: {
    subject:
      "Partial payment received for Invoice {{invoice_number}} - Balance: {{outstanding_amount}}",
    body: "Hello {{customer_name}}, we have received your partial payment for invoice {{invoice_number}}. The remaining balance is {{outstanding_amount}}. Thank you, {{business_name}}.",
  },
  follow_up: {
    subject: "Follow-up: Pending Invoice {{invoice_number}} from {{business_name}}",
    body: "Hello {{customer_name}}, this is a follow-up regarding invoice {{invoice_number}} for {{outstanding_amount}} from {{business_name}}. Please settle the outstanding balance as soon as possible. Thank you.",
  },
  custom: {
    subject: "Payment notice regarding Invoice {{invoice_number}}",
    body: "Hello {{customer_name}}, regarding invoice {{invoice_number}} from {{business_name}}: outstanding balance is {{outstanding_amount}}. Thank you.",
  },
};

export function buildTemplateVariables(input: {
  sellerDisplayName: string;
  buyerDisplayName: string;
  buyerContactName?: string | null;
  invoiceReference: string;
  invoiceDate: string;
  dueOn?: string | null;
  totalMinor: string;
  paidMinor: string;
  outstandingMinor: string;
  currencyCode?: string;
  invoiceLink?: string | null;
}): TemplateVariables {
  const currency = input.currencyCode || "INR";
  const formattedInvoiceDate = formatDate(input.invoiceDate);
  const formattedDueDate = input.dueOn ? formatDate(input.dueOn) : "Upon receipt";

  return {
    business_name: input.sellerDisplayName,
    customer_name: input.buyerContactName || input.buyerDisplayName,
    invoice_number: input.invoiceReference,
    invoice_date: formattedInvoiceDate,
    due_date: formattedDueDate,
    invoice_total: formatPaise(input.totalMinor),
    amount_paid: formatPaise(input.paidMinor),
    outstanding_amount: formatPaise(input.outstandingMinor),
    currency,
    invoice_link: input.invoiceLink || "",
  };
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  } catch {
    return value;
  }
}

export function interpolateTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (key in variables) {
      const val = variables[key as keyof TemplateVariables];
      return val !== null && val !== undefined ? String(val) : "";
    }
    return "";
  });
}

export type RenderedMessage = {
  subject: string;
  body: string;
  htmlBody?: string;
};

export function renderReminderMessage(options: {
  channel: ReminderChannel;
  templateType: ReminderTemplateType;
  customMessage?: string | null;
  customSubject?: string | null;
  variables: TemplateVariables;
}): RenderedMessage {
  const defaultTemplate =
    DEFAULT_TEMPLATES[options.templateType] || DEFAULT_TEMPLATES.upcoming;

  const rawSubject = options.customSubject || defaultTemplate.subject;
  const rawBody = options.customMessage || defaultTemplate.body;

  const subject = interpolateTemplate(rawSubject, options.variables);
  let body = interpolateTemplate(rawBody, options.variables);

  if (options.variables.invoice_link && !body.includes(options.variables.invoice_link)) {
    if (options.channel === "whatsapp" || options.channel === "sms") {
      body += `\nView invoice: ${options.variables.invoice_link}`;
    }
  }

  if (options.channel === "email") {
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; rounded: 12px;">
        <h2 style="color: #0f4c3a; margin-top: 0;">Payment Reminder</h2>
        <p style="font-size: 16px;">${body.replace(/\n/g, "<br/>")}</p>
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 24px 0;">
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="color: #6b7280; padding: 4px 0;">Invoice Number:</td>
              <td style="font-weight: bold; text-align: right; padding: 4px 0;">${options.variables.invoice_number}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; padding: 4px 0;">Due Date:</td>
              <td style="font-weight: bold; text-align: right; padding: 4px 0;">${options.variables.due_date}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; padding: 4px 0;">Total Amount:</td>
              <td style="font-weight: bold; text-align: right; padding: 4px 0;">${options.variables.invoice_total}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; padding: 4px 0;">Outstanding Balance:</td>
              <td style="font-weight: bold; color: #b91c1c; text-align: right; padding: 4px 0;">${options.variables.outstanding_amount}</td>
            </tr>
          </table>
        </div>
        ${
          options.variables.invoice_link
            ? `<div style="text-align: center; margin-top: 24px;">
                <a href="${options.variables.invoice_link}" style="background-color: #0f4c3a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">View & Settle Invoice</a>
              </div>`
            : ""
        }
        <p style="margin-top: 32px; font-size: 12px; color: #9ca3af; text-align: center;">Sent via Webameen on behalf of ${options.variables.business_name}</p>
      </div>
    `;

    return { subject, body, htmlBody };
  }

  return { subject, body };
}
