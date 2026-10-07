import { describe, expect, it } from "vitest";
import { customerSchema } from "./validation";

const valid = {
  displayName: " Acme Supplies ",
  contactName: "",
  email: "",
  phone: "9876543210",
  billingAddress: "",
  stateCode: "29",
  gstinApplicable: "no",
  gstin: "",
};

describe("customer validation", () => {
  it("requires a customer name and Indian state", () => {
    expect(customerSchema.safeParse({ ...valid, displayName: " " }).success).toBe(false);
    expect(customerSchema.safeParse({ ...valid, stateCode: "" }).success).toBe(false);
  });

  it("requires and normalizes a basic GSTIN only when applicable", () => {
    expect(customerSchema.safeParse({ ...valid, gstinApplicable: "yes" }).success).toBe(
      false,
    );
    expect(
      customerSchema.safeParse({ ...valid, gstinApplicable: "yes", gstin: "invalid" })
        .success,
    ).toBe(false);
    const parsed = customerSchema.parse({
      ...valid,
      gstinApplicable: "yes",
      gstin: "27abcde1234f1z5",
    });
    expect(parsed.gstin).toBe("27ABCDE1234F1Z5");
    expect(parsed.gstinApplicable).toBe(true);
  });

  it("does not reject a GSTIN state-prefix mismatch", () => {
    expect(
      customerSchema.parse({ ...valid, gstinApplicable: "yes", gstin: "27ABCDE1234F1Z5" })
        .stateCode,
    ).toBe("29");
  });

  it("validates optional email without requiring contact fields", () => {
    expect(customerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(
      false,
    );
    const parsed = customerSchema.parse(valid);
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBe("9876543210");
    expect(parsed.gstin).toBeNull();
    expect(parsed.email).toBeNull();
    expect(customerSchema.parse({ ...valid, email: " owner@example.com " }).email).toBe(
      "owner@example.com",
    );
  });
});
