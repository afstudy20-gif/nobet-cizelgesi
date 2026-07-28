import Dexie, { type Table } from "dexie";
import type {
  Assignment,
  AvailabilityRule,
  ConflictLog,
  CoverageRule,
  ExportTemplate,
  Location,
  Person,
  PersonLocationRule,
  PersonWorkRule,
  SchedulePeriod,
  ShiftRequirement,
  ShiftTemplate,
} from "./types";

/**
 * The single IndexedDB database. All application data lives here — there is no
 * server database.
 *
 * Indexes mirror the query patterns the old Postgres schema was tuned for:
 * assignments by [periodId+date] for the schedule grid and every export, by
 * [personId+periodId] for per-person load during generation, requirements and
 * conflicts by period, rules by person and location. Uniqueness (`&code`,
 * `&personId`) is enforced by Dexie on write, replacing the Prisma `@unique`.
 *
 * Note: a Dexie unique index rejects duplicates *locally*, but sync merges
 * records by primary key only. Two devices can each create a person with the
 * same `code`; the merge will let both in. Codes are a human convenience here,
 * not an identity — `id` is the identity.
 */
export class NobetDB extends Dexie {
  people!: Table<Person, string>;
  locations!: Table<Location, string>;
  shiftTemplates!: Table<ShiftTemplate, string>;
  coverageRules!: Table<CoverageRule, string>;
  personLocationRules!: Table<PersonLocationRule, string>;
  personWorkRules!: Table<PersonWorkRule, string>;
  availabilityRules!: Table<AvailabilityRule, string>;
  schedulePeriods!: Table<SchedulePeriod, string>;
  shiftRequirements!: Table<ShiftRequirement, string>;
  assignments!: Table<Assignment, string>;
  conflictLogs!: Table<ConflictLog, string>;
  exportTemplates!: Table<ExportTemplate, string>;

  constructor() {
    super("nobet-v1");
    this.version(1).stores({
      people: "id, &code, fullName, role, isActive, updatedAt",
      locations: "id, &code, name, isActive, updatedAt",
      shiftTemplates: "id, &code, name, defaultLocationId, isActive, updatedAt",
      coverageRules: "id, locationId, shiftTemplateId, ruleType, isActive, updatedAt",
      personLocationRules: "id, personId, locationId, [personId+locationId], updatedAt",
      personWorkRules: "id, &personId, updatedAt",
      availabilityRules: "id, personId, locationId, ruleType, updatedAt",
      schedulePeriods: "id, name, status, startDate, updatedAt",
      shiftRequirements: "id, periodId, shiftTemplateId, locationId, date, [periodId+date], updatedAt",
      assignments:
        "id, periodId, shiftRequirementId, personId, date, [periodId+date], [personId+periodId], updatedAt",
      conflictLogs: "id, periodId, shiftRequirementId, personId, updatedAt",
      exportTemplates: "id, format, isDefault, [format+isDefault], updatedAt",
    });
  }
}

export const db = new NobetDB();

/** Every store that participates in Drive sync. */
export const SYNCED_STORES = [
  "people",
  "locations",
  "shiftTemplates",
  "coverageRules",
  "personLocationRules",
  "personWorkRules",
  "availabilityRules",
  "schedulePeriods",
  "shiftRequirements",
  "assignments",
  "conflictLogs",
  "exportTemplates",
] as const;

export type SyncedStore = (typeof SYNCED_STORES)[number];

export const uid = (): string => crypto.randomUUID();
export const now = (): number => Date.now();
