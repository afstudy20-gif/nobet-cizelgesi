/**
 * Local-first data model — the browser IndexedDB mirror of the old Prisma
 * schema.
 *
 * Three rules make these records safe to sync as one JSON snapshot:
 *
 * 1. Every synced record carries `SyncMeta`: a stable `id`, an `updatedAt`
 *    millisecond timestamp (last-writer-wins) and an optional `deleted`
 *    tombstone so deletes propagate instead of resurrecting on the next pull.
 * 2. Every field is JSON-serializable. Prisma `DateTime` becomes an ISO-8601
 *    string, `Bytes` becomes base64. No `Date`, no `Uint8Array`, no `undefined`
 *    where `null` is meant — JSON.stringify would drop it and the merge would
 *    read the absence as "unchanged".
 * 3. Relations are plain foreign-key strings. There are no nested objects and
 *    no cascade: the repository layer is responsible for deleting dependents,
 *    since IndexedDB has no referential integrity.
 */

import type {
  AssignmentSource,
  AssignmentStatus,
  AvailabilityType,
  ConflictSeverity,
  PeriodStatus,
  RuleType,
  Weekday,
} from "@nobet/shared";

export const ExportFormat = {
  EXCEL: "EXCEL",
  WORD: "WORD",
  PDF: "PDF",
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export const ExportTemplateSource = {
  BUILTIN: "BUILTIN",
  CUSTOM: "CUSTOM",
  UPLOADED: "UPLOADED",
} as const;
export type ExportTemplateSource =
  (typeof ExportTemplateSource)[keyof typeof ExportTemplateSource];

/** ISO-8601 instant, e.g. "2026-03-01T22:00:00.000Z". */
export type IsoDateTime = string;

/**
 * Carried by every synced record.
 *
 * `deleted` is `1` rather than `true` because Dexie cannot index booleans;
 * absent means "live".
 */
export interface SyncMeta {
  id: string;
  updatedAt: number;
  deleted?: 0 | 1;
}

/** Per-role headcount within one requirement, e.g. `{ ASISTAN: 2, UZMAN: 1 }`. */
export type RoleRequirements = Record<string, number>;

export interface Person extends SyncMeta {
  code: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  notes: string | null;
  createdAt: IsoDateTime;
}

export interface Location extends SyncMeta {
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface ShiftTemplate extends SyncMeta {
  code: string;
  name: string;
  /** "HH:MM" local wall-clock. */
  startTime: string;
  /** "HH:MM" local wall-clock. */
  endTime: string;
  crossesMidnight: boolean;
  requiredHeadcount: number;
  defaultLocationId: string | null;
  color: string | null;
  isNightShift: boolean;
  isOnCall: boolean;
  minimumRestHoursAfter: number;
  isActive: boolean;
}

export interface CoverageRule extends SyncMeta {
  locationId: string;
  shiftTemplateId: string;
  ruleType: RuleType;
  /** Populated for WEEKLY; empty otherwise. */
  weekdays: Weekday[];
  specificDate: IsoDateTime | null;
  validFrom: IsoDateTime | null;
  validTo: IsoDateTime | null;
  requiredHeadcount: number;
  roleRequirements: RoleRequirements | null;
  priority: number;
  isActive: boolean;
}

export interface PersonLocationRule extends SyncMeta {
  personId: string;
  locationId: string;
  allowed: boolean;
  priority: number;
}

/** At most one per person; `personId` is unique. */
export interface PersonWorkRule extends SyncMeta {
  personId: string;
  minAssignmentsPerPeriod: number | null;
  maxAssignmentsPerPeriod: number | null;
  maxNightAssignmentsPerPeriod: number | null;
  maxWeekendAssignmentsPerPeriod: number | null;
  maxOnCallAssignmentsPerPeriod: number | null;
  maxConsecutiveDays: number | null;
  minRestHoursBetweenAssignments: number;
  allowBackToBackNightShift: boolean;
}

export interface AvailabilityRule extends SyncMeta {
  personId: string;
  ruleType: RuleType;
  availabilityType: AvailabilityType;
  weekdays: Weekday[];
  startTime: string | null;
  endTime: string | null;
  validFrom: IsoDateTime | null;
  validTo: IsoDateTime | null;
  locationId: string | null;
  notes: string | null;
  createdAt: IsoDateTime;
}

export interface SchedulePeriod extends SyncMeta {
  name: string;
  startDate: IsoDateTime;
  endDate: IsoDateTime;
  status: PeriodStatus;
  generationNotes: string | null;
  createdAt: IsoDateTime;
}

export interface ShiftRequirement extends SyncMeta {
  periodId: string;
  date: IsoDateTime;
  shiftTemplateId: string;
  locationId: string;
  requiredHeadcount: number;
  roleRequirements: RoleRequirements | null;
  priority: number;
}

export interface Assignment extends SyncMeta {
  periodId: string;
  shiftRequirementId: string;
  personId: string | null;
  date: IsoDateTime;
  startDateTime: IsoDateTime;
  endDateTime: IsoDateTime;
  role: string | null;
  isOnCall: boolean;
  status: AssignmentStatus;
  isLocked: boolean;
  source: AssignmentSource;
  score: number | null;
  notes: string | null;
  createdAt: IsoDateTime;
}

export interface ConflictLog extends SyncMeta {
  periodId: string;
  shiftRequirementId: string | null;
  personId: string | null;
  type: string;
  severity: ConflictSeverity;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}

export interface ExportTemplate extends SyncMeta {
  name: string;
  description: string | null;
  format: ExportFormat;
  sourceType: ExportTemplateSource;
  hospitalName: string | null;
  titleTemplate: string;
  config: Record<string, unknown>;
  fileName: string | null;
  /**
   * Uploaded .docx payload, base64. Kept inline so one snapshot restores
   * everything; templates are small enough that a separate Drive file per
   * template would cost more than it saves.
   */
  fileData: string | null;
  isDefault: boolean;
  createdAt: IsoDateTime;
}
