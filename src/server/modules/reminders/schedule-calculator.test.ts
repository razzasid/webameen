import { describe, expect, it } from "vitest";
import {
  addDays,
  calculateReminderOccurrences,
  inferMessageType,
  localDateToUtcIso,
} from "./schedule-calculator";

describe("schedule calculator", () => {
  it("adds and subtracts days correctly across month boundaries", () => {
    expect(addDays("2026-11-10", 3)).toBe("2026-11-13");
    expect(addDays("2026-11-10", -3)).toBe("2026-11-07");
    expect(addDays("2026-11-29", 3)).toBe("2026-12-02");
  });

  it("converts local date at 9 AM IST to UTC", () => {
    // 09:00:00 IST (+05:30) is 03:30:00 UTC
    const utcIso = localDateToUtcIso("2026-11-10", "09:00:00", "Asia/Kolkata");
    expect(utcIso).toBe("2026-11-10T03:30:00.000Z");
  });

  it("infers message type based on invoice due date", () => {
    expect(inferMessageType("2026-11-07", "2026-11-10")).toBe("upcoming");
    expect(inferMessageType("2026-11-10", "2026-11-10")).toBe("due_today");
    expect(inferMessageType("2026-11-13", "2026-11-10")).toBe("overdue");
  });

  it("generates occurrences for relative events (-3 days, 0 days, +3 days, +7 days)", () => {
    const occurrences = calculateReminderOccurrences({
      channels: ["whatsapp", "email"],
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      dueOn: "2026-11-10",
      timingConfig: {
        relativeEvents: [
          { offsetDays: -3, messageType: "upcoming" },
          { offsetDays: 0, messageType: "due_today" },
          { offsetDays: 3, messageType: "overdue" },
          { offsetDays: 7, messageType: "follow_up" },
        ],
        customDates: [],
        repeatFrequency: "none",
      },
    });

    // 4 relative events * 2 channels = 8 occurrences
    expect(occurrences).toHaveLength(8);

    const dates = occurrences.map((o) => o.scheduledDate);
    expect(dates).toContain("2026-11-07");
    expect(dates).toContain("2026-11-10");
    expect(dates).toContain("2026-11-13");
    expect(dates).toContain("2026-11-17");
  });

  it("prevents duplicate occurrences for the same schedule, date, and channel", () => {
    const occurrences = calculateReminderOccurrences({
      channels: ["whatsapp"],
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      dueOn: "2026-11-10",
      timingConfig: {
        relativeEvents: [
          { offsetDays: 0, messageType: "due_today" },
          { offsetDays: 0, messageType: "due_today" }, // duplicate
        ],
        customDates: [
          { date: "2026-11-10", messageType: "due_today" }, // duplicate date
        ],
        repeatFrequency: "none",
      },
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.scheduledDate).toBe("2026-11-10");
  });

  it("respects start date and end date bounds", () => {
    const occurrences = calculateReminderOccurrences({
      channels: ["sms"],
      startDate: "2026-11-08",
      endDate: "2026-11-15",
      dueOn: "2026-11-10",
      timingConfig: {
        relativeEvents: [
          { offsetDays: -7, messageType: "upcoming" }, // 2026-11-03 (before startDate)
          { offsetDays: -1, messageType: "upcoming" }, // 2026-11-09 (inside)
          { offsetDays: 0, messageType: "due_today" }, // 2026-11-10 (inside)
          { offsetDays: 7, messageType: "overdue" }, // 2026-11-17 (after endDate)
        ],
        customDates: [],
        repeatFrequency: "none",
      },
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o) => o.scheduledDate)).toEqual(["2026-11-09", "2026-11-10"]);
  });

  it("supports repeat frequency intervals (every 3 days)", () => {
    const occurrences = calculateReminderOccurrences({
      channels: ["email"],
      startDate: "2026-11-01",
      endDate: "2026-11-10",
      timingConfig: {
        relativeEvents: [],
        customDates: [],
        repeatFrequency: "every_3_days",
      },
    });

    // Dates: 01, 04, 07, 10
    expect(occurrences).toHaveLength(4);
    expect(occurrences.map((o) => o.scheduledDate)).toEqual([
      "2026-11-01",
      "2026-11-04",
      "2026-11-07",
      "2026-11-10",
    ]);
  });
});
