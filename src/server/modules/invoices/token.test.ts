import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvoiceToken, hashInvoiceToken } from "./token";

describe("invoice bearer tokens", () => {
  it("creates an independent 32-byte secret and stores only its SHA-256 digest", () => {
    const first = createInvoiceToken();
    const second = createInvoiceToken();
    expect(first.token).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHashHex).not.toBe(first.token);
    expect(hashInvoiceToken(first.token)).toBe(first.tokenHashHex);
    expect(second.token).not.toBe(first.token);
  });

  it("rejects malformed values before a broker request", () => {
    expect(hashInvoiceToken("short")).toBeNull();
    expect(hashInvoiceToken("g".repeat(64))).toBeNull();
  });
});
