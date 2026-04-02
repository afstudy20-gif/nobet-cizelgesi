import { z } from "zod";

// ─── Person ──────────────────────────────────────────────────────────────────
export const PersonCreateSchema = z.object({
  code: z.string().min(1).max(20),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().max(1000).optional().nullable(),
});
export const PersonUpdateSchema = PersonCreateSchema.partial();

// ─── Location ────────────────────────────────────────────────────────────────
export const LocationCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().max(1000).optional().nullable(),
});
export const LocationUpdateSchema = LocationCreateSchema.partial();

// ─── ShiftTemplate ───────────────────────────────────────────────────────────
export const ShiftTemplateCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM format"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM format"),
  crossesMidnight: z.boolean().default(false),
  requiredHeadcount: z.number().int().min(1).default(1),
  defaultLocationId: z.string().optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  isNightShift: z.boolean().default(false),
  minimumRestHoursAfter: z.number().int().min(0).default(12),
  isActive: z.boolean().default(true),
});
export const ShiftTemplateUpdateSchema = ShiftTemplateCreateSchema.partial();

// ─── CoverageRule ────────────────────────────────────────────────────────────
export const CoverageRuleCreateSchema = z.object({
  locationId: z.string(),
  shiftTemplateId: z.string(),
  ruleType: z.enum(["WEEKLY", "SPECIFIC_DATE", "DATE_RANGE"]),
  weekdays: z.array(z.number().int().min(1).max(7)).optional().nullable(),
  specificDate: z.string().optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  requiredHeadcount: z.number().int().min(1).default(1),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const CoverageRuleUpdateSchema = CoverageRuleCreateSchema.partial();

// ─── PersonLocationRule ───────────────────────────────────────────────────────
export const PersonLocationRuleSchema = z.object({
  locationId: z.string(),
  allowed: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
});

// ─── PersonWorkRule ───────────────────────────────────────────────────────────
export const PersonWorkRuleSchema = z.object({
  minAssignmentsPerPeriod: z.number().int().min(0).optional().nullable(),
  maxAssignmentsPerPeriod: z.number().int().min(0).optional().nullable(),
  maxNightAssignmentsPerPeriod: z.number().int().min(0).optional().nullable(),
  maxWeekendAssignmentsPerPeriod: z.number().int().min(0).optional().nullable(),
  maxConsecutiveDays: z.number().int().min(0).optional().nullable(),
  minRestHoursBetweenAssignments: z.number().int().min(0).default(12),
  allowBackToBackNightShift: z.boolean().default(false),
});

// ─── AvailabilityRule ─────────────────────────────────────────────────────────
export const AvailabilityRuleCreateSchema = z.object({
  ruleType: z.enum(["WEEKLY", "DATE_RANGE", "ONE_DAY"]),
  availabilityType: z.enum(["AVAILABLE", "UNAVAILABLE", "PREFERRED"]),
  weekdays: z.array(z.number().int().min(1).max(7)).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export const AvailabilityRuleUpdateSchema = AvailabilityRuleCreateSchema.partial();

// ─── SchedulePeriod ──────────────────────────────────────────────────────────
export const SchedulePeriodCreateSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ─── Assignment patch ─────────────────────────────────────────────────────────
export const AssignmentPatchSchema = z.object({
  personId: z.string().optional().nullable(),
  status: z.enum(["ASSIGNED", "UNFILLED", "CANCELLED"]).optional(),
  isLocked: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});
