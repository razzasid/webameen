import { describe, expect, it } from "vitest";
import { type CustomerTimelineEvent, paginateCustomerTimeline } from "./history-model";

const events: CustomerTimelineEvent[] = [
  {
    id: "payment-2",
    kind: "payment",
    title: "Payment recorded",
    detail: "Invoice A",
    occurredAt: "2026-10-10T10:00:00.000Z",
    href: "/invoices/a",
    amountMinor: "100",
  },
  {
    id: "invoice-1",
    kind: "invoice",
    title: "Invoice issued",
    detail: "Invoice A",
    occurredAt: "2026-10-10T10:00:00.000Z",
    href: "/invoices/a",
  },
  {
    id: "quote-1",
    kind: "quotation",
    title: "Quotation shared",
    detail: "Quote A",
    occurredAt: "2026-10-09T10:00:00.000Z",
    href: "/quotations/a",
  },
];

describe("paginateCustomerTimeline", () => {
  it("orders equal timestamps deterministically and keeps pages stable", () => {
    const firstPage = paginateCustomerTimeline(events, 1, 2);
    expect(firstPage.events.map((event) => event.id)).toEqual(["invoice-1", "payment-2"]);
    expect(firstPage.total).toBe(3);
    expect(firstPage.totalPages).toBe(2);
    expect(paginateCustomerTimeline(events, 2, 2).events.map((event) => event.id)).toEqual([
      "quote-1",
    ]);
  });

  it("clamps invalid and out-of-range page requests", () => {
    expect(paginateCustomerTimeline(events, 0, 2).page).toBe(1);
    expect(paginateCustomerTimeline(events, 99, 2).page).toBe(2);
    expect(paginateCustomerTimeline([], 99).totalPages).toBe(1);
  });
});
