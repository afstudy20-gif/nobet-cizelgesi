import { getISODay, addDays, startOfDay } from "date-fns";

/** Parse "HH:MM" into { hours, minutes }. Missing/invalid parts default to 0. */
export function parseHHMM(t: string): { hours: number; minutes: number } {
  const [h, m] = t.split(":").map(Number);
  return { hours: Number.isFinite(h) ? h : 0, minutes: Number.isFinite(m) ? m : 0 };
}

/** Build the absolute start DateTime for a shift on a given day. */
export function shiftStart(day: Date, startTime: string): Date {
  const { hours, minutes } = parseHHMM(startTime);
  const d = new Date(startOfDay(day));
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Build the absolute end DateTime for a shift, respecting crossesMidnight. */
export function shiftEnd(day: Date, endTime: string, crossesMidnight: boolean): Date {
  const { hours, minutes } = parseHHMM(endTime);
  const base = crossesMidnight ? addDays(startOfDay(day), 1) : startOfDay(day);
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** True if intervals [s1,e1) and [s2,e2) overlap. */
export function overlaps(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return s1 < e2 && s2 < e1;
}

/** True if the date falls on Saturday (ISO 6) or Sunday (ISO 7). */
export function isWeekend(date: Date): boolean {
  const d = getISODay(date);
  return d === 6 || d === 7;
}
