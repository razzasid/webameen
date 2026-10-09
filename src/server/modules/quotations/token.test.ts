import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createQuotationToken, hashQuotationToken } from "./token";

describe("quotation bearer tokens", () => {
  it("creates a 32-byte token and only returns its SHA-256 digest for lookup", () => {
    const first = createQuotationToken();
    const second = createQuotationToken();
    expect(first.token).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHashHex).not.toBe(first.token);
    expect(hashQuotationToken(first.token)).toBe(first.tokenHashHex);
    expect(second.token).not.toBe(first.token);
  });

  it("rejects malformed tokens before a broker lookup", () => {
    expect(hashQuotationToken("short")).toBeNull();
    expect(hashQuotationToken("g".repeat(64))).toBeNull();
  });
});
