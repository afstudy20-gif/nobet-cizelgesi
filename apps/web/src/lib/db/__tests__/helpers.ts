/**
 * Shared fixtures for the repository and sync test suites.
 *
 * Every test resets the Dexie database in `beforeEach`, so suites never leak
 * state into each other. `rawAll` / `rawGet` read straight from the Dexie
 * table to assert against the *actual* on-disk row, bypassing the repository's
 * own tombstone filtering — that is how the tests catch a `table.delete()`
 * that should have been a tombstone, or a tombstone that the public reads
 * forgot to filter.
 */
import { db, uid } from "../db";
import type {
  Assignment,
  Assignment as AssignmentT,
  AvailabilityRule,
  ConflictLog,
  CoverageRule,
  Location,
  Person,
  PersonLocationRule,
  PersonWorkRule,
  SchedulePeriod,
  ShiftRequirement,
  ShiftTemplate,
  SyncMeta,
} from "../types";

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Read every raw row from a table, including tombstones. */
export async function rawAll<T extends SyncMeta>(tableName: string): Promise<T[]> {
  return (await db.table(tableName).toArray()) as T[];
}

export async function rawCount(tableName: string): Promise<number> {
  return db.table(tableName).count();
}

export async function rawGet<T extends SyncMeta>(
  tableName: string,
  id: string
): Promise<T | undefined> {
  return (await db.table(tableName).get(id)) as T | undefined;
}

/** Insert a row directly, bypassing the repo (for setup-only). */
export async function rawPut<T extends SyncMeta>(tableName: string, row: T): Promise<void> {
  await db.table(tableName).put(row);
}

// ─── Seeders ──────────────────────────────────────────────────────────────────
// These call the public repo `create` so each record gets real defaults and a
// real `updatedAt`. They return the created record so tests can thread ids.

export async function seedPerson(
  overrides: Partial<Person> = {}
): Promise<Person> {
  const { peopleRepo } = await import("../repo");
  // No active locations ⇒ create() will not auto-grant location rules, keeping
  // tests deterministic about which rows exist.
  return peopleRepo.create({
    code: overrides.code ?? "P1",
    firstName: overrides.firstName ?? "Person",
    lastName: overrides.lastName ?? "One",
    role: overrides.role ?? "ASISTAN",
    isActive: overrides.isActive ?? true,
    phone: overrides.phone ?? null,
    email: overrides.email ?? null,
    notes: overrides.notes ?? null,
  });
}

export async function seedLocation(
  overrides: Partial<Location> = {}
): Promise<Location> {
  const { locationsRepo } = await import("../repo");
  return locationsRepo.create({
    code: overrides.code ?? "L1",
    name: overrides.name ?? "Acil",
    isActive: overrides.isActive ?? true,
    address: overrides.address ?? null,
    notes: overrides.notes ?? null,
  });
}

export async function seedShift(
  overrides: Partial<ShiftTemplate> = {}
): Promise<ShiftTemplate> {
  const { shiftTemplatesRepo } = await import("../repo");
  return shiftTemplatesRepo.create({
    code: overrides.code ?? "S1",
    name: overrides.name ?? "Gündüz",
    startTime: overrides.startTime ?? "08:00",
    endTime: overrides.endTime ?? "16:00",
    crossesMidnight: overrides.crossesMidnight ?? false,
    requiredHeadcount: overrides.requiredHeadcount ?? 1,
    defaultLocationId: overrides.defaultLocationId ?? null,
    color: overrides.color ?? null,
    isNightShift: overrides.isNightShift ?? false,
    isOnCall: overrides.isOnCall ?? false,
    minimumRestHoursAfter: overrides.minimumRestHoursAfter ?? 12,
    isActive: overrides.isActive ?? true,
  });
}

export async function seedCoverage(
  locationId: string,
  shiftTemplateId: string,
  overrides: Partial<CoverageRule> = {}
): Promise<CoverageRule> {
  const { coverageRulesRepo } = await import("../repo");
  return coverageRulesRepo.create({
    locationId,
    shiftTemplateId,
    ruleType: overrides.ruleType ?? "WEEKLY",
    weekdays: overrides.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
    specificDate: overrides.specificDate ?? null,
    validFrom: overrides.validFrom ?? null,
    validTo: overrides.validTo ?? null,
    requiredHeadcount: overrides.requiredHeadcount ?? 1,
    roleRequirements: overrides.roleRequirements ?? null,
    priority: overrides.priority ?? 0,
    isActive: overrides.isActive ?? true,
  });
}

export async function seedPeriod(
  overrides: Partial<Pick<SchedulePeriod, "name" | "startDate" | "endDate" | "status">> = {}
): Promise<SchedulePeriod> {
  const { schedulePeriodsRepo } = await import("../repo");
  return schedulePeriodsRepo.create({
    name: overrides.name ?? "2026-03",
    startDate: overrides.startDate ?? "2026-03-01",
    endDate: overrides.endDate ?? "2026-03-07",
  });
}

// ─── Direct row builders (for setup that the repo cannot express) ──────────────

export async function putRequirement(
  periodId: string,
  shiftTemplateId: string,
  locationId: string,
  overrides: Partial<ShiftRequirement> = {}
): Promise<ShiftRequirement> {
  const stamp = Date.now();
  const row: ShiftRequirement = {
    id: overrides.id ?? uid(),
    updatedAt: overrides.updatedAt ?? stamp,
    deleted: overrides.deleted,
    periodId,
    date: overrides.date ?? "2026-03-02T12:00:00.000Z",
    shiftTemplateId,
    locationId,
    requiredHeadcount: overrides.requiredHeadcount ?? 1,
    roleRequirements: overrides.roleRequirements ?? null,
    priority: overrides.priority ?? 0,
  };
  await db.shiftRequirements.put(row);
  return row;
}

export async function putAssignment(
  periodId: string,
  shiftRequirementId: string,
  overrides: Partial<AssignmentT> = {}
): Promise<Assignment> {
  const stamp = Date.now();
  const createdAt = new Date(stamp).toISOString();
  const row: Assignment = {
    id: overrides.id ?? uid(),
    updatedAt: overrides.updatedAt ?? stamp,
    deleted: overrides.deleted,
    periodId,
    shiftRequirementId,
    personId: overrides.personId ?? null,
    date: overrides.date ?? "2026-03-02T12:00:00.000Z",
    startDateTime: overrides.startDateTime ?? "2026-03-02T08:00:00.000Z",
    endDateTime: overrides.endDateTime ?? "2026-03-02T16:00:00.000Z",
    role: overrides.role ?? null,
    isOnCall: overrides.isOnCall ?? false,
    status: overrides.status ?? "UNFILLED",
    isLocked: overrides.isLocked ?? false,
    source: overrides.source ?? "AUTO",
    score: overrides.score ?? null,
    notes: overrides.notes ?? null,
    createdAt,
  };
  await db.assignments.put(row);
  return row;
}

export async function putConflict(
  periodId: string,
  overrides: Partial<ConflictLog> = {}
): Promise<ConflictLog> {
  const stamp = Date.now();
  const row: ConflictLog = {
    id: overrides.id ?? uid(),
    updatedAt: overrides.updatedAt ?? stamp,
    deleted: overrides.deleted,
    periodId,
    shiftRequirementId: overrides.shiftRequirementId ?? null,
    personId: overrides.personId ?? null,
    type: overrides.type ?? "REST_VIOLATION",
    severity: overrides.severity ?? "WARNING",
    message: overrides.message ?? "msg",
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date(stamp).toISOString(),
  };
  await db.conflictLogs.put(row);
  return row;
}

export async function putPersonLocationRule(
  personId: string,
  locationId: string,
  overrides: Partial<PersonLocationRule> = {}
): Promise<PersonLocationRule> {
  const row: PersonLocationRule = {
    id: overrides.id ?? uid(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    deleted: overrides.deleted,
    personId,
    locationId,
    allowed: overrides.allowed ?? true,
    priority: overrides.priority ?? 0,
  };
  await db.personLocationRules.put(row);
  return row;
}

export async function putPersonWorkRule(
  personId: string,
  overrides: Partial<PersonWorkRule> = {}
): Promise<PersonWorkRule> {
  const row: PersonWorkRule = {
    id: overrides.id ?? uid(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    deleted: overrides.deleted,
    personId,
    minAssignmentsPerPeriod: overrides.minAssignmentsPerPeriod ?? null,
    maxAssignmentsPerPeriod: overrides.maxAssignmentsPerPeriod ?? null,
    maxNightAssignmentsPerPeriod: overrides.maxNightAssignmentsPerPeriod ?? null,
    maxWeekendAssignmentsPerPeriod: overrides.maxWeekendAssignmentsPerPeriod ?? null,
    maxOnCallAssignmentsPerPeriod: overrides.maxOnCallAssignmentsPerPeriod ?? null,
    maxConsecutiveDays: overrides.maxConsecutiveDays ?? null,
    minRestHoursBetweenAssignments: overrides.minRestHoursBetweenAssignments ?? 12,
    allowBackToBackNightShift: overrides.allowBackToBackNightShift ?? false,
  };
  await db.personWorkRules.put(row);
  return row;
}

export async function putAvailabilityRule(
  personId: string,
  overrides: Partial<AvailabilityRule> = {}
): Promise<AvailabilityRule> {
  const row: AvailabilityRule = {
    id: overrides.id ?? uid(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    deleted: overrides.deleted,
    personId,
    ruleType: overrides.ruleType ?? "WEEKLY",
    availabilityType: overrides.availabilityType ?? "AVAILABLE",
    weekdays: overrides.weekdays ?? [],
    startTime: overrides.startTime ?? null,
    endTime: overrides.endTime ?? null,
    validFrom: overrides.validFrom ?? null,
    validTo: overrides.validTo ?? null,
    locationId: overrides.locationId ?? null,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
  await db.availabilityRules.put(row);
  return row;
}
