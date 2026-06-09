const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function parseYearMonth(value: string): { year: string; month: string; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year: match[1], month: match[2], monthIndex };
}

export function formatMonthLabel(yyyyMm: string, locale: "tr" | "en" = "tr"): string {
  const parsed = parseYearMonth(yyyyMm);
  if (!parsed) return yyyyMm;
  const names = locale === "en" ? EN_MONTHS : TR_MONTHS;
  return `${names[parsed.monthIndex]} ${parsed.year}`;
}

export function yearMonthFromDate(date: Date): string {
  return date.toISOString().slice(0, 7);
}