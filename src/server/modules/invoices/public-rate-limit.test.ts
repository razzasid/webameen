import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { allowPublicInvoiceRequest } from "./public-rate-limit";

describe("public invoice request limits", () => {
  it("limits document reads and PDF work separately, then resets the minute window", () => {
    const client = `invoice-limit-${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      expect(allowPublicInvoiceRequest(client, "read", 1_000)).toBe(true);
    }
    expect(allowPublicInvoiceRequest(client, "read", 1_000)).toBe(false);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(allowPublicInvoiceRequest(client, "pdf", 1_000)).toBe(true);
    }
    expect(allowPublicInvoiceRequest(client, "pdf", 1_000)).toBe(false);
    expect(allowPublicInvoiceRequest(client, "read", 62_000)).toBe(true);
  });
});
