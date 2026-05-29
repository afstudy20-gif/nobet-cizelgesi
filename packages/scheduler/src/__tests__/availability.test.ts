import { describe, it, expect } from "vitest";
import {
  isPersonUnavailable,
  getAvailabilityMatch,
  AvailabilityRule,
} from "../availability";
import { shiftStart, shiftEnd } from "../time";

function rule(partial: Partial<AvailabilityRule>): AvailabilityRule {
  return {
    ruleType: "WEEKLY",
    availabilityType: "UNAVAILABLE",
    weekdays: [],
    startTime: null,
    endTime: null,
    validFrom: null,
    validTo: null,
    locationId: null,
    ...partial,
  };
}

const friday = new Date(2026, 3, 10); // 2026-04-10 (ISO weekday 5)
const reqStart = shiftStart(friday, "08:00");
const reqEnd = shiftEnd(friday, "16:00", false);

describe("isPersonUnavailable", () => {
  it("is unavailable for a full-day WEEKLY rule on the matching weekday", () => {
    const p = { availabilityRules: [rule({ ruleType: "WEEKLY", weekdays: [5] })] };
    expect(isPersonUnavailable(p, friday, reqStart, reqEnd)).toBe(true);
  });

  it("is available when the weekly rule targets another weekday", () => {
    const p = { availabilityRules: [rule({ ruleType: "WEEKLY", weekdays: [1] })] };
    expect(isPersonUnavailable(p, friday, reqStart, reqEnd)).toBe(false);
  });

  it("respects a time window that overlaps the shift", () => {
    const p = {
      availabilityRules: [
        rule({ ruleType: "WEEKLY", weekdays: [5], startTime: "12:00", endTime: "20:00" }),
      ],
    };
    expect(isPersonUnavailable(p, friday, reqStart, reqEnd)).toBe(true);
  });

  it("ignores a time window that does not overlap the shift", () => {
    const p = {
      availabilityRules: [
        rule({ ruleType: "WEEKLY", weekdays: [5], startTime: "17:00", endTime: "20:00" }),
      ],
    };
    expect(isPersonUnavailable(p, friday, reqStart, reqEnd)).toBe(false);
  });

  it("honours a DATE_RANGE rule", () => {
    const p = {
      availabilityRules: [
        rule({
          ruleType: "DATE_RANGE",
          validFrom: new Date(2026, 3, 8),
          validTo: new Date(2026, 3, 12),
        }),
      ],
    };
    expect(isPersonUnavailable(p, friday, reqStart, reqEnd)).toBe(true);
  });

  it("honours a ONE_DAY rule only on that day", () => {
    const p = {
      availabilityRules: [rule({ ruleType: "ONE_DAY", validFrom: friday })],
    };
    expect(isPersonUnavailable(p, friday, reqStart, reqEnd)).toBe(true);
    expect(
      isPersonUnavailable(p, new Date(2026, 3, 11), reqStart, reqEnd)
    ).toBe(false);
  });

  it("ignores AVAILABLE rules", () => {
    const p = {
      availabilityRules: [
        rule({ availabilityType: "AVAILABLE", ruleType: "WEEKLY", weekdays: [5] }),
      ],
    };
    expect(isPersonUnavailable(p, friday, reqStart, reqEnd)).toBe(false);
  });
});

describe("getAvailabilityMatch", () => {
  it("returns 'preferred' for a matching PREFERRED rule", () => {
    const p = {
      availabilityRules: [
        rule({ availabilityType: "PREFERRED", ruleType: "WEEKLY", weekdays: [5] }),
      ],
    };
    expect(getAvailabilityMatch(p, friday, reqStart, reqEnd)).toBe("preferred");
  });

  it("returns 'neutral' for a matching AVAILABLE rule", () => {
    const p = {
      availabilityRules: [
        rule({ availabilityType: "AVAILABLE", ruleType: "WEEKLY", weekdays: [5] }),
      ],
    };
    expect(getAvailabilityMatch(p, friday, reqStart, reqEnd)).toBe("neutral");
  });

  it("returns 'unpreferred' when no rule matches", () => {
    const p = { availabilityRules: [] };
    expect(getAvailabilityMatch(p, friday, reqStart, reqEnd)).toBe("unpreferred");
  });
});
