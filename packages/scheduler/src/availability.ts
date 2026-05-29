import { getISODay, addDays, startOfDay, isWithinInterval } from "date-fns";
import { overlaps, shiftStart } from "./time";

export type AvailabilityRule = {
  ruleType: string;
  availabilityType: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  locationId: string | null;
};

export type AvailabilityHolder = {
  availabilityRules: AvailabilityRule[];
};

/** Does an availability rule cover the given calendar day? */
function ruleCoversDate(rule: AvailabilityRule, shiftDate: Date): boolean {
  const isoWeekday = getISODay(shiftDate);
  const dayStart = startOfDay(shiftDate);

  if (rule.ruleType === "WEEKLY") {
    return rule.weekdays.includes(isoWeekday);
  }
  if (rule.ruleType === "ONE_DAY" || rule.ruleType === "SPECIFIC_DATE") {
    return (
      rule.validFrom != null &&
      startOfDay(rule.validFrom).getTime() === dayStart.getTime()
    );
  }
  if (rule.ruleType === "DATE_RANGE") {
    return (
      rule.validFrom != null &&
      rule.validTo != null &&
      isWithinInterval(dayStart, {
        start: startOfDay(rule.validFrom),
        end: startOfDay(rule.validTo),
      })
    );
  }
  return false;
}

/** Build a rule's effective time window on a day, handling midnight crossing. */
function ruleWindow(shiftDate: Date, startTime: string, endTime: string) {
  const start = shiftStart(shiftDate, startTime);
  const end = shiftStart(shiftDate, endTime);
  const effectiveEnd = end <= start ? addDays(end, 1) : end;
  return { start, effectiveEnd };
}

/**
 * True if the person is UNAVAILABLE for the given shift window.
 * Any UNAVAILABLE rule covering this date+time makes them unavailable.
 */
export function isPersonUnavailable(
  person: AvailabilityHolder,
  shiftDate: Date,
  reqStart: Date,
  reqEnd: Date
): boolean {
  for (const rule of person.availabilityRules) {
    if (rule.availabilityType !== "UNAVAILABLE") continue;
    if (!ruleCoversDate(rule, shiftDate)) continue;

    // No time range → full day unavailable
    if (rule.startTime == null || rule.endTime == null) return true;

    const { start, effectiveEnd } = ruleWindow(shiftDate, rule.startTime, rule.endTime);
    if (overlaps(reqStart, reqEnd, start, effectiveEnd)) return true;
  }
  return false;
}

/**
 * Classify how a person's PREFERRED/AVAILABLE rules match a shift window.
 * "preferred" → explicit preference; "neutral" → available; "unpreferred" → no match.
 */
export function getAvailabilityMatch(
  person: AvailabilityHolder,
  shiftDate: Date,
  reqStart: Date,
  reqEnd: Date
): "preferred" | "unpreferred" | "neutral" {
  for (const rule of person.availabilityRules) {
    if (rule.availabilityType !== "PREFERRED" && rule.availabilityType !== "AVAILABLE") {
      continue;
    }
    if (!ruleCoversDate(rule, shiftDate)) continue;

    if (rule.startTime != null && rule.endTime != null) {
      const { start, effectiveEnd } = ruleWindow(shiftDate, rule.startTime, rule.endTime);
      if (!overlaps(reqStart, reqEnd, start, effectiveEnd)) continue;
    }

    return rule.availabilityType === "PREFERRED" ? "preferred" : "neutral";
  }
  return "unpreferred";
}
