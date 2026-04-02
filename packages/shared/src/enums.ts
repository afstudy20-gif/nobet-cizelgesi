export const RuleType = {
  WEEKLY: "WEEKLY",
  SPECIFIC_DATE: "SPECIFIC_DATE",
  DATE_RANGE: "DATE_RANGE",
  ONE_DAY: "ONE_DAY",
} as const;
export type RuleType = (typeof RuleType)[keyof typeof RuleType];

export const AvailabilityType = {
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  PREFERRED: "PREFERRED",
} as const;
export type AvailabilityType = (typeof AvailabilityType)[keyof typeof AvailabilityType];

export const AssignmentStatus = {
  ASSIGNED: "ASSIGNED",
  UNFILLED: "UNFILLED",
  CANCELLED: "CANCELLED",
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const AssignmentSource = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
} as const;
export type AssignmentSource = (typeof AssignmentSource)[keyof typeof AssignmentSource];

export const PeriodStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type PeriodStatus = (typeof PeriodStatus)[keyof typeof PeriodStatus];

export const ConflictSeverity = {
  WARNING: "WARNING",
  ERROR: "ERROR",
} as const;
export type ConflictSeverity = (typeof ConflictSeverity)[keyof typeof ConflictSeverity];

// 1=Monday … 7=Sunday (ISO)
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
