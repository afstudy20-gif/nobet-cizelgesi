import { describe, it, expect } from "vitest";
import {
  parseCalendarDate,
  calendarDateKey,
  normalizeCalendarDate,
  eachCalendarDayInRange,
} from "../calendar";

describe("parseCalendarDate / calendarDateKey", () => {
  it("round-trips YYYY-MM-DD through UTC noon", () => {
    const d = parseCalendarDate("2026-06-01");
    expect(calendarDateKey(d)).toBe("2026-06-01");
    expect(d.toISOString()).toBe("2026-06-01T12:00:00.000Z");
  });

  it("does not shift day when serialized to ISO", () => {
    const d = parseCalendarDate("2026-06-01");
    expect(d.toISOString().split("T")[0]).toBe("2026-06-01");
  });
});

describe("normalizeCalendarDate", () => {
  it("normalizes local-midnight drift to UTC noon same day", () => {
    // Simulates a date stored after startOfDay in UTC+3
    const drifted = new Date("2026-05-31T21:00:00.000Z");
    expect(calendarDateKey(normalizeCalendarDate(drifted))).toBe("2026-05-31");
  });
});

describe("eachCalendarDayInRange", () => {
  it("returns inclusive calendar days", () => {
    const start = parseCalendarDate("2026-06-01");
    const end = parseCalendarDate("2026-06-03");
    const days = eachCalendarDayInRange(start, end);
    expect(days.map(calendarDateKey)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
  });
});