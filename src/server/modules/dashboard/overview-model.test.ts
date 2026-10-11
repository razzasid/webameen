import { describe, expect, it } from "vitest";
import { deriveDashboardOverview, sumMinorAmounts } from "./overview-model";

describe("dashboard overview model", () => {
  it("sums paise as exact integer strings", () => {
    expect(sumMinorAmounts(["9007199254740991", "10", "-1"])).toBe("9007199254741000");
  });

  it("derives counts and activity from current records without floating point", () => {
    const invoice = {
      id: "invoice-1",
      quotation_id: "quote-1",
      customer_id: "customer-1",
      source_version_id: "version-1",
      approved_response_id: "response-1",
      numbering_period: "2026",
      sequence_number: "1",
      reference: "INV-1",
      issued_at: "2026-10-10T10:00:00.000Z",
      invoice_date: "2026-10-10",
      due_on: "2026-10-09",
      buyer_display_name: "Northwind",
      total_minor: "10001",
      currency_code: "INR",
    };
    const summary = {
      invoice_id: "invoice-1",
      total_minor: "10001",
      currency_code: "INR",
      currency_exponent: 2,
      due_on: "2026-10-09",
      document_time_zone: "Asia/Kolkata",
      local_today: "2026-10-11",
      paid_minor: "2500",
      outstanding_minor: "7501",
      payment_status: "part_paid" as const,
      overdue: true,
      payments: [],
    };
    const result = deriveDashboardOverview({
      customerCount: 3,
      quotes: [
        {
          id: "quote-1",
          reference: "Q-1",
          customer_name: "Northwind",
          version_state: "shared",
          edit_sequence: 1,
          total_minor: "10001",
          updated_at: "2026-10-10T11:00:00.000Z",
        },
      ],
      invoices: [invoice],
      paymentSummaries: [summary],
      customers: [
        {
          id: "customer-1",
          display_name: "Northwind",
          created_at: "2026-10-10T09:00:00.000Z",
        },
      ],
    });

    expect(result).toMatchObject({
      customerCount: 3,
      quotationCount: 1,
      awaitingResponseCount: 1,
      invoiceCount: 1,
      paidInvoiceCount: 0,
      overdueInvoiceCount: 1,
      outstandingInvoiceCount: 1,
      receivedMinor: "2500",
      outstandingMinor: "7501",
    });
    expect(result.recentActivity.map(({ title }) => title)).toEqual([
      "Quotation shared",
      "Invoice issued",
      "Customer added",
    ]);
  });
});
