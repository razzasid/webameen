import { describe, expect, it } from "vitest";
import { businessSetupSchema, gstinStateWarning } from "./validation";

const valid = {
  displayName: "  Example Business  ",
  contactEmail: " owner@example.com ",
  contactPhone: " 9876543210 ",
  postalAddress: "  Example address ",
  stateCode: "29",
  gstRegistered: "no",
  gstin: "",
};

describe("business setup validation", () => {
  it("requires initial contact details, state and GST declaration", () => {
    const result = businessSetupSchema.safeParse({
      ...valid,
      displayName: "",
      stateCode: "",
      gstRegistered: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["displayName", "stateCode", "gstRegistered"]),
      );
    }
  });

  it("does not require GSTIN when the business is not registered", () => {
    const result = businessSetupSchema.parse(valid);
    expect(result.displayName).toBe("Example Business");
    expect(result.gstRegistered).toBe(false);
    expect(result.gstin).toBeNull();
  });

  it("requires basic GSTIN shape when registered and normalizes supplied input", () => {
    expect(businessSetupSchema.safeParse({ ...valid, gstRegistered: "yes" }).success).toBe(
      false,
    );
    expect(
      businessSetupSchema.safeParse({ ...valid, gstRegistered: "yes", gstin: "bad" })
        .success,
    ).toBe(false);
    const result = businessSetupSchema.parse({
      ...valid,
      gstRegistered: "yes",
      gstin: " 29abcde1234f1z5 ",
    });
    expect(result.gstin).toBe("29ABCDE1234F1Z5");
  });

  it("surfaces a state-prefix mismatch as a warning", () => {
    expect(gstinStateWarning("27ABCDE1234F1Z5", "29")).toContain("Please review");
    expect(gstinStateWarning("29ABCDE1234F1Z5", "29")).toBeNull();
  });
});
