import { describe, expect, it } from "vitest";
import {
  buildTemplateVariables,
  DEFAULT_TEMPLATES,
  interpolateTemplate,
  renderReminderMessage,
} from "./templates";

describe("message template engine", () => {
  const sampleVariables = buildTemplateVariables({
    sellerDisplayName: "Acme Corp",
    buyerDisplayName: "Rajesh Sharma",
    buyerContactName: "Rajesh",
    invoiceReference: "INV-2026-0042",
    invoiceDate: "2026-11-01",
    dueOn: "2026-11-15",
    totalMinor: "2500000", // ₹25,000.00
    paidMinor: "1000000", // ₹10,000.00
    outstandingMinor: "1500000", // ₹15,000.00
    currencyCode: "INR",
    invoiceLink: "https://app.webameen.com/i/test-token",
  });

  it("builds correct INR currency formatted variables", () => {
    expect(sampleVariables.business_name).toBe("Acme Corp");
    expect(sampleVariables.customer_name).toBe("Rajesh");
    expect(sampleVariables.invoice_number).toBe("INV-2026-0042");
    expect(sampleVariables.invoice_total).toBe("₹25,000.00");
    expect(sampleVariables.amount_paid).toBe("₹10,000.00");
    expect(sampleVariables.outstanding_amount).toBe("₹15,000.00");
    expect(sampleVariables.due_date).toBe("15 Nov 2026");
    expect(sampleVariables.currency).toBe("INR");
  });

  it("interpolates upcoming reminder template without raw placeholders", () => {
    const rendered = interpolateTemplate(DEFAULT_TEMPLATES.upcoming.body, sampleVariables);

    expect(rendered).toContain("Rajesh");
    expect(rendered).toContain("INV-2026-0042");
    expect(rendered).toContain("₹15,000.00");
    expect(rendered).toContain("Acme Corp");
    expect(rendered).toContain("15 Nov 2026");
    expect(rendered).not.toContain("{{");
    expect(rendered).not.toContain("}}");
  });

  it("renders due_today reminder correctly", () => {
    const rendered = interpolateTemplate(DEFAULT_TEMPLATES.due_today.body, sampleVariables);
    expect(rendered).toContain("due today");
    expect(rendered).toContain("₹15,000.00");
  });

  it("renders overdue reminder correctly", () => {
    const rendered = interpolateTemplate(DEFAULT_TEMPLATES.overdue.body, sampleVariables);
    expect(rendered).toContain("is overdue");
    expect(rendered).toContain("₹15,000.00");
  });

  it("renders partial payment template correctly", () => {
    const rendered = interpolateTemplate(DEFAULT_TEMPLATES.part_paid.body, sampleVariables);
    expect(rendered).toContain("received your partial payment");
    expect(rendered).toContain("₹15,000.00");
  });

  it("renders email with subject line and HTML body", () => {
    const res = renderReminderMessage({
      channel: "email",
      templateType: "upcoming",
      variables: sampleVariables,
    });

    expect(res.subject).toContain("INV-2026-0042");
    expect(res.subject).toContain("Acme Corp");
    expect(res.body).toContain("friendly reminder");
    expect(res.htmlBody).toBeDefined();
    expect(res.htmlBody).toContain("₹15,000.00");
    expect(res.htmlBody).toContain("View & Settle Invoice");
  });

  it("renders WhatsApp message with invoice link appended", () => {
    const res = renderReminderMessage({
      channel: "whatsapp",
      templateType: "upcoming",
      variables: sampleVariables,
    });

    expect(res.body).toContain("https://app.webameen.com/i/test-token");
  });
});
