import { z } from "zod";

/**
 * Validation for the full-database backup payload accepted by
 * `POST /api/sync/import`.
 *
 * That route wipes all 11 tables and repopulates them from this body, so every
 * field here reaches `createMany` — including primary keys and foreign keys.
 * It previously took `await req.json()` typed `any` with a single truthiness
 * check, which made the entire database schema attacker-controlled.
 *
 * Unknown keys are stripped rather than rejected (Zod's default), so a backup
 * taken before a column was dropped still restores instead of failing whole.
 */

/**
 * Per-table ceiling. Sized for the largest table by far, `Assignment`:
 * 50 people x 365 days x 2 shifts is ~36k rows per year, so a multi-year
 * install needs well over 50k before a legitimate backup would be refused.
 */
const MAX_ROWS = 500_000;

/** Uploaded .xlsx/.docx template, base64-encoded. 20 MB raw, ~27 MB encoded. */
const MAX_TEMPLATE_BASE64 = 28_000_000;

/** Postgres `integer`. Values beyond this reach the DB and fail as a 500. */
const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

const id = z.string().min(1).max(64);
const optionalId = id.nullable().optional();
const shortText = z.string().max(500);
const longText = z.string().max(10_000);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");
const isoWeekday = z.number().int().min(1).max(7);
const count = z.number().int().min(0).max(10_000);
const int32 = z.number().int().min(INT32_MIN).max(INT32_MAX);

/** Prisma `Bytes`, carried as base64 so it survives JSON. */
const bytes = z
  .string()
  .max(MAX_TEMPLATE_BASE64)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, "expected base64")
  .transform((value) => Buffer.from(value, "base64"));

/** JSON columns (`roleRequirements`, `metadata`). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ])
);

/**
 * Prisma rejects a literal `null` for a nullable Json column — it wants the
 * field omitted (or `Prisma.JsonNull`). Normalise null to undefined so a
 * round-tripped backup does not blow up on restore.
 *
 * This collapses a stored JSON `null` into a SQL NULL. Nothing in this app
 * writes a deliberate JSON null into these columns (they hold `{role: count}`
 * maps), so the distinction has no meaning here — but it is not preserved.
 */
const optionalJson = jsonValue
  .nullish()
  .transform((value) => (value === null ? undefined : value));

/**
 * A non-nullable Json column (`ExportTemplate.config`). Prisma will not accept
 * a bare `null` for one, so top-level null is excluded here rather than being
 * allowed through to fail at the database.
 */
const requiredJson = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(jsonValue),
  z.record(jsonValue),
]);

/** Dates arrive as ISO strings from JSON.stringify. */
const date = z.coerce.date();
const optionalDate = z.coerce.date().nullable().optional();

const person = z.object({
  id,
  code: shortText,
  firstName: shortText,
  lastName: shortText,
  fullName: shortText,
  phone: shortText.nullable().optional(),
  email: shortText.nullable().optional(),
  role: shortText,
  isActive: z.boolean(),
  notes: longText.nullable().optional(),
  createdAt: date,
  updatedAt: date,
});

const location = z.object({
  id,
  code: shortText,
  name: shortText,
  address: longText.nullable().optional(),
  isActive: z.boolean(),
  notes: longText.nullable().optional(),
});

const shiftTemplate = z.object({
  id,
  code: shortText,
  name: shortText,
  startTime: timeOfDay,
  endTime: timeOfDay,
  crossesMidnight: z.boolean(),
  requiredHeadcount: count,
  defaultLocationId: optionalId,
  color: shortText.nullable().optional(),
  isNightShift: z.boolean(),
  isOnCall: z.boolean(),
  minimumRestHoursAfter: z.number().int().min(0).max(168),
  isActive: z.boolean(),
});

const coverageRule = z.object({
  id,
  locationId: id,
  shiftTemplateId: id,
  ruleType: z.enum(["WEEKLY", "SPECIFIC_DATE", "DATE_RANGE", "ONE_DAY"]),
  weekdays: z.array(isoWeekday).max(7),
  specificDate: optionalDate,
  validFrom: optionalDate,
  validTo: optionalDate,
  requiredHeadcount: count,
  roleRequirements: optionalJson,
  priority: int32,
  isActive: z.boolean(),
});

const personLocationRule = z.object({
  id,
  personId: id,
  locationId: id,
  allowed: z.boolean(),
  priority: int32,
});

const personWorkRule = z.object({
  id,
  personId: id,
  minAssignmentsPerPeriod: count.nullable().optional(),
  maxAssignmentsPerPeriod: count.nullable().optional(),
  maxNightAssignmentsPerPeriod: count.nullable().optional(),
  maxWeekendAssignmentsPerPeriod: count.nullable().optional(),
  maxOnCallAssignmentsPerPeriod: count.nullable().optional(),
  maxConsecutiveDays: count.nullable().optional(),
  minRestHoursBetweenAssignments: z.number().int().min(0).max(168),
  allowBackToBackNightShift: z.boolean(),
});

const availabilityRule = z.object({
  id,
  personId: id,
  ruleType: z.enum(["WEEKLY", "SPECIFIC_DATE", "DATE_RANGE", "ONE_DAY"]),
  availabilityType: z.enum(["AVAILABLE", "UNAVAILABLE", "PREFERRED"]),
  weekdays: z.array(isoWeekday).max(7),
  startTime: timeOfDay.nullable().optional(),
  endTime: timeOfDay.nullable().optional(),
  validFrom: optionalDate,
  validTo: optionalDate,
  locationId: optionalId,
  notes: longText.nullable().optional(),
  createdAt: date,
});

const schedulePeriod = z.object({
  id,
  name: shortText,
  startDate: date,
  endDate: date,
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  generationNotes: longText.nullable().optional(),
  createdAt: date,
  updatedAt: date,
});

const shiftRequirement = z.object({
  id,
  periodId: id,
  date,
  shiftTemplateId: id,
  locationId: id,
  requiredHeadcount: count,
  roleRequirements: optionalJson,
  priority: int32,
});

const assignment = z.object({
  id,
  periodId: id,
  shiftRequirementId: id,
  personId: optionalId,
  date,
  startDateTime: date,
  endDateTime: date,
  role: shortText.nullable().optional(),
  isOnCall: z.boolean(),
  status: z.enum(["ASSIGNED", "UNFILLED", "CANCELLED"]),
  isLocked: z.boolean(),
  source: z.enum(["AUTO", "MANUAL"]),
  score: z.number().finite().nullable().optional(),
  notes: longText.nullable().optional(),
  createdAt: date,
  updatedAt: date,
});

const conflictLog = z.object({
  id,
  periodId: id,
  shiftRequirementId: optionalId,
  personId: optionalId,
  type: shortText,
  severity: z.enum(["WARNING", "ERROR"]),
  message: longText,
  metadata: optionalJson,
  createdAt: date,
});

const exportTemplate = z.object({
  id,
  name: shortText,
  description: longText.nullable().optional(),
  format: z.enum(["EXCEL", "WORD", "PDF"]),
  sourceType: z.enum(["BUILTIN", "CUSTOM", "UPLOADED"]),
  hospitalName: shortText.nullable().optional(),
  titleTemplate: longText,
  config: requiredJson,
  fileName: shortText.nullable().optional(),
  fileData: bytes.nullable().optional(),
  isDefault: z.boolean(),
  createdAt: date,
  updatedAt: date,
});

/**
 * Required, not defaulted.
 *
 * The restore wipes each table before repopulating it, so a table that
 * defaults to `[]` when absent turns a truncated or hand-edited backup into a
 * silent delete of everything in it. Every export emits all of these, so
 * demanding them costs nothing and makes a malformed backup a 400 instead.
 */
function table<T extends z.ZodTypeAny>(row: T) {
  return z.array(row).max(MAX_ROWS);
}

/** Backups written before export templates were included omit this table. */
const CURRENT_VERSION = 2;

export const BackupSchema = z.object({
  version: z.number().int().min(1).max(CURRENT_VERSION).optional(),
  lastModified: z.number().optional(),
  data: z.object({
    people: table(person),
    locations: table(location),
    shiftTemplates: table(shiftTemplate),
    coverageRules: table(coverageRule),
    personLocationRules: table(personLocationRule),
    personWorkRules: table(personWorkRule),
    availabilityRules: table(availabilityRule),
    schedulePeriods: table(schedulePeriod),
    shiftRequirements: table(shiftRequirement),
    assignments: table(assignment),
    conflictLogs: table(conflictLog),
    /**
     * Absent in version 1 backups. The restore leaves the table untouched in
     * that case rather than treating it as an instruction to empty it — the
     * uploaded .xlsx/.docx files here are the most laborious content a user
     * owns, and a v1 backup carries no information about them either way.
     */
    exportTemplates: table(exportTemplate).optional(),
  }),
});

export { CURRENT_VERSION };
export type Backup = z.infer<typeof BackupSchema>;
export type BackupData = Backup["data"];
