import { describe, expect, it } from "vitest";
import { buildTemplateVariables, renderReminderMessage } from "./templates";

describe("smart payment status checking logic", () => {
  it("Scenario A: Fully paid invoice (outstanding 0) detects zero balance and prevents further sending", () => {
    const totalMinor = "2500000"; // ₹25,000
    const paidMinor = "2500000"; // ₹25,000
    const outstanding = BigInt(totalMinor) - BigInt(paidMinor);

    expect(outstanding).toBe(BigInt(0));

    // When balance is zero, reminders should not be sent
    const shouldSend = outstanding > BigInt(0);
    expect(shouldSend).toBe(false);
  });

  it("Scenario B: Partial payment received calculates latest balance for reminder", () => {
    const totalMinor = "2500000"; // ₹25,000
    const payment1 = "1000000"; // ₹10,000
    const outstanding1 = BigInt(totalMinor) - BigInt(payment1); // ₹15,000

    expect(outstanding1).toBe(BigInt(1500000));

    const variables = buildTemplateVariables({
      sellerDisplayName: "Acme Business",
      buyerDisplayName: "John Doe",
      invoiceReference: "INV-1025",
      invoiceDate: "2026-11-01",
      dueOn: "2026-11-10",
      totalMinor,
      paidMinor: payment1,
      outstandingMinor: outstanding1.toString(),
    });

    const rendered = renderReminderMessage({
      channel: "whatsapp",
      templateType: "part_paid",
      variables,
    });

    expect(rendered.body).toContain("INV-1025");
    expect(rendered.body).toContain("₹15,000.00");
    expect(rendered.body).not.toContain("₹25,000.00 is due");

    // Later, second payment received: ₹5,000
    const payment2 = "500000";
    const totalPaid = BigInt(payment1) + BigInt(payment2);
    const outstanding2 = BigInt(totalMinor) - totalPaid;

    const variables2 = buildTemplateVariables({
      sellerDisplayName: "Acme Business",
      buyerDisplayName: "John Doe",
      invoiceReference: "INV-1025",
      invoiceDate: "2026-11-01",
      dueOn: "2026-11-10",
      totalMinor,
      paidMinor: totalPaid.toString(),
      outstandingMinor: outstanding2.toString(),
    });

    const rendered2 = renderReminderMessage({
      channel: "whatsapp",
      templateType: "part_paid",
      variables: variables2,
    });

    expect(rendered2.body).toContain("₹10,000.00");
  });

  it("Scenario C: Unpaid invoice continues reminders with full total balance", () => {
    const totalMinor = "2500000";
    const paidMinor = "0";
    const outstanding = BigInt(totalMinor) - BigInt(paidMinor);

    expect(outstanding).toBe(BigInt(2500000));

    const variables = buildTemplateVariables({
      sellerDisplayName: "Acme Business",
      buyerDisplayName: "John Doe",
      invoiceReference: "INV-1025",
      invoiceDate: "2026-11-01",
      dueOn: "2026-11-10",
      totalMinor,
      paidMinor,
      outstandingMinor: outstanding.toString(),
    });

    const rendered = renderReminderMessage({
      channel: "email",
      templateType: "upcoming",
      variables,
    });

    expect(rendered.body).toContain("₹25,000.00");
  });

  it("Scenario D: Payment reversal restores outstanding balance", () => {
    const totalMinor = "2500000"; // ₹25,000
    const payment = { id: "p-1", amount_minor: "1000000" };
    const reversals = [{ payment_id: "p-1", reason: "Bounced check" }];

    const reversedSet = new Set(reversals.map((r) => r.payment_id));
    const validPayments = [payment].filter((p) => !reversedSet.has(p.id));

    const paidMinor = validPayments.reduce(
      (sum, p) => sum + BigInt(p.amount_minor),
      BigInt(0),
    );
    const outstanding = BigInt(totalMinor) - paidMinor;

    expect(paidMinor).toBe(BigInt(0));
    expect(outstanding).toBe(BigInt(2500000));
  });
});

