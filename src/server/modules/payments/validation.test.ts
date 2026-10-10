import { describe, expect, it } from "vitest";
import { isValidLocalDateTime, paymentFormSchema } from "./validation";

const validPayment = {
  requestKey: "3fd528f8-819e-4bf1-962f-031923800f11",
  amount: "1234.50",
  receivedAt: "2026-10-10T12:30",
  method: "UPI",
  externalReference: "  bank-ref-1  ",
  replacesPaymentId: "",
};

describe("manual payment validation", () => {
  it("converts rupees to exact paise and trims optional reference", () => {
    expect(paymentFormSchema.parse(validPayment)).toMatchObject({
      amountMinor: "123450",
      externalReference: "bank-ref-1",
      replacesPaymentId: null,
    });
  });

  it("rejects zero, excess precision, and values outside bigint", () => {
    expect(paymentFormSchema.safeParse({ ...validPayment, amount: "0" }).success).toBe(
      false,
    );
    expect(paymentFormSchema.safeParse({ ...validPayment, amount: "1.001" }).success).toBe(
      false,
    );
    expect(
      paymentFormSchema.safeParse({ ...validPayment, amount: "92233720368547758.08" })
        .success,
    ).toBe(false);
  });

  it("validates local date and time without interpreting it in the server timezone", () => {
    expect(isValidLocalDateTime("2024-02-29T23:59")).toBe(true);
    expect(isValidLocalDateTime("2025-02-29T12:00")).toBe(false);
    expect(isValidLocalDateTime("2026-01-01T24:00")).toBe(false);
    expect(isValidLocalDateTime("2026-01-01 12:00")).toBe(false);
  });
});
