import { describe, expect, it } from "vitest";
import {
  type BusinessProfile,
  businessSettingsSchema,
  documentReadiness,
  profileToValues,
} from "./settings-validation";

const profile: BusinessProfile = {
  id: "business",
  display_name: "Example",
  contact_email: null,
  contact_phone: null,
  postal_address: "Address",
  country_code: "IN",
  currency_code: "INR",
  state_code: "29",
  gst_registered: false,
  gstin: null,
  default_terms: null,
  time_zone: "Asia/Kolkata",
  bank_name: null,
  bank_account_name: null,
  bank_account_number: null,
  bank_ifsc: null,
  upi_id: null,
  payment_instructions: null,
};

describe("business document settings", () => {
  it("normalizes optional blanks, text and GSTIN", () => {
    const parsed = businessSettingsSchema.parse({
      ...profileToValues(profile),
      displayName: "  New name  ",
      contactEmail: "  ",
      bankName: "  ",
      gstRegistered: "yes",
      gstin: " 29abcde1234f1z5 ",
    });
    expect(parsed.displayName).toBe("New name");
    expect(parsed.contactEmail).toBeNull();
    expect(parsed.bankName).toBeNull();
    expect(parsed.gstin).toBe("29ABCDE1234F1Z5");
  });

  it("requires conditional GSTIN and rejects malformed state/email", () => {
    const base = profileToValues(profile);
    const result = businessSettingsSchema.safeParse({
      ...base,
      gstRegistered: "yes",
      gstin: "",
      stateCode: "99",
      contactEmail: "wrong",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["gstin", "stateCode", "contactEmail"]),
      );
  });

  it("reports missing seller setup and rates without requiring optional bank details", () => {
    const readiness = documentReadiness(
      { ...profile, postal_address: null, gst_registered: null, state_code: null },
      0,
    );
    expect(readiness.missing).toEqual(
      expect.arrayContaining([
        "Business address",
        "State or territory",
        "GST registration declaration",
        "Selectable GST rate configuration for taxable documents (operator)",
      ]),
    );
    expect(readiness.missing).not.toContain("Bank name");
    expect(readiness.timeZone).toBe("Asia/Kolkata");
  });

  it("shows GSTIN prefix mismatch as review warning", () => {
    const readiness = documentReadiness(
      { ...profile, gst_registered: true, gstin: "27ABCDE1234F1Z5" },
      1,
    );
    expect(readiness.gstinWarning).toContain("Please review");
    expect(readiness.missing).toEqual([]);
  });
});
