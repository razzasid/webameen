import type { ReminderChannel, ReminderTemplateType, ReminderTimingConfig } from "./types";

export type CalculatedOccurrence = {
  channel: ReminderChannel;
  scheduledDate: string; // YYYY-MM-DD
  scheduledFor: string; // UTC ISO string
  messageType: ReminderTemplateType;
};

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localDateToUtcIso(
  dateStr: string,
  timeStr: string = "09:00:00",
  timeZone: string = "Asia/Kolkata",
): string {
  // Determine UTC offset for the given timezone on that date
  const _testIso = `${dateStr}T${timeStr}Z`;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const targetDate = new Date(`${dateStr}T${timeStr}`);
  // Calculate offset using the difference between local formatted and UTC
  try {
    const parts = formatter.formatToParts(targetDate);
    const mapped: Record<string, string> = {};
    for (const p of parts) mapped[p.type] = p.value;
    const tzYear = Number(mapped.year);
    const tzMonth = Number(mapped.month);
    const tzDay = Number(mapped.day);
    const tzHour = Number(mapped.hour);
    const tzMinute = Number(mapped.minute);
    const tzSecond = Number(mapped.second);

    const asTzUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
    const asTargetUtc = targetDate.getTime();
    const offsetMs = asTzUtc - asTargetUtc;

    const [reqHour, reqMinute, reqSecond] = timeStr.split(":").map(Number);
    const localUtcMs = Date.UTC(
      Number(dateStr.slice(0, 4)),
      Number(dateStr.slice(5, 7)) - 1,
      Number(dateStr.slice(8, 10)),
      reqHour,
      reqMinute,
      reqSecond,
    );

    return new Date(localUtcMs - offsetMs).toISOString();
  } catch {
    // Fallback for Asia/Kolkata (+05:30)
    const [_h, _m] = timeStr.split(":").map(Number);
    const dt = new Date(`${dateStr}T${timeStr}Z`);
    dt.setUTCMinutes(dt.getUTCMinutes() - 330);
    return dt.toISOString();
  }
}

export function inferMessageType(
  dateStr: string,
  dueOn?: string | null,
): ReminderTemplateType {
  if (!dueOn) return "upcoming";
  if (dateStr < dueOn) return "upcoming";
  if (dateStr === dueOn) return "due_today";
  return "overdue";
}

export function calculateReminderOccurrences(options: {
  channels: ReminderChannel[];
  startDate: string;
  endDate?: string | null;
  dueOn?: string | null;
  timingConfig: ReminderTimingConfig;
  timezone?: string;
  now?: Date;
}): CalculatedOccurrence[] {
  const tz = options.timezone || "Asia/Kolkata";
  const now = options.now || new Date();
  const _occurrences: CalculatedOccurrence[] = [];

  // Map to enforce uniqueness per (channel + scheduledDate)
  const uniqueKeyMap = new Map<string, CalculatedOccurrence>();

  const addCandidate = (
    channel: ReminderChannel,
    dateStr: string,
    messageType: ReminderTemplateType,
  ) => {
    // Validate boundaries
    if (dateStr < options.startDate) return;
    if (options.endDate && dateStr > options.endDate) return;

    const key = `${channel}:${dateStr}`;
    if (uniqueKeyMap.has(key)) return;

    let scheduledFor = localDateToUtcIso(dateStr, "09:00:00", tz);
    // If the scheduled time on today has already elapsed, schedule for current moment
    if (new Date(scheduledFor).getTime() < now.getTime()) {
      const todayStr = now.toISOString().slice(0, 10);
      if (dateStr === todayStr) {
        scheduledFor = now.toISOString();
      }
    }

    const candidate: CalculatedOccurrence = {
      channel,
      scheduledDate: dateStr,
      scheduledFor,
      messageType,
    };

    uniqueKeyMap.set(key, candidate);
  };

  for (const channel of options.channels) {
    // 1. Process relative events
    if (options.dueOn && options.timingConfig.relativeEvents?.length) {
      for (const event of options.timingConfig.relativeEvents) {
        const dateStr = addDays(options.dueOn, event.offsetDays);
        addCandidate(channel, dateStr, event.messageType);
      }
    }

    // 2. Process custom dates
    if (options.timingConfig.customDates?.length) {
      for (const custom of options.timingConfig.customDates) {
        addCandidate(channel, custom.date, custom.messageType);
      }
    }

    // 3. Process repeat frequency
    const freq = options.timingConfig.repeatFrequency;
    if (freq && freq !== "none") {
      let intervalDays = 1;
      if (freq === "every_3_days") intervalDays = 3;
      if (freq === "weekly") intervalDays = 7;
      if (freq === "custom" && options.timingConfig.customIntervalDays) {
        intervalDays = options.timingConfig.customIntervalDays;
      }

      // If no end date given, default to 60 days horizon to prevent infinite loops
      const maxHorizon = addDays(options.startDate, 60);
      const effectiveEndDate = options.endDate
        ? options.endDate < maxHorizon
          ? options.endDate
          : maxHorizon
        : maxHorizon;

      let currentDate = options.startDate;
      while (currentDate <= effectiveEndDate) {
        const msgType = inferMessageType(currentDate, options.dueOn);
        addCandidate(channel, currentDate, msgType);
        currentDate = addDays(currentDate, intervalDays);
      }
    }
  }

  // Sort by scheduledFor ASC
  return Array.from(uniqueKeyMap.values()).sort(
    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
  );
}
