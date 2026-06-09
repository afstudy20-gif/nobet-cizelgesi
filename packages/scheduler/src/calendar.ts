/** Calendar-day utilities — dates stored at UTC noon avoid timezone day shifts. */

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` into a UTC-noon Date (stable across timezones). */
export function parseCalendarDate(iso: string): Date {
  const match = DATE_KEY_RE.exec(iso);
  if (!match) throw new Error(`Invalid calendar date: ${iso}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/** Format a Date as `YYYY-MM-DD` using UTC calendar components. */
export function calendarDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Normalize any Date to UTC noon for its UTC calendar day. */
export function normalizeCalendarDate(date: Date): Date {
  return parseCalendarDate(calendarDateKey(date));
}

/** Local midnight for the calendar day (for shift time math in server TZ). */
export function calendarDayLocal(date: Date): Date {
  const [y, m, d] = calendarDateKey(date).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addCalendarDays(date: Date, days: number): Date {
  const [y, m, d] = calendarDateKey(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0, 0));
}

/** Inclusive list of UTC-noon dates from start to end. */
export function eachCalendarDayInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let cur = normalizeCalendarDate(start);
  const endKey = calendarDateKey(end);
  while (calendarDateKey(cur) <= endKey) {
    days.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return days;
}