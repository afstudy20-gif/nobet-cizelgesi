export type Locale = "tr" | "en";

export const LOCALE_STORAGE_KEY = "nobet_locale";

export type MessageKey =
  | "app.title"
  | "nav.overview"
  | "nav.people"
  | "nav.locations"
  | "nav.shifts"
  | "nav.coverage"
  | "nav.periods"
  | "nav.schedule"
  | "nav.export"
  | "nav.calculator"
  | "lang.switch"
  | "dashboard.title"
  | "dashboard.activePeople"
  | "dashboard.locations"
  | "dashboard.shiftTemplates"
  | "dashboard.activePeriods"
  | "dashboard.unfilled"
  | "dashboard.unfilledLink"
  | "dashboard.quickActions"
  | "dashboard.addPerson"
  | "dashboard.createPeriod"
  | "dashboard.viewSchedule"
  | "dashboard.export";

export type Messages = Record<MessageKey, string>;