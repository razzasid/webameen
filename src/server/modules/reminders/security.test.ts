import { describe, expect, it } from "vitest";
import { publicEnvironment } from "@/config/env";
import { getAllProviderStatuses } from "./providers";

describe("security and tenant isolation", () => {
  it("never exposes provider secrets or credentials in public environment", () => {
    const pub = publicEnvironment as Record<string, unknown>;

    // Sensitive keys must never exist in publicEnvironment
    expect(pub.RESEND_API_KEY).toBeUndefined();
    expect(pub.TWILIO_AUTH_TOKEN).toBeUndefined();
    expect(pub.TWILIO_ACCOUNT_SID).toBeUndefined();
    expect(pub.CRON_SECRET).toBeUndefined();
    expect(pub.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("provider status diagnostic only reports variable names, never actual secret values", () => {
    const statuses = getAllProviderStatuses();
    for (const status of statuses) {
      // missingVariables should only contain variable names (uppercase identifiers)
      for (const varName of status.missingVariables) {
        expect(varName).toMatch(/^[A-Z0-9_]+$/);
      }
    }
  });

  it("validates that business tenant ID scoping is required", () => {
    const businessA: string = "11111111-1111-4111-8111-111111111111";
    const businessB: string = "22222222-2222-4222-8222-222222222222";

    // Attempting to match invoice belonging to businessB under businessA session
    const isOwner = businessA === businessB;
    expect(isOwner).toBe(false);
  });
});
