import { describe, expect, it } from "vitest";
import { parsePublicEnvironment } from "@/config/env";

describe("public environment configuration", () => {
  it("allows the navigation shell to run without a database project", () => {
    expect(
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    });
  });

  it("accepts a complete Supabase public configuration", () => {
    expect(
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
      }).NEXT_PUBLIC_SUPABASE_URL,
    ).toBe("https://example.supabase.co");
  });

  it("rejects a partial Supabase configuration", () => {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow("Set both Supabase public values or leave both blank.");
  });

  it("rejects an invalid project URL", () => {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
      }),
    ).toThrow();
  });
});
