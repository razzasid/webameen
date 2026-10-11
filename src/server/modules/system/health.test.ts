import { describe, expect, it } from "vitest";
import { getSystemHealth } from "./health";

describe("system readiness", () => {
  it("is ready only when both Supabase public settings are configured", () => {
    expect(
      getSystemHealth({
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      }),
    ).toEqual({ status: "not_ready", databaseConfigured: false });

    expect(
      getSystemHealth({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
      }),
    ).toEqual({ status: "ready", databaseConfigured: true });
  });
});
