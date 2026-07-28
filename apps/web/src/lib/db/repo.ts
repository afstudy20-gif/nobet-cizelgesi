import type { Table } from "dexie";
import type { z, ZodType } from "zod";
import {
  AssignmentPatchSchema,
  AvailabilityRuleCreateSchema,
  AvailabilityRuleUpdateSchema,
  CoverageRuleCreateSchema,
  CoverageRuleUpdateSchema,
  ExportTemplateCreateSchema,
  ExportTemplateUpdateSchema,
  LocationCreateSchema,
  LocationUpdateSchema,
  PersonBulkCreateSchema,
  PersonCreateSchema,
  PersonLocationRuleSchema,
  PersonUpdateSchema,
  PersonWorkRuleSchema,
  SchedulePeriodCreateSchema,
  ShiftTemplateCreateSchema,
  ShiftTemplateUpdateSchema,
  suggestPersonCodes,
} from "@nobet/shared";
import {
  AssignmentSource,
  AssignmentStatus,
  PeriodStatus,
} from "@nobet/shared";
import {
  buildShiftWindow,
  coverageRuleMatchesDay,
  eachCalendarDayInRange,
  normalizeCalendarDate,
  parseCalendarDate,
  validatePersonAssignment,
} from "@nobet/scheduler";
import { db, now, uid } from "./db";
import {
  ExportTemplateSource,
  type Assignment,
  type AvailabilityRule,
  type ConflictLog,
  type CoverageRule,
  type ExportFormat,
  type ExportTemplate,
  type IsoDateTime,
  type Location,
  type Person,
  type PersonLocationRule,
  type PersonWorkRule,
  type RoleRequirements,
  type SchedulePeriod,
  type ShiftRequirement,
  type ShiftTemplate,
  type SyncMeta,
} from "./types";

export type RepoErrorCode =
  | "NOT_FOUND"
  | "DUPLICATE"
  | "IN_USE"
  | "INVALID"
  | "VALIDATION_ERROR"
  | "LOCKED"
  | "FORBIDDEN"
  | "INACTIVE"
  | "LOCATION_NOT_ALLOWED"
  | "UNAVAILABLE"
  | "OVERLAP"
  | "REST_VIOLATION"
  | "MAX_ASSIGNMENTS"
  | "MAX_NIGHT"
  | "MAX_WEEKEND";

export class RepoError extends Error {
  constructor(
    readonly code: RepoErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "RepoError";
  }
}

export type PersonCreateInput = z.input<typeof PersonCreateSchema>;
export type PersonUpdateInput = z.input<typeof PersonUpdateSchema>;
export type PersonBulkCreateInput = z.input<typeof PersonBulkCreateSchema>;
export type LocationCreateInput = z.input<typeof LocationCreateSchema>;
export type LocationUpdateInput = z.input<typeof LocationUpdateSchema>;
export type ShiftTemplateCreateInput = z.input<typeof ShiftTemplateCreateSchema>;
export type ShiftTemplateUpdateInput = z.input<typeof ShiftTemplateUpdateSchema>;
export type CoverageRuleCreateInput = z.input<typeof CoverageRuleCreateSchema>;
export type CoverageRuleUpdateInput = z.input<typeof CoverageRuleUpdateSchema>;
export type AvailabilityRuleCreateInput = z.input<typeof AvailabilityRuleCreateSchema>;
export type AvailabilityRuleUpdateInput = z.input<typeof AvailabilityRuleUpdateSchema>;
export type ExportTemplateCreateInput = z.input<typeof ExportTemplateCreateSchema>;
export type ExportTemplateUpdateInput = z.input<typeof ExportTemplateUpdateSchema>;
export type AssignmentPatchInput = z.input<typeof AssignmentPatchSchema>;
export type SchedulePeriodCreateInput = z.input<typeof SchedulePeriodCreateSchema>;
export type SchedulePeriodPatchInput = Partial<
  Pick<SchedulePeriod, "name" | "startDate" | "endDate" | "status">
>;

export type WithLocation<T> = T & { location: Location | null };
export type DetailedCoverageRule = CoverageRule & {
  location: Location | null;
  shiftTemplate: ShiftTemplate | null;
};
export type DetailedRequirement = ShiftRequirement & {
  location: Location | null;
  shiftTemplate: ShiftTemplate | null;
};
export type DetailedAssignment = Assignment & {
  person: Person | null;
  shiftRequirement: DetailedRequirement | null;
};
export type PersonListItem = Person & {
  workRule: PersonWorkRule | null;
  locationRules: WithLocation<PersonLocationRule>[];
};
export type PersonDetail = PersonListItem & {
  availabilityRules: WithLocation<AvailabilityRule>[];
  assignmentCounts: Record<string, number>;
};
export type LocationListItem = Location & {
  _count: { coverageRules: number; locationRules: number };
};
export type LocationDetail = Location & {
  coverageRules: Array<CoverageRule & { shiftTemplate: ShiftTemplate | null }>;
  locationRules: Array<PersonLocationRule & { person: Person | null }>;
};
export type ShiftTemplateDetail = ShiftTemplate & {
  defaultLocation: Location | null;
  _count: { coverageRules: number };
};
export type SchedulePeriodListItem = SchedulePeriod & {
  _count: { requirements: number; assignments: number };
};
export type SchedulePeriodDetail = SchedulePeriod & {
  requirements: DetailedRequirement[];
  _count: { requirements: number; assignments: number; conflictLogs: number };
};
export type ScheduleData = {
  assignments: DetailedAssignment[];
  conflictLogs: ConflictLog[];
};
export type SetupCheckItem = { key: string; ok: boolean; count: number; href: string };
export type SetupReadiness = {
  ready: boolean;
  items: SetupCheckItem[];
  blockers: string[];
  peopleWithoutLocationAccess: number;
};
export type BulkPeopleResult = {
  created: number;
  skipped: Array<{ fullName: string; reason: string }>;
  people: Person[];
};
export type RequirementGenerationResult = {
  created: number;
  skippedDuplicates: number;
  preserved: number;
  periodId: string;
};
export type ExportData = {
  period: SchedulePeriod;
  requirements: DetailedRequirement[];
  assignments: DetailedAssignment[];
  conflictLogs: ConflictLog[];
};
export type ScheduleGenerationInputs = {
  period: SchedulePeriod;
  requirements: DetailedRequirement[];
  people: Array<PersonListItem & {
    availabilityRules: AvailabilityRule[];
    assignments: DetailedAssignment[];
  }>;
  survivingAssignments: Assignment[];
};
export type NewAssignment = Omit<
  Assignment,
  "id" | "updatedAt" | "deleted" | "createdAt"
> & { createdAt?: IsoDateTime };
export type NewConflictLog = Omit<
  ConflictLog,
  "id" | "updatedAt" | "deleted" | "createdAt"
> & { createdAt?: IsoDateTime };
export type GeneratedSchedule = {
  assignments: NewAssignment[];
  conflicts: NewConflictLog[];
  generationNotes: string;
};

const personLocationRulePatchSchema = PersonLocationRuleSchema.partial();
const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TITLE = "{{hospital}} — {{month}} {{year}} Nöbet Çizelgesi";

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new RepoError(
      "VALIDATION_ERROR",
      "Invalid input",
      result.error.flatten()
    );
  }
  return result.data;
}

function normalizeEmpty(input: unknown, keys: readonly string[]): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const normalized: Record<string, unknown> = { ...input };
  for (const key of keys) {
    if (normalized[key] === "") normalized[key] = null;
  }
  return normalized;
}

function isLive<T extends SyncMeta>(record: T | undefined | null): record is T {
  return record != null && record.deleted !== 1;
}

function liveRows<T extends SyncMeta>(records: readonly T[]): T[] {
  return records.filter(isLive);
}

async function readAll<T extends SyncMeta>(table: Table<T, string>): Promise<T[]> {
  return liveRows(await table.toArray());
}

async function readOne<T extends SyncMeta>(
  table: Table<T, string>,
  id: string
): Promise<T | null> {
  const record = await table.get(id);
  return isLive(record) ? record : null;
}

async function requireOne<T extends SyncMeta>(
  table: Table<T, string>,
  id: string,
  message: string
): Promise<T> {
  const record = await readOne(table, id);
  if (!record) throw new RepoError("NOT_FOUND", message);
  return record;
}

function throwWriteError(error: unknown, message: string): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConstraintError"
  ) {
    throw new RepoError("DUPLICATE", message);
  }
  throw error;
}

async function addRecord<T extends SyncMeta>(
  table: Table<T, string>,
  record: T,
  duplicateMessage: string
): Promise<T> {
  try {
    await table.add(record);
    return record;
  } catch (error) {
    throwWriteError(error, duplicateMessage);
  }
}

async function putRecord<T extends SyncMeta>(
  table: Table<T, string>,
  record: T,
  duplicateMessage: string
): Promise<T> {
  try {
    await table.put(record);
    return record;
  } catch (error) {
    throwWriteError(error, duplicateMessage);
  }
}

async function tombstoneRows<T extends SyncMeta>(
  table: Table<T, string>,
  records: readonly T[],
  stamp: number
): Promise<void> {
  if (records.length === 0) return;
  await table.bulkPut(
    records.map((record) => ({ ...record, deleted: 1, updatedAt: stamp }))
  );
}

async function removeOne<T extends SyncMeta>(
  table: Table<T, string>,
  id: string,
  notFoundMessage: string
): Promise<void> {
  const record = await requireOne(table, id, notFoundMessage);
  await table.put({ ...record, deleted: 1, updatedAt: now() });
}

function calendarIso(value: string): IsoDateTime {
  try {
    return parseCalendarDate(value).toISOString();
  } catch {
    throw new RepoError("VALIDATION_ERROR", `Invalid calendar date: ${value}`);
  }
}

function optionalCalendarIso(value: string | null | undefined): IsoDateTime | null {
  return value ? calendarIso(value) : null;
}

function asRoleRequirements(value: unknown): RoleRequirements | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new RepoError("VALIDATION_ERROR", "roleRequirements must be an object");
  }
  const result: RoleRequirements = {};
  for (const [role, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new RepoError("VALIDATION_ERROR", `Invalid headcount for role ${role}`);
    }
    result[role] = count;
  }
  return result;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "tr");
}

function byPersonName(a: Person, b: Person): number {
  return a.lastName.localeCompare(b.lastName, "tr") ||
    a.firstName.localeCompare(b.firstName, "tr");
}

function assignmentOrder(a: Assignment, b: Assignment): number {
  return a.date.localeCompare(b.date) || a.startDateTime.localeCompare(b.startDateTime);
}

async function requireLocation(id: string | null | undefined): Promise<void> {
  if (id) await requireOne(db.locations, id, "Location not found");
}

async function detailedRequirements(periodId?: string): Promise<DetailedRequirement[]> {
  const [requirements, locations, templates] = await Promise.all([
    readAll(db.shiftRequirements),
    readAll(db.locations),
    readAll(db.shiftTemplates),
  ]);
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  const templateMap = new Map(templates.map((item) => [item.id, item]));
  return requirements
    .filter((item) => periodId === undefined || item.periodId === periodId)
    .map((item) => ({
      ...item,
      location: locationMap.get(item.locationId) ?? null,
      shiftTemplate: templateMap.get(item.shiftTemplateId) ?? null,
    }));
}

async function detailedAssignments(periodId?: string): Promise<DetailedAssignment[]> {
  const [assignments, people, requirements] = await Promise.all([
    readAll(db.assignments),
    readAll(db.people),
    detailedRequirements(periodId),
  ]);
  const peopleMap = new Map(people.map((item) => [item.id, item]));
  const requirementMap = new Map(requirements.map((item) => [item.id, item]));
  return assignments
    .filter((item) => periodId === undefined || item.periodId === periodId)
    .sort(assignmentOrder)
    .map((item) => ({
      ...item,
      person: item.personId ? peopleMap.get(item.personId) ?? null : null,
      shiftRequirement: requirementMap.get(item.shiftRequirementId) ?? null,
    }));
}

export const peopleRepo = {
  async list(filter?: {
    isActive?: boolean;
    role?: string;
    search?: string;
  }): Promise<Person[]> {
    const search = filter?.search?.toLocaleLowerCase("tr");
    return (await readAll(db.people))
      .filter((person) =>
        (filter?.isActive === undefined || person.isActive === filter.isActive) &&
        (filter?.role === undefined || person.role === filter.role) &&
        (search === undefined ||
          person.fullName.toLocaleLowerCase("tr").includes(search) ||
          person.code.toLocaleLowerCase("tr").includes(search))
      )
      .sort(byPersonName);
  },

  async listDetailed(): Promise<PersonListItem[]> {
    const [people, workRules, locationRules, locations] = await Promise.all([
      this.list(),
      readAll(db.personWorkRules),
      readAll(db.personLocationRules),
      readAll(db.locations),
    ]);
    const locationMap = new Map(locations.map((item) => [item.id, item]));
    return people.map((person) => ({
      ...person,
      workRule: workRules.find((rule) => rule.personId === person.id) ?? null,
      locationRules: locationRules
        .filter((rule) => rule.personId === person.id)
        .sort((a, b) => b.priority - a.priority)
        .map((rule) => ({ ...rule, location: locationMap.get(rule.locationId) ?? null })),
    }));
  },

  async get(id: string): Promise<Person | null> {
    return readOne(db.people, id);
  },

  async getDetail(id: string): Promise<PersonDetail | null> {
    const person = await this.get(id);
    if (!person) return null;
    const [workRules, locationRules, availabilityRules, locations, assignments] =
      await Promise.all([
        readAll(db.personWorkRules),
        readAll(db.personLocationRules),
        readAll(db.availabilityRules),
        readAll(db.locations),
        readAll(db.assignments),
      ]);
    const locationMap = new Map(locations.map((item) => [item.id, item]));
    const assignmentCounts: Record<string, number> = {};
    for (const assignment of assignments.filter((item) => item.personId === id)) {
      assignmentCounts[assignment.status] = (assignmentCounts[assignment.status] ?? 0) + 1;
    }
    return {
      ...person,
      workRule: workRules.find((rule) => rule.personId === id) ?? null,
      locationRules: locationRules
        .filter((rule) => rule.personId === id)
        .sort((a, b) => b.priority - a.priority)
        .map((rule) => ({ ...rule, location: locationMap.get(rule.locationId) ?? null })),
      availabilityRules: availabilityRules
        .filter((rule) => rule.personId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((rule) => ({
          ...rule,
          location: rule.locationId ? locationMap.get(rule.locationId) ?? null : null,
        })),
      assignmentCounts,
    };
  },

  async create(input: PersonCreateInput): Promise<Person> {
    const data = parseInput(
      PersonCreateSchema,
      normalizeEmpty(input, ["phone", "email", "notes"])
    );
    const stamp = now();
    const createdAt = new Date(stamp).toISOString();
    const person: Person = {
      id: uid(), updatedAt: stamp, code: data.code, firstName: data.firstName,
      lastName: data.lastName, fullName: `${data.firstName} ${data.lastName}`,
      phone: data.phone ?? null, email: data.email ?? null, role: data.role,
      isActive: data.isActive, notes: data.notes ?? null, createdAt,
    };
    try {
      await db.transaction("rw", db.people, db.locations, db.personLocationRules, async () => {
        await db.people.add(person);
        const activeLocations = (await readAll(db.locations)).filter((item) => item.isActive);
        if (activeLocations.length) {
          await db.personLocationRules.bulkAdd(activeLocations.map((location) => ({
            id: uid(), updatedAt: stamp, personId: person.id, locationId: location.id,
            allowed: true, priority: 0,
          })));
        }
      });
      return person;
    } catch (error) {
      throwWriteError(error, "Person code already exists");
    }
  },

  async createBulk(input: PersonBulkCreateInput): Promise<BulkPeopleResult> {
    const data = parseInput(PersonBulkCreateSchema, input);
    const existing = await readAll(db.people);
    const codes = existing.map((person) => person.code);
    const names = new Set(existing.map((person) => person.fullName.toLocaleLowerCase("tr")));
    const skipped: BulkPeopleResult["skipped"] = [];
    const prepared: Array<{ code: string; firstName: string; lastName: string; role: string; isActive: boolean }> = [];
    const suggestions = suggestPersonCodes(codes, data.people.length);
    let suggestionIndex = 0;
    for (const item of data.people) {
      const fullName = `${item.firstName} ${item.lastName}`;
      if (names.has(fullName.toLocaleLowerCase("tr"))) {
        skipped.push({ fullName, reason: "ALREADY_EXISTS" });
        continue;
      }
      let code = item.code?.trim();
      if (code && codes.includes(code)) {
        skipped.push({ fullName, reason: "CODE_EXISTS" });
        continue;
      }
      code ??= suggestions[suggestionIndex++] ??
        suggestPersonCodes([...codes, ...prepared.map((person) => person.code)], 1)[0];
      prepared.push({
        code, firstName: item.firstName, lastName: item.lastName,
        role: item.role, isActive: item.isActive,
      });
      names.add(fullName.toLocaleLowerCase("tr"));
      codes.push(code);
    }
    if (prepared.length === 0) {
      throw new RepoError("VALIDATION_ERROR", "No new people to import", { skipped });
    }
    const stamp = now();
    const createdAt = new Date(stamp).toISOString();
    const people: Person[] = prepared.map((item) => ({
      id: uid(), updatedAt: stamp, ...item,
      fullName: `${item.firstName} ${item.lastName}`,
      phone: null, email: null, notes: null, createdAt,
    }));
    try {
      await db.transaction("rw", db.people, db.locations, db.personLocationRules, async () => {
        await db.people.bulkAdd(people);
        const locations = (await readAll(db.locations)).filter((item) => item.isActive);
        const rules = people.flatMap((person) => locations.map((location) => ({
          id: uid(), updatedAt: stamp, personId: person.id, locationId: location.id,
          allowed: true, priority: 0,
        })));
        if (rules.length) await db.personLocationRules.bulkAdd(rules);
      });
    } catch (error) {
      throwWriteError(error, "Person code already exists");
    }
    return { created: people.length, skipped, people };
  },

  async update(id: string, input: PersonUpdateInput): Promise<Person> {
    const current = await requireOne(db.people, id, "Person not found");
    const patch = parseInput(
      PersonUpdateSchema,
      normalizeEmpty(input, ["phone", "email", "notes"])
    );
    const firstName = patch.firstName ?? current.firstName;
    const lastName = patch.lastName ?? current.lastName;
    const updated: Person = {
      ...current, ...patch, firstName, lastName,
      fullName: `${firstName} ${lastName}`, updatedAt: now(),
    };
    return putRecord(db.people, updated, "Person code already exists");
  },

  async remove(id: string): Promise<void> {
    await db.transaction(
      "rw",
      db.people,
      db.personLocationRules,
      db.personWorkRules,
      db.availabilityRules,
      async () => {
        const person = await requireOne(db.people, id, "Person not found");
        const [locationRules, workRules, availabilityRules] = await Promise.all([
          readAll(db.personLocationRules),
          readAll(db.personWorkRules),
          readAll(db.availabilityRules),
        ]);
        const stamp = now();
        await Promise.all([
          tombstoneRows(db.people, [person], stamp),
          tombstoneRows(db.personLocationRules, locationRules.filter((item) => item.personId === id), stamp),
          tombstoneRows(db.personWorkRules, workRules.filter((item) => item.personId === id), stamp),
          tombstoneRows(db.availabilityRules, availabilityRules.filter((item) => item.personId === id), stamp),
        ]);
      }
    );
  },
};

export const locationsRepo = {
  async list(filter?: { isActive?: boolean }): Promise<Location[]> {
    return (await readAll(db.locations))
      .filter((item) => filter?.isActive === undefined || item.isActive === filter.isActive)
      .sort(byName);
  },
  async listDetailed(): Promise<LocationListItem[]> {
    const [locations, coverage, rules] = await Promise.all([
      this.list(), readAll(db.coverageRules), readAll(db.personLocationRules),
    ]);
    return locations.map((location) => ({
      ...location,
      _count: {
        coverageRules: coverage.filter((item) => item.locationId === location.id).length,
        locationRules: rules.filter((item) => item.locationId === location.id).length,
      },
    }));
  },
  async get(id: string): Promise<Location | null> { return readOne(db.locations, id); },
  async getDetail(id: string): Promise<LocationDetail | null> {
    const location = await this.get(id);
    if (!location) return null;
    const [coverage, rules, templates, people] = await Promise.all([
      readAll(db.coverageRules), readAll(db.personLocationRules),
      readAll(db.shiftTemplates), readAll(db.people),
    ]);
    return {
      ...location,
      coverageRules: coverage.filter((item) => item.locationId === id).map((item) => ({
        ...item, shiftTemplate: templates.find((template) => template.id === item.shiftTemplateId) ?? null,
      })),
      locationRules: rules.filter((item) => item.locationId === id).map((item) => ({
        ...item, person: people.find((person) => person.id === item.personId) ?? null,
      })),
    };
  },
  async create(input: LocationCreateInput): Promise<Location> {
    const data = parseInput(LocationCreateSchema, input);
    return addRecord(db.locations, { id: uid(), updatedAt: now(), ...data }, "Location code already exists");
  },
  async update(id: string, input: LocationUpdateInput): Promise<Location> {
    const current = await requireOne(db.locations, id, "Location not found");
    const patch = parseInput(LocationUpdateSchema, input);
    return putRecord(db.locations, { ...current, ...patch, updatedAt: now() }, "Location code already exists");
  },
  async remove(id: string): Promise<void> {
    await db.transaction(
      "rw", db.locations, db.shiftTemplates, db.coverageRules,
      db.personLocationRules, db.availabilityRules, db.shiftRequirements,
      async () => {
        const location = await requireOne(db.locations, id, "Location not found");
        const dependencies = [
          ...(await readAll(db.shiftTemplates)).filter((item) => item.defaultLocationId === id),
          ...(await readAll(db.coverageRules)).filter((item) => item.locationId === id),
          ...(await readAll(db.personLocationRules)).filter((item) => item.locationId === id),
          ...(await readAll(db.availabilityRules)).filter((item) => item.locationId === id),
          ...(await readAll(db.shiftRequirements)).filter((item) => item.locationId === id),
        ];
        if (dependencies.length) throw new RepoError("IN_USE", "Location is in use");
        await tombstoneRows(db.locations, [location], now());
      }
    );
  },
};

export const shiftTemplatesRepo = {
  async list(filter?: { isActive?: boolean }): Promise<ShiftTemplate[]> {
    return (await readAll(db.shiftTemplates))
      .filter((item) => filter?.isActive === undefined || item.isActive === filter.isActive)
      .sort(byName);
  },
  async get(id: string): Promise<ShiftTemplate | null> { return readOne(db.shiftTemplates, id); },
  async getDetail(id: string): Promise<ShiftTemplateDetail | null> {
    const template = await this.get(id);
    if (!template) return null;
    const [location, rules] = await Promise.all([
      template.defaultLocationId ? readOne(db.locations, template.defaultLocationId) : null,
      readAll(db.coverageRules),
    ]);
    return {
      ...template, defaultLocation: location,
      _count: { coverageRules: rules.filter((item) => item.shiftTemplateId === id).length },
    };
  },
  async create(input: ShiftTemplateCreateInput): Promise<ShiftTemplate> {
    const data = parseInput(
      ShiftTemplateCreateSchema,
      normalizeEmpty(input, ["defaultLocationId", "color"])
    );
    await requireLocation(data.defaultLocationId);
    return addRecord(
      db.shiftTemplates,
      { id: uid(), updatedAt: now(), ...data, defaultLocationId: data.defaultLocationId ?? null, color: data.color ?? null },
      "Shift template code already exists"
    );
  },
  async update(id: string, input: ShiftTemplateUpdateInput): Promise<ShiftTemplate> {
    const current = await requireOne(db.shiftTemplates, id, "Shift template not found");
    const patch = parseInput(
      ShiftTemplateUpdateSchema,
      normalizeEmpty(input, ["defaultLocationId", "color"])
    );
    if (patch.defaultLocationId !== undefined) await requireLocation(patch.defaultLocationId);
    return putRecord(
      db.shiftTemplates,
      { ...current, ...patch, updatedAt: now() },
      "Shift template code already exists"
    );
  },
  async remove(id: string): Promise<void> {
    await db.transaction("rw", db.shiftTemplates, db.coverageRules, db.shiftRequirements, async () => {
      const template = await requireOne(db.shiftTemplates, id, "Shift template not found");
      const inUse =
        (await readAll(db.coverageRules)).some((item) => item.shiftTemplateId === id) ||
        (await readAll(db.shiftRequirements)).some((item) => item.shiftTemplateId === id);
      if (inUse) throw new RepoError("IN_USE", "Shift template is in use");
      await tombstoneRows(db.shiftTemplates, [template], now());
    });
  },
};

export const coverageRulesRepo = {
  async list(filter?: { locationId?: string; shiftTemplateId?: string }): Promise<CoverageRule[]> {
    return (await readAll(db.coverageRules)).filter((item) =>
      (filter?.locationId === undefined || item.locationId === filter.locationId) &&
      (filter?.shiftTemplateId === undefined || item.shiftTemplateId === filter.shiftTemplateId)
    );
  },
  async listDetailed(filter?: { locationId?: string; shiftTemplateId?: string }): Promise<DetailedCoverageRule[]> {
    const [rules, locations, templates] = await Promise.all([
      this.list(filter), readAll(db.locations), readAll(db.shiftTemplates),
    ]);
    return rules.map((rule) => ({
      ...rule,
      location: locations.find((item) => item.id === rule.locationId) ?? null,
      shiftTemplate: templates.find((item) => item.id === rule.shiftTemplateId) ?? null,
    }));
  },
  async get(id: string): Promise<CoverageRule | null> { return readOne(db.coverageRules, id); },
  async create(input: CoverageRuleCreateInput): Promise<CoverageRule> {
    const data = parseInput(CoverageRuleCreateSchema, input);
    await Promise.all([
      requireOne(db.locations, data.locationId, "Location not found"),
      requireOne(db.shiftTemplates, data.shiftTemplateId, "Shift template not found"),
    ]);
    return addRecord(db.coverageRules, {
      id: uid(), updatedAt: now(), locationId: data.locationId,
      shiftTemplateId: data.shiftTemplateId, ruleType: data.ruleType,
      weekdays: (data.weekdays ?? []) as CoverageRule["weekdays"],
      specificDate: optionalCalendarIso(data.specificDate),
      validFrom: optionalCalendarIso(data.validFrom),
      validTo: optionalCalendarIso(data.validTo),
      requiredHeadcount: data.requiredHeadcount,
      roleRequirements: asRoleRequirements(data.roleRequirements),
      priority: data.priority, isActive: data.isActive,
    }, "Coverage rule already exists");
  },
  async update(id: string, input: CoverageRuleUpdateInput): Promise<CoverageRule> {
    const current = await requireOne(db.coverageRules, id, "Coverage rule not found");
    const patch = parseInput(CoverageRuleUpdateSchema, input);
    if (patch.locationId !== undefined) await requireOne(db.locations, patch.locationId, "Location not found");
    if (patch.shiftTemplateId !== undefined) {
      await requireOne(db.shiftTemplates, patch.shiftTemplateId, "Shift template not found");
    }
    const updated: CoverageRule = {
      ...current, ...patch,
      weekdays: patch.weekdays === undefined ? current.weekdays : (patch.weekdays ?? []) as CoverageRule["weekdays"],
      specificDate: patch.specificDate === undefined ? current.specificDate : optionalCalendarIso(patch.specificDate),
      validFrom: patch.validFrom === undefined ? current.validFrom : optionalCalendarIso(patch.validFrom),
      validTo: patch.validTo === undefined ? current.validTo : optionalCalendarIso(patch.validTo),
      roleRequirements: patch.roleRequirements === undefined
        ? current.roleRequirements : asRoleRequirements(patch.roleRequirements),
      updatedAt: now(),
    };
    return putRecord(db.coverageRules, updated, "Coverage rule already exists");
  },
  async remove(id: string): Promise<void> {
    await removeOne(db.coverageRules, id, "Coverage rule not found");
  },
};

export const personLocationRulesRepo = {
  async list(personId: string): Promise<WithLocation<PersonLocationRule>[]> {
    const [rules, locations] = await Promise.all([
      readAll(db.personLocationRules), readAll(db.locations),
    ]);
    return rules.filter((item) => item.personId === personId)
      .sort((a, b) => b.priority - a.priority)
      .map((rule) => ({
        ...rule, location: locations.find((location) => location.id === rule.locationId) ?? null,
      }));
  },
  async upsert(personId: string, input: z.input<typeof PersonLocationRuleSchema>): Promise<PersonLocationRule> {
    const data = parseInput(PersonLocationRuleSchema, input);
    await Promise.all([
      requireOne(db.people, personId, "Person not found"),
      requireOne(db.locations, data.locationId, "Location not found"),
    ]);
    const existing = (await readAll(db.personLocationRules))
      .find((item) => item.personId === personId && item.locationId === data.locationId);
    const record: PersonLocationRule = existing
      ? { ...existing, ...data, updatedAt: now() }
      : { id: uid(), updatedAt: now(), personId, ...data };
    return putRecord(db.personLocationRules, record, "Location rule already exists");
  },
  async update(id: string, input: Partial<z.input<typeof PersonLocationRuleSchema>>): Promise<PersonLocationRule> {
    const current = await requireOne(db.personLocationRules, id, "Location rule not found");
    const patch = parseInput(personLocationRulePatchSchema, input);
    if (patch.locationId !== undefined) await requireOne(db.locations, patch.locationId, "Location not found");
    return putRecord(db.personLocationRules, { ...current, ...patch, updatedAt: now() }, "Location rule already exists");
  },
  async remove(id: string): Promise<void> {
    await removeOne(db.personLocationRules, id, "Location rule not found");
  },
  async backfillMissingAccess(): Promise<number> {
    const [people, locations, rules] = await Promise.all([
      peopleRepo.list({ isActive: true }), locationsRepo.list({ isActive: true }),
      readAll(db.personLocationRules),
    ]);
    const stamp = now();
    const missing = people.flatMap((person) => locations
      .filter((location) => !rules.some((rule) =>
        rule.personId === person.id && rule.locationId === location.id && rule.allowed
      ))
      .map((location) => ({
        id: uid(), updatedAt: stamp, personId: person.id, locationId: location.id,
        allowed: true, priority: 0,
      })));
    if (missing.length) await db.personLocationRules.bulkAdd(missing);
    return missing.length;
  },
};

export const personWorkRulesRepo = {
  async get(personId: string): Promise<PersonWorkRule | null> {
    return (await readAll(db.personWorkRules)).find((item) => item.personId === personId) ?? null;
  },
  async put(personId: string, input: z.input<typeof PersonWorkRuleSchema>): Promise<PersonWorkRule> {
    await requireOne(db.people, personId, "Person not found");
    const data = parseInput(PersonWorkRuleSchema, input);
    const existingIncludingDeleted = await db.personWorkRules.where("personId").equals(personId).first();
    const record: PersonWorkRule = {
      id: existingIncludingDeleted?.id ?? uid(), updatedAt: now(), personId, ...data,
      minAssignmentsPerPeriod: data.minAssignmentsPerPeriod ?? null,
      maxAssignmentsPerPeriod: data.maxAssignmentsPerPeriod ?? null,
      maxNightAssignmentsPerPeriod: data.maxNightAssignmentsPerPeriod ?? null,
      maxWeekendAssignmentsPerPeriod: data.maxWeekendAssignmentsPerPeriod ?? null,
      maxOnCallAssignmentsPerPeriod: data.maxOnCallAssignmentsPerPeriod ?? null,
      maxConsecutiveDays: data.maxConsecutiveDays ?? null,
    };
    return putRecord(db.personWorkRules, record, "Person work rule already exists");
  },
  async remove(personId: string): Promise<void> {
    const rule = await this.get(personId);
    if (!rule) throw new RepoError("NOT_FOUND", "Person work rule not found");
    await tombstoneRows(db.personWorkRules, [rule], now());
  },
};

export const availabilityRulesRepo = {
  async list(personId: string): Promise<AvailabilityRule[]> {
    return (await readAll(db.availabilityRules))
      .filter((item) => item.personId === personId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async get(id: string): Promise<AvailabilityRule | null> { return readOne(db.availabilityRules, id); },
  async create(personId: string, input: AvailabilityRuleCreateInput): Promise<AvailabilityRule> {
    await requireOne(db.people, personId, "Person not found");
    const data = parseInput(AvailabilityRuleCreateSchema, input);
    await requireLocation(data.locationId);
    const stamp = now();
    return addRecord(db.availabilityRules, {
      id: uid(), updatedAt: stamp, personId,
      ruleType: data.ruleType === "SPECIFIC_DATE" ? "ONE_DAY" : data.ruleType,
      availabilityType: data.availabilityType,
      weekdays: (data.weekdays ?? []) as AvailabilityRule["weekdays"],
      startTime: data.startTime ?? null, endTime: data.endTime ?? null,
      validFrom: optionalCalendarIso(data.validFrom),
      validTo: optionalCalendarIso(data.validTo),
      locationId: data.locationId ?? null, notes: data.notes ?? null,
      createdAt: new Date(stamp).toISOString(),
    }, "Availability rule already exists");
  },
  async update(id: string, input: AvailabilityRuleUpdateInput): Promise<AvailabilityRule> {
    const current = await requireOne(db.availabilityRules, id, "Availability rule not found");
    const patch = parseInput(AvailabilityRuleUpdateSchema, input);
    if (patch.locationId !== undefined) await requireLocation(patch.locationId);
    const updated: AvailabilityRule = {
      ...current, ...patch,
      weekdays: patch.weekdays === undefined ? current.weekdays : (patch.weekdays ?? []) as AvailabilityRule["weekdays"],
      validFrom: patch.validFrom === undefined ? current.validFrom : optionalCalendarIso(patch.validFrom),
      validTo: patch.validTo === undefined ? current.validTo : optionalCalendarIso(patch.validTo),
      updatedAt: now(),
    };
    return putRecord(db.availabilityRules, updated, "Availability rule already exists");
  },
  async remove(id: string): Promise<void> {
    await removeOne(db.availabilityRules, id, "Availability rule not found");
  },
};

export const schedulePeriodsRepo = {
  async list(): Promise<SchedulePeriod[]> {
    return (await readAll(db.schedulePeriods)).sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
  async listDetailed(): Promise<SchedulePeriodListItem[]> {
    const [periods, requirements, assignments] = await Promise.all([
      this.list(), readAll(db.shiftRequirements), readAll(db.assignments),
    ]);
    return periods.map((period) => ({
      ...period,
      _count: {
        requirements: requirements.filter((item) => item.periodId === period.id).length,
        assignments: assignments.filter((item) => item.periodId === period.id).length,
      },
    }));
  },
  async get(id: string): Promise<SchedulePeriod | null> { return readOne(db.schedulePeriods, id); },
  async getDetail(id: string): Promise<SchedulePeriodDetail | null> {
    const period = await this.get(id);
    if (!period) return null;
    const [requirements, assignments, conflicts] = await Promise.all([
      detailedRequirements(id), readAll(db.assignments), readAll(db.conflictLogs),
    ]);
    return {
      ...period, requirements,
      _count: {
        requirements: requirements.length,
        assignments: assignments.filter((item) => item.periodId === id).length,
        conflictLogs: conflicts.filter((item) => item.periodId === id).length,
      },
    };
  },
  async create(input: SchedulePeriodCreateInput): Promise<SchedulePeriod> {
    const data = parseInput(SchedulePeriodCreateSchema, input);
    const stamp = now();
    return addRecord(db.schedulePeriods, {
      id: uid(), updatedAt: stamp, name: data.name,
      startDate: calendarIso(data.startDate), endDate: calendarIso(data.endDate),
      status: PeriodStatus.DRAFT, generationNotes: null,
      createdAt: new Date(stamp).toISOString(),
    }, "Period already exists");
  },
  async update(id: string, input: SchedulePeriodPatchInput): Promise<SchedulePeriod> {
    const current = await requireOne(db.schedulePeriods, id, "Period not found");
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new RepoError("VALIDATION_ERROR", "Invalid input");
    }
    const dates = parseInput(SchedulePeriodCreateSchema, {
      name: input.name ?? current.name,
      startDate: input.startDate ? input.startDate.slice(0, 10) : current.startDate.slice(0, 10),
      endDate: input.endDate ? input.endDate.slice(0, 10) : current.endDate.slice(0, 10),
    });
    if (input.status !== undefined && !Object.values(PeriodStatus).includes(input.status)) {
      throw new RepoError("VALIDATION_ERROR", "Invalid period status");
    }
    return putRecord(db.schedulePeriods, {
      ...current,
      ...(input.name !== undefined ? { name: dates.name } : {}),
      ...(input.startDate !== undefined ? { startDate: calendarIso(dates.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: calendarIso(dates.endDate) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: now(),
    }, "Period already exists");
  },
  async remove(id: string): Promise<void> {
    await db.transaction(
      "rw", db.schedulePeriods, db.shiftRequirements, db.assignments, db.conflictLogs,
      async () => {
        const period = await requireOne(db.schedulePeriods, id, "Period not found");
        const [requirements, assignments, conflicts] = await Promise.all([
          readAll(db.shiftRequirements), readAll(db.assignments), readAll(db.conflictLogs),
        ]);
        const stamp = now();
        await Promise.all([
          tombstoneRows(db.schedulePeriods, [period], stamp),
          tombstoneRows(db.shiftRequirements, requirements.filter((item) => item.periodId === id), stamp),
          tombstoneRows(db.assignments, assignments.filter((item) => item.periodId === id), stamp),
          tombstoneRows(db.conflictLogs, conflicts.filter((item) => item.periodId === id), stamp),
        ]);
      }
    );
  },
  async getSchedule(id: string): Promise<ScheduleData> {
    await requireOne(db.schedulePeriods, id, "Period not found");
    const [assignments, conflicts] = await Promise.all([
      detailedAssignments(id), readAll(db.conflictLogs),
    ]);
    return {
      assignments,
      conflictLogs: conflicts.filter((item) => item.periodId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  },
  async getExportData(id: string, includeConflicts = true): Promise<ExportData> {
    const period = await requireOne(db.schedulePeriods, id, "Period not found");
    const [requirements, assignments, conflicts] = await Promise.all([
      detailedRequirements(id), detailedAssignments(id), readAll(db.conflictLogs),
    ]);
    return {
      period, requirements, assignments,
      conflictLogs: includeConflicts
        ? conflicts.filter((item) => item.periodId === id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    };
  },
  async getGenerationInputs(id: string): Promise<ScheduleGenerationInputs> {
    const period = await requireOne(db.schedulePeriods, id, "Period not found");
    const [requirements, people, workRules, locationRules, availability, assignments] =
      await Promise.all([
        detailedRequirements(id), peopleRepo.list({ isActive: true }),
        readAll(db.personWorkRules), readAll(db.personLocationRules),
        readAll(db.availabilityRules), detailedAssignments(id),
      ]);
    const survivingAssignments = assignments
      .filter((item) => item.isLocked || item.source !== AssignmentSource.AUTO)
      .map(({ person: _person, shiftRequirement: _requirement, ...item }) => item);
    return {
      period, requirements, survivingAssignments,
      people: people.map((person) => ({
        ...person,
        workRule: workRules.find((item) => item.personId === person.id) ?? null,
        locationRules: locationRules.filter((item) => item.personId === person.id)
          .map((item) => ({ ...item, location: null })),
        availabilityRules: availability.filter((item) => item.personId === person.id),
        assignments: assignments.filter((item) => item.personId === person.id),
      })),
    };
  },
  async applyGeneratedSchedule(id: string, generated: GeneratedSchedule): Promise<void> {
    await db.transaction(
      "rw", db.schedulePeriods, db.assignments, db.conflictLogs,
      async () => {
        const period = await requireOne(db.schedulePeriods, id, "Period not found");
        const [assignments, conflicts] = await Promise.all([
          readAll(db.assignments), readAll(db.conflictLogs),
        ]);
        const stamp = now();
        const createdAt = new Date(stamp).toISOString();
        const nextAssignments: Assignment[] = generated.assignments.map((item) => ({
          ...item, id: uid(), updatedAt: stamp, createdAt: item.createdAt ?? createdAt,
        }));
        const nextConflicts: ConflictLog[] = generated.conflicts.map((item) => ({
          ...item, id: uid(), updatedAt: stamp, createdAt: item.createdAt ?? createdAt,
        }));
        await tombstoneRows(
          db.assignments,
          assignments.filter((item) =>
            item.periodId === id && !item.isLocked && item.source === AssignmentSource.AUTO
          ),
          stamp
        );
        await tombstoneRows(
          db.conflictLogs,
          conflicts.filter((item) => item.periodId === id),
          stamp
        );
        if (nextAssignments.length) await db.assignments.bulkAdd(nextAssignments);
        if (nextConflicts.length) await db.conflictLogs.bulkAdd(nextConflicts);
        await db.schedulePeriods.put({
          ...period, generationNotes: generated.generationNotes, updatedAt: stamp,
        });
      }
    );
  },
};

export const shiftRequirementsRepo = {
  async list(periodId: string): Promise<ShiftRequirement[]> {
    return (await readAll(db.shiftRequirements)).filter((item) => item.periodId === periodId);
  },
  async get(id: string): Promise<ShiftRequirement | null> { return readOne(db.shiftRequirements, id); },
  async remove(id: string): Promise<void> {
    await db.transaction("rw", db.shiftRequirements, db.assignments, async () => {
      const requirement = await requireOne(db.shiftRequirements, id, "Shift requirement not found");
      const assignments = (await readAll(db.assignments))
        .filter((item) => item.shiftRequirementId === id);
      const stamp = now();
      await Promise.all([
        tombstoneRows(db.shiftRequirements, [requirement], stamp),
        tombstoneRows(db.assignments, assignments, stamp),
      ]);
    });
  },
  async generateForPeriod(periodId: string): Promise<RequirementGenerationResult> {
    const period = await requireOne(db.schedulePeriods, periodId, "Period not found");
    const [rules, templates, locations, requirements, assignments] = await Promise.all([
      readAll(db.coverageRules), readAll(db.shiftTemplates), readAll(db.locations),
      readAll(db.shiftRequirements), readAll(db.assignments),
    ]);
    const activeRules = rules.filter((item) => item.isActive);
    const templateIds = new Set(templates.map((item) => item.id));
    const locationIds = new Set(locations.map((item) => item.id));
    const lockedRequirementIds = new Set(
      assignments.filter((item) => item.periodId === periodId && item.isLocked)
        .map((item) => item.shiftRequirementId)
    );
    const preserved = requirements.filter((item) =>
      item.periodId === periodId && lockedRequirementIds.has(item.id)
    );
    const keyOf = (date: string, templateId: string, locationId: string): string =>
      `${date}|${templateId}|${locationId}`;
    const keys = new Set(preserved.map((item) =>
      keyOf(item.date, item.shiftTemplateId, item.locationId)
    ));
    const stamp = now();
    const next: ShiftRequirement[] = [];
    let skippedDuplicates = 0;
    for (const day of eachCalendarDayInRange(new Date(period.startDate), new Date(period.endDate))) {
      const date = normalizeCalendarDate(day).toISOString();
      for (const rule of activeRules) {
        if (!templateIds.has(rule.shiftTemplateId) || !locationIds.has(rule.locationId)) continue;
        if (!coverageRuleMatchesDay({
          ...rule,
          specificDate: rule.specificDate ? new Date(rule.specificDate) : null,
          validFrom: rule.validFrom ? new Date(rule.validFrom) : null,
          validTo: rule.validTo ? new Date(rule.validTo) : null,
        }, day)) continue;
        const key = keyOf(date, rule.shiftTemplateId, rule.locationId);
        if (keys.has(key)) {
          skippedDuplicates++;
          continue;
        }
        keys.add(key);
        next.push({
          id: uid(), updatedAt: stamp, periodId, date,
          shiftTemplateId: rule.shiftTemplateId, locationId: rule.locationId,
          requiredHeadcount: rule.requiredHeadcount,
          roleRequirements: rule.roleRequirements, priority: rule.priority,
        });
      }
    }
    await db.transaction("rw", db.shiftRequirements, db.assignments, async () => {
      const obsoleteRequirements = (await readAll(db.shiftRequirements)).filter((item) =>
        item.periodId === periodId && !lockedRequirementIds.has(item.id)
      );
      const obsoleteIds = new Set(obsoleteRequirements.map((item) => item.id));
      const obsoleteAssignments = (await readAll(db.assignments))
        .filter((item) => item.periodId === periodId && obsoleteIds.has(item.shiftRequirementId));
      await Promise.all([
        tombstoneRows(db.shiftRequirements, obsoleteRequirements, stamp),
        tombstoneRows(db.assignments, obsoleteAssignments, stamp),
      ]);
      if (next.length) await db.shiftRequirements.bulkAdd(next);
    });
    return {
      created: next.length, skippedDuplicates,
      preserved: preserved.length, periodId,
    };
  },
};

export const assignmentsRepo = {
  async list(filter?: {
    periodId?: string;
    personId?: string;
    shiftRequirementId?: string;
    status?: Assignment["status"];
  }): Promise<Assignment[]> {
    return (await readAll(db.assignments)).filter((item) =>
      (filter?.periodId === undefined || item.periodId === filter.periodId) &&
      (filter?.personId === undefined || item.personId === filter.personId) &&
      (filter?.shiftRequirementId === undefined || item.shiftRequirementId === filter.shiftRequirementId) &&
      (filter?.status === undefined || item.status === filter.status)
    ).sort(assignmentOrder);
  },
  async get(id: string): Promise<Assignment | null> { return readOne(db.assignments, id); },
  async update(id: string, input: AssignmentPatchInput): Promise<Assignment> {
    const current = await requireOne(db.assignments, id, "Assignment not found");
    const patch = parseInput(AssignmentPatchSchema, input);
    if (current.isLocked && (patch.personId !== undefined || patch.status !== undefined)) {
      throw new RepoError(
        "LOCKED",
        "Locked assignments cannot change person or status. Unlock first."
      );
    }
    const requirement = await requireOne(
      db.shiftRequirements, current.shiftRequirementId, "Shift requirement not found"
    );
    const template = await requireOne(
      db.shiftTemplates, requirement.shiftTemplateId, "Shift template not found"
    );
    const nextPersonId = patch.personId !== undefined ? patch.personId : current.personId;
    if (nextPersonId) {
      const person = await requireOne(db.people, nextPersonId, "Person not found");
      const [workRule, locationRules, availabilityRules, tracked, requirements, templates] =
        await Promise.all([
          personWorkRulesRepo.get(nextPersonId), readAll(db.personLocationRules),
          readAll(db.availabilityRules), this.list({ periodId: current.periodId, personId: nextPersonId }),
          readAll(db.shiftRequirements), readAll(db.shiftTemplates),
        ]);
      const requirementMap = new Map(requirements.map((item) => [item.id, item]));
      const templateMap = new Map(templates.map((item) => [item.id, item]));
      const validation = validatePersonAssignment({
        id: person.id, isActive: person.isActive,
        workRule: workRule ? {
          maxAssignmentsPerPeriod: workRule.maxAssignmentsPerPeriod,
          maxNightAssignmentsPerPeriod: workRule.maxNightAssignmentsPerPeriod,
          maxWeekendAssignmentsPerPeriod: workRule.maxWeekendAssignmentsPerPeriod,
          minRestHoursBetweenAssignments: workRule.minRestHoursBetweenAssignments,
          allowBackToBackNightShift: workRule.allowBackToBackNightShift,
        } : null,
        locationRules: locationRules.filter((item) => item.personId === person.id),
        availabilityRules: availabilityRules.filter((item) => item.personId === person.id)
          .map((item) => ({
            ...item,
            validFrom: item.validFrom ? new Date(item.validFrom) : null,
            validTo: item.validTo ? new Date(item.validTo) : null,
          })),
      }, {
        date: new Date(requirement.date), locationId: requirement.locationId,
        startTime: template.startTime, endTime: template.endTime,
        crossesMidnight: template.crossesMidnight, isNightShift: template.isNightShift,
      }, tracked.map((item) => {
        const trackedRequirement = requirementMap.get(item.shiftRequirementId);
        const trackedTemplate = trackedRequirement
          ? templateMap.get(trackedRequirement.shiftTemplateId) : undefined;
        return {
          id: item.id, startDateTime: new Date(item.startDateTime),
          endDateTime: new Date(item.endDateTime),
          isNightShift: trackedTemplate?.isNightShift ?? false,
          locationId: trackedRequirement?.locationId ?? "",
          date: new Date(item.date),
        };
      }), { excludeAssignmentId: id });
      if (!validation.ok) {
        throw new RepoError(validation.code as RepoErrorCode, validation.message);
      }
    }
    const window = buildShiftWindow({
      date: new Date(requirement.date), locationId: requirement.locationId,
      startTime: template.startTime, endTime: template.endTime,
      crossesMidnight: template.crossesMidnight, isNightShift: template.isNightShift,
    });
    const status = patch.status ??
      (patch.personId !== undefined
        ? nextPersonId ? AssignmentStatus.ASSIGNED : AssignmentStatus.UNFILLED
        : current.status);
    return putRecord(db.assignments, {
      ...current, ...patch, personId: nextPersonId, status,
      ...(patch.personId !== undefined ? {
        date: normalizeCalendarDate(new Date(requirement.date)).toISOString(),
        startDateTime: window.reqStart.toISOString(),
        endDateTime: window.reqEnd.toISOString(),
      } : {}),
      source: AssignmentSource.MANUAL, updatedAt: now(),
    }, "Assignment already exists");
  },
  async setLocked(id: string, locked: boolean): Promise<Assignment> {
    const current = await requireOne(db.assignments, id, "Assignment not found");
    return putRecord(db.assignments, { ...current, isLocked: locked, updatedAt: now() }, "Assignment already exists");
  },
  async remove(id: string): Promise<void> {
    await removeOne(db.assignments, id, "Assignment not found");
  },
};

export const conflictLogsRepo = {
  async list(periodId: string): Promise<ConflictLog[]> {
    return (await readAll(db.conflictLogs)).filter((item) => item.periodId === periodId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async get(id: string): Promise<ConflictLog | null> { return readOne(db.conflictLogs, id); },
  async remove(id: string): Promise<void> {
    await removeOne(db.conflictLogs, id, "Conflict log not found");
  },
};

export const exportTemplatesRepo = {
  async list(format?: ExportFormat): Promise<ExportTemplate[]> {
    return (await readAll(db.exportTemplates))
      .filter((item) => format === undefined || item.format === format)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || byName(a, b));
  },
  async get(id: string): Promise<ExportTemplate | null> { return readOne(db.exportTemplates, id); },
  async getDefault(format: ExportFormat): Promise<ExportTemplate | null> {
    return (await this.list(format)).filter((item) => item.isDefault)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  },
  async create(input: ExportTemplateCreateInput): Promise<ExportTemplate> {
    const data = parseInput(ExportTemplateCreateSchema, input);
    const stamp = now();
    const template: ExportTemplate = {
      id: uid(), updatedAt: stamp, name: data.name,
      description: data.description ?? null, format: data.format,
      sourceType: ExportTemplateSource.CUSTOM,
      hospitalName: data.hospitalName ?? null,
      titleTemplate: data.titleTemplate ?? DEFAULT_TITLE,
      config: data.config ?? {}, fileName: null, fileData: null,
      isDefault: data.isDefault ?? false, createdAt: new Date(stamp).toISOString(),
    };
    await db.transaction("rw", db.exportTemplates, async () => {
      if (template.isDefault) {
        const existing = (await readAll(db.exportTemplates))
          .filter((item) => item.format === template.format && item.isDefault);
        if (existing.length) {
          await db.exportTemplates.bulkPut(existing.map((item) => ({
            ...item, isDefault: false, updatedAt: stamp,
          })));
        }
      }
      await db.exportTemplates.add(template);
    });
    return template;
  },
  async update(id: string, input: ExportTemplateUpdateInput): Promise<ExportTemplate> {
    const current = await requireOne(db.exportTemplates, id, "Template not found");
    const patch = parseInput(ExportTemplateUpdateSchema, input);
    const stamp = now();
    const updated: ExportTemplate = {
      ...current, ...patch,
      description: patch.description === undefined ? current.description : patch.description,
      hospitalName: patch.hospitalName === undefined ? current.hospitalName : patch.hospitalName,
      updatedAt: stamp,
    };
    await db.transaction("rw", db.exportTemplates, async () => {
      if (updated.isDefault && patch.isDefault) {
        const defaults = (await readAll(db.exportTemplates)).filter((item) =>
          item.id !== id && item.format === updated.format && item.isDefault
        );
        if (defaults.length) {
          await db.exportTemplates.bulkPut(defaults.map((item) => ({
            ...item, isDefault: false, updatedAt: stamp,
          })));
        }
      }
      await db.exportTemplates.put(updated);
    });
    return updated;
  },
  async uploadFile(id: string, file: File): Promise<ExportTemplate> {
    const current = await requireOne(db.exportTemplates, id, "Template not found");
    if (current.format !== "EXCEL" && current.format !== "WORD") {
      throw new RepoError("VALIDATION_ERROR", "Only Excel and Word templates support file upload");
    }
    const extension = current.format === "EXCEL" ? ".xlsx" : ".docx";
    if (!file.name.toLowerCase().endsWith(extension)) {
      throw new RepoError(
        "VALIDATION_ERROR",
        `Only ${extension} files are supported for ${current.format} templates`
      );
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      throw new RepoError("VALIDATION_ERROR", "File must be 5 MB or smaller");
    }
    const updated: ExportTemplate = {
      ...current, fileName: file.name,
      fileData: await fileToBase64(file),
      sourceType: ExportTemplateSource.UPLOADED, updatedAt: now(),
    };
    return putRecord(db.exportTemplates, updated, "Template already exists");
  },
  async remove(id: string): Promise<void> {
    const current = await requireOne(db.exportTemplates, id, "Template not found");
    if (current.sourceType === ExportTemplateSource.BUILTIN) {
      throw new RepoError("FORBIDDEN", "Built-in templates cannot be deleted");
    }
    await tombstoneRows(db.exportTemplates, [current], now());
  },
};

export async function getSetupReadiness(): Promise<SetupReadiness> {
  const [people, locations, shifts, coverage, accessRules] = await Promise.all([
    peopleRepo.list({ isActive: true }), locationsRepo.list({ isActive: true }),
    shiftTemplatesRepo.list({ isActive: true }),
    readAll(db.coverageRules), readAll(db.personLocationRules),
  ]);
  const activeCoverage = coverage.filter((item) => item.isActive);
  const requiredLocations = new Set(activeCoverage.map((item) => item.locationId));
  const peopleWithoutLocationAccess = people.filter((person) =>
    [...requiredLocations].some((locationId) =>
      !accessRules.some((rule) =>
        rule.personId === person.id && rule.locationId === locationId && rule.allowed
      )
    )
  ).length;
  const items: SetupCheckItem[] = [
    { key: "people", ok: people.length > 0, count: people.length, href: "/people" },
    { key: "locations", ok: locations.length > 0, count: locations.length, href: "/locations" },
    { key: "shifts", ok: shifts.length > 0, count: shifts.length, href: "/shifts" },
    { key: "coverage", ok: activeCoverage.length > 0, count: activeCoverage.length, href: "/coverage-rules" },
    {
      key: "locationAccess",
      ok: people.length === 0 || peopleWithoutLocationAccess === 0,
      count: people.length - peopleWithoutLocationAccess, href: "/people",
    },
  ];
  const blockers: string[] = [];
  if (!people.length) blockers.push("Aktif personel yok.");
  if (!locations.length) blockers.push("Aktif çalışma yeri yok.");
  if (!shifts.length) blockers.push("Aktif vardiya şablonu yok.");
  if (!activeCoverage.length) blockers.push("Nöbet ihtiyaç kuralı tanımlı değil.");
  if (people.length && peopleWithoutLocationAccess) {
    blockers.push(`${peopleWithoutLocationAccess} aktif personelin nöbet lokasyonu izni eksik.`);
  }
  return {
    ready: blockers.length === 0, items, blockers, peopleWithoutLocationAccess,
  };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function fileToBase64(file: File): Promise<string> {
  return arrayBufferToBase64(await file.arrayBuffer());
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new RepoError("VALIDATION_ERROR", "Invalid base64 data");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
