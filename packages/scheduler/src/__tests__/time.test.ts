import { describe, it, expect } from "vitest";
import { parseHHMM, shiftStart, shiftEnd, overlaps, isWeekend } from "../time";

describe("parseHHMM", () => {
  it("parses a valid time", () => {
    expect(parseHHMM("08:30")).toEqual({ hours: 8, minutes: 30 });
  });

  it("defaults missing minutes to 0", () => {
    expect(parseHHMM("22")).toEqual({ hours: 22, minutes: 0 });
  });

  it("defaults garbage to 0", () => {
    expect(parseHHMM("")).toEqual({ hours: 0, minutes: 0 });
  });
});

describe("shiftStart / shiftEnd", () => {
  const day = new Date(2026, 3, 10); // 2026-04-10 local

  it("builds the correct start datetime on the same day", () => {
    const s = shiftStart(day, "08:00");
    expect(s.getHours()).toBe(8);
    expect(s.getDate()).toBe(10);
  });

  it("keeps a non-crossing end on the same day", () => {
    const e = shiftEnd(day, "16:00", false);
    expect(e.getHours()).toBe(16);
    expect(e.getDate()).toBe(10);
  });

  it("rolls a midnight-crossing end to the next day", () => {
    const e = shiftEnd(day, "08:00", true);
    expect(e.getHours()).toBe(8);
    expect(e.getDate()).toBe(11);
  });
});

describe("overlaps", () => {
  const d = (h: number) => new Date(2026, 3, 10, h);

  it("detects overlapping intervals", () => {
    expect(overlaps(d(8), d(16), d(12), d(20))).toBe(true);
  });

  it("treats touching intervals as non-overlapping", () => {
    expect(overlaps(d(8), d(16), d(16), d(20))).toBe(false);
  });

  it("returns false for disjoint intervals", () => {
    expect(overlaps(d(8), d(12), d(13), d(20))).toBe(false);
  });
});

describe("isWeekend", () => {
  it("is true for Saturday", () => {
    expect(isWeekend(new Date(2026, 3, 11))).toBe(true); // 2026-04-11 Sat
  });
  it("is true for Sunday", () => {
    expect(isWeekend(new Date(2026, 3, 12))).toBe(true); // 2026-04-12 Sun
  });
  it("is false for a weekday", () => {
    expect(isWeekend(new Date(2026, 3, 10))).toBe(false); // 2026-04-10 Fri
  });
});
