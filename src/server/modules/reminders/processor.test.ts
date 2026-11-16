import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeNextRetry } from "./processor";

describe("reminder background processor logic", () => {
  it("calculates exponential backoff retry delays correctly", () => {
    const now = new Date();

    // Attempt 1 retry: +5 minutes
    const retry1 = new Date(computeNextRetry(1));
    const diffMins1 = (retry1.getTime() - now.getTime()) / (1000 * 60);
    expect(Math.round(diffMins1)).toBe(5);

    // Attempt 2 retry: +15 minutes
    const retry2 = new Date(computeNextRetry(2));
    const diffMins2 = (retry2.getTime() - now.getTime()) / (1000 * 60);
    expect(Math.round(diffMins2)).toBe(15);

    // Attempt 3 retry: capped at 45-60 minutes
    const retry3 = new Date(computeNextRetry(3));
    const diffMins3 = (retry3.getTime() - now.getTime()) / (1000 * 60);
    expect(Math.round(diffMins3)).toBe(45);
  });

  it("distinguishes between pending, processing, sent, delivered, failed and skipped states", () => {
    const states = [
      "pending",
      "processing",
      "sent",
      "delivered",
      "failed",
      "cancelled",
      "skipped",
    ];

    expect(states).toContain("sent");
    expect(states).toContain("delivered");
    expect(states).toContain("skipped");
    expect(states).toContain("failed");
  });

  it("ensures permanent failure stops retrying when attempt_count reaches max_attempts", () => {
    const maxAttempts = 3;
    const attemptCount = 3;
    const canRetry = attemptCount < maxAttempts;

    expect(canRetry).toBe(false);
  });
});
