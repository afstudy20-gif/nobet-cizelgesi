/**
 * Soft-delete behaviour: `remove()` must tombstone the row (write `deleted: 1`
 * and bump `updatedAt`), never hard-delete it. A hard delete would make the
 * record resurrect on the next Drive pull, since the snapshot merge keys by
 * primary key and the remote copy is still live.
 *
 * These tests read the raw Dexie table directly — the repo's own reads filter
 * tombstones, so going through them would hide a `table.delete()`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import type {
  Assignment,
  ConflictLog,
  CoverageRule,
  Location,
  Person,
  PersonLocationRule,
  ShiftRequirement,
  ShiftTemplate,
} from "../types";
import {
  coverageRulesRepo,
  exportTemplatesRepo,
  personLocationRulesRepo,
  shiftRequirementsRepo,
  assignmentsRepo,
  conflictLogsRepo,
} from "../repo";
import {
  resetDb,
  rawAll,
  rawGet,
  seedPerson,
  seedLocation,
  seedShift,
  seedCoverage,
  seedPeriod,
  putRequirement,
  putAssignment,
  putConflict,
} from "./helpers";

describe("soft-delete tombstones", () => {
  beforeEach(resetDb);

  it("keeps the person row on disk with deleted=1 and a newer updatedAt", async () => {
    const person = await seedPerson();
    const originalUpdatedAt = person.updatedAt;
    await new Promise((r) => setTimeout(r, 5));

    const { peopleRepo } = await import("../repo");
    await peopleRepo.remove(person.id);

    const raw = await rawGet<Person>("people", person.id);
    expect(raw, "row must still exist on disk after remove()").toBeDefined();
    expect(raw!.deleted).toBe(1);
    expect(raw!.updatedAt).toBeGreaterThan(originalUpdatedAt);
  });

  it("tombstones a location instead of hard-deleting it", async () => {
    const location = await seedLocation();
    const { locationsRepo } = await import("../repo");
    await locationsRepo.remove(location.id);

    const raw = await rawGet<Location>("locations", location.id);
    expect(raw).toBeDefined();
    expect(raw!.deleted).toBe(1);
  });

  it("tombstones a shift template that has no dependents", async () => {
    const shift = await seedShift();
    const { shiftTemplatesRepo } = await import("../repo");
    await shiftTemplatesRepo.remove(shift.id);

    const raw = await rawGet<ShiftTemplate>("shiftTemplates", shift.id);
    expect(raw).toBeDefined();
    expect(raw!.deleted).toBe(1);
  });

  it("tombstones a coverage rule via the generic removeOne path", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    const rule = await seedCoverage(location.id, shift.id);
    await coverageRulesRepo.remove(rule.id);

    const raw = await rawGet<CoverageRule>("coverageRules", rule.id);
    expect(raw).toBeDefined();
    expect(raw!.deleted).toBe(1);
  });

  it("tombstones an export template", async () => {
    const template = await exportTemplatesRepo.create({
      name: "Default Excel",
      format: "EXCEL",
    });
    await exportTemplatesRepo.remove(template.id);

    const raw = await rawGet("exportTemplates", template.id);
    expect(raw).toBeDefined();
    expect((raw as { deleted?: number }).deleted).toBe(1);
  });

  it("tombstones a person location rule", async () => {
    const person = await seedPerson();
    const location = await seedLocation();
    const rule = await personLocationRulesRepo.upsert(person.id, {
      locationId: location.id,
      allowed: true,
      priority: 0,
    });
    await personLocationRulesRepo.remove(rule.id);

    const raw = await rawGet<PersonLocationRule>("personLocationRules", rule.id);
    expect(raw).toBeDefined();
    expect(raw!.deleted).toBe(1);
  });

  it("tombstones a shift requirement and its assignments together", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const req = await putRequirement(period.id, shift.id, location.id);
    await putAssignment(period.id, req.id);

    await shiftRequirementsRepo.remove(req.id);

    const rawReq = await rawGet<ShiftRequirement>("shiftRequirements", req.id);
    expect(rawReq).toBeDefined();
    expect(rawReq!.deleted).toBe(1);
    const rawAssignments = await rawAll<Assignment>("assignments");
    expect(rawAssignments.every((a) => a.deleted === 1)).toBe(true);
  });

  it("does not hard-delete via the assignment remove path", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const req = await putRequirement(period.id, shift.id, location.id);
    const assignment = await putAssignment(period.id, req.id);

    await assignmentsRepo.remove(assignment.id);

    const raw = await rawGet<Assignment>("assignments", assignment.id);
    expect(raw).toBeDefined();
    expect(raw!.deleted).toBe(1);
  });

  it("tombstones a conflict log via the generic removeOne path", async () => {
    const period = await seedPeriod();
    const conflict = await putConflict(period.id);
    await conflictLogsRepo.remove(conflict.id);

    const raw = await rawGet<ConflictLog>("conflictLogs", conflict.id);
    expect(raw).toBeDefined();
    expect(raw!.deleted).toBe(1);
  });

  it("does not leave any live rows anywhere after removing the lone entities", async () => {
    // Belt-and-braces: across every synced store, no row should be live after
    // we removed the one entity that exists in each. Coverage references both
    // the location and the shift, so it must be removed before them — that is
    // the genuine IN_USE guard working as designed, not a tombstone defect.
    const person = await seedPerson();
    const location = await seedLocation();
    const shift = await seedShift();
    const coverage = await seedCoverage(location.id, shift.id);
    const period = await seedPeriod();

    const { peopleRepo, locationsRepo, shiftTemplatesRepo, coverageRulesRepo, schedulePeriodsRepo } =
      await import("../repo");
    await coverageRulesRepo.remove(coverage.id);
    await Promise.all([
      peopleRepo.remove(person.id),
      shiftTemplatesRepo.remove(shift.id),
      locationsRepo.remove(location.id),
      schedulePeriodsRepo.remove(period.id),
    ]);

    const tableNames = [
      "people",
      "locations",
      "shiftTemplates",
      "coverageRules",
      "schedulePeriods",
    ] as const;
    for (const name of tableNames) {
      const rows = await rawAll(name);
      expect(
        rows.every((r) => r.deleted === 1),
        `${name} still has a live row after delete`
      ).toBe(true);
    }
    // Sanity: the tombstones really are still there (not hard-deleted).
    expect(await db.table("people").count()).toBe(1);
    expect(await db.table("locations").count()).toBe(1);
  });
});
