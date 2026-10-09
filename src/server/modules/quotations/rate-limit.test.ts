import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { allowPublicQuotationRequest } from "./rate-limit";

describe("public quotation rate limit", () => {
  it("limits responses more strictly than reads and resets the time window", () => {
    const client = `rate-test-${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(allowPublicQuotationRequest(client, "respond", 1_000)).toBe(true);
    }
    expect(allowPublicQuotationRequest(client, "respond", 1_000)).toBe(false);
    expect(allowPublicQuotationRequest(client, "respond", 62_000)).toBe(true);
  });
});
