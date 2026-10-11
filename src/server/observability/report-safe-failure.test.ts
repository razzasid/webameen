import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reportSafeFailure } from "./report-safe-failure";

describe("safe operational errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a correlation ID and error type without the underlying message", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = reportSafeFailure(
      "customer.save",
      new Error("customer@example.com private backend detail"),
      "We couldn't save this customer.",
    );

    expect(message).toMatch(/^We couldn't save this customer\. Reference: [0-9a-f-]{36}$/);
    const logged = String(output.mock.calls[0]?.[0]);
    expect(logged).toContain("customer.save");
    expect(logged).toContain("Error");
    expect(logged).toContain("referenceId");
    expect(logged).not.toContain("customer@example.com");
    expect(logged).not.toContain("private backend detail");
  });
});
