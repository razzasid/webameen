import { describe, expect, it } from "vitest";
import {
  loginCredentialsSchema,
  safeLoginError,
  safeSignupError,
  signupCredentialsSchema,
} from "@/server/modules/identity/credentials";

describe("identity credentials", () => {
  it("normalizes email and preserves the password exactly", () => {
    expect(
      loginCredentialsSchema.parse({ email: "  OWNER@Example.COM ", password: " pass " }),
    ).toEqual({ email: "owner@example.com", password: " pass " });
  });

  it("rejects malformed email and missing password", () => {
    expect(
      loginCredentialsSchema.safeParse({ email: "not-an-email", password: "x" }).success,
    ).toBe(false);
    expect(
      loginCredentialsSchema.safeParse({ email: "owner@example.com", password: "" })
        .success,
    ).toBe(false);
  });

  it("matches the provider's minimum password length for sign up", () => {
    expect(
      signupCredentialsSchema.safeParse({ email: "owner@example.com", password: "12345" })
        .success,
    ).toBe(false);
    expect(
      signupCredentialsSchema.safeParse({ email: "owner@example.com", password: "123456" })
        .success,
    ).toBe(true);
  });

  it("returns safe login and signup errors without backend details", () => {
    expect(safeLoginError("email_not_confirmed")).toMatch(/confirm your email/i);
    expect(safeLoginError("unexpected_database_detail")).not.toContain(
      "unexpected_database_detail",
    );
    expect(safeSignupError()).not.toMatch(/postgres|database|stack/i);
  });
});
