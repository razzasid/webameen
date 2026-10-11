import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { allowPublicCatalogRequest } from "./public-rate-limit";

describe("public catalog read limit", () => {
  it("limits one visitor per minute and resets after the window", () => {
    const visitor = `catalog-limit-${crypto.randomUUID()}`;
    const start = 1_000_000;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect(allowPublicCatalogRequest(visitor, start + attempt)).toBe(true);
    }
    expect(allowPublicCatalogRequest(visitor, start + 59_000)).toBe(false);
    expect(allowPublicCatalogRequest(visitor, start + 60_000)).toBe(true);
  });
});
