import { getISODay, isWithinInterval } from "date-fns";
import type { AvailabilityHolder } from "./availability";
import { isPersonUnavailable } from "./availability";
import { calendarDateKey, calendarDayLocal } from "./calendar";
import { overlaps, shiftEnd, shiftStart, isWeekend } from "./time";

export type WorkRule = {
  maxAssignmentsPerPeriod: number | null;
  maxNightAssignmentsPerPeriod: number | null;
  maxWeekendAssignmentsPerPeriod: number | null;
  minRestHoursBetweenAssignments: number;
  allowBackToBackNightShift: boolean;
} | null;

export type LocationRule = {
  locationId: string;
  allowed: boolean;
};

export type AssignabilityPerson = AvailabilityHolder & {
  id: string;
  isActive: boolean;
  workRule: WorkRule;
  locationRules: LocationRule[];
};

export type ShiftContext = {
  date: Date;
  locationId: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isNightShift: boolean;
};

export type TrackedAssignment = {
  id?: string;
  startDateTime: Date;
  endDateTime: Date;
  isNightShift: boolean;
  locationId: string;
  date: Date;
};

export type AssignabilityResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function buildShiftWindow(shift: ShiftContext): {
  reqStart: Date;
  reqEnd: Date;
  shiftDate: Date;
} {
  const shiftDate = calendarDayLocal(shift.date);
  const reqStart = shiftStart(shiftDate, shift.startTime);
  const reqEnd = shiftEnd(shiftDate, shift.endTime, shift.crossesMidnight);
  return { reqStart, reqEnd, shiftDate };
}

export function validatePersonAssignment(
  person: AssignabilityPerson,
  shift: ShiftContext,
  existingAssignments: TrackedAssignment[],
  options?: { excludeAssignmentId?: string }
): AssignabilityResult {
  const { reqStart, reqEnd, shiftDate } = buildShiftWindow(shift);

  const personTrack = existingAssignments.filter(
    (a) => a.id == null || a.id !== options?.excludeAssignmentId
  );

  if (!person.isActive) {
    return { ok: false, code: "INACTIVE", message: "Person is not active" };
  }

  const locationAllowed = person.locationRules.some(
    (lr) => lr.locationId === shift.locationId && lr.allowed
  );
  if (!locationAllowed) {
    return { ok: false, code: "LOCATION_NOT_ALLOWED", message: "Person not allowed at this location" };
  }

  if (isPersonUnavailable(person, shiftDate, reqStart, reqEnd)) {
    return { ok: false, code: "UNAVAILABLE", message: "Person is unavailable for this shift" };
  }

  const hasOverlap = personTrack.some((a) =>
    overlaps(reqStart, reqEnd, a.startDateTime, a.endDateTime)
  );
  if (hasOverlap) {
    return { ok: false, code: "OVERLAP", message: "Shift overlaps with an existing assignment" };
  }

  const minRest = person.workRule?.minRestHoursBetweenAssignments ?? 12;
  const tooClose = personTrack.some((a) => {
    const gap1 = (reqStart.getTime() - a.endDateTime.getTime()) / 3600000;
    const gap2 = (a.startDateTime.getTime() - reqEnd.getTime()) / 3600000;
    return (gap1 >= 0 && gap1 < minRest) || (gap2 >= 0 && gap2 < minRest);
  });
  if (tooClose) {
    return { ok: false, code: "REST_VIOLATION", message: "Minimum rest hours between assignments not met" };
  }

  const maxAssign = person.workRule?.maxAssignmentsPerPeriod ?? null;
  if (maxAssign !== null && personTrack.length >= maxAssign) {
    return { ok: false, code: "MAX_ASSIGNMENTS", message: "Maximum assignments per period exceeded" };
  }

  if (shift.isNightShift) {
    const maxNight = person.workRule?.maxNightAssignmentsPerPeriod ?? null;
    const currentNight = personTrack.filter((a) => a.isNightShift).length;
    if (maxNight !== null && currentNight >= maxNight) {
      return { ok: false, code: "MAX_NIGHT", message: "Maximum night assignments per period exceeded" };
    }
  }

  if (isWeekend(shiftDate)) {
    const maxWeekend = person.workRule?.maxWeekendAssignmentsPerPeriod ?? null;
    const currentWeekend = personTrack.filter((a) => isWeekend(calendarDayLocal(a.date))).length;
    if (maxWeekend !== null && currentWeekend >= maxWeekend) {
      return { ok: false, code: "MAX_WEEKEND", message: "Maximum weekend assignments per period exceeded" };
    }
  }

  return { ok: true };
}

/** Compare two calendar dates (UTC key) for coverage rule matching. */
export function calendarDatesEqual(a: Date, b: Date): boolean {
  return calendarDateKey(a) === calendarDateKey(b);
}

export function coverageRuleMatchesDay(
  rule: {
    ruleType: string;
    weekdays: number[];
    specificDate: Date | null;
    validFrom: Date | null;
    validTo: Date | null;
  },
  day: Date
): boolean {
  const isoWeekday = getISODay(calendarDayLocal(day));
  const dayLocal = calendarDayLocal(day);

  if (rule.ruleType === "WEEKLY") {
    return rule.weekdays.includes(isoWeekday);
  }
  if (rule.ruleType === "SPECIFIC_DATE" || rule.ruleType === "ONE_DAY") {
    return rule.specificDate != null && calendarDatesEqual(rule.specificDate, day);
  }
  if (rule.ruleType === "DATE_RANGE") {
    if (rule.validFrom == null || rule.validTo == null) return false;
    const withinRange = isWithinInterval(dayLocal, {
      start: calendarDayLocal(rule.validFrom),
      end: calendarDayLocal(rule.validTo),
    });
    const weekdayMatches =
      rule.weekdays.length === 0 || rule.weekdays.includes(isoWeekday);
    return withinRange && weekdayMatches;
  }
  return false;
}