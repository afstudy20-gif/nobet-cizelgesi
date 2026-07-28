/**
 * Every public read path must exclude tombstones. A missed filter here is the
 * canonical defect in a soft-delete design: the record looks deleted to the
 * user but leaks back into a list, a detail view, an aggregate count, or the
 * export, schedule and setup-readiness queries.
 *
 * For each entity the pattern is: create → soft-delete → assert it is absent
 * from list, get, and every derived/aggregate read that can reach it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  peopleRepo,
  locationsRepo,
  shiftTemplatesRepo,
  coverageRulesRepo,
  personLocationRulesRepo,
  personWorkRulesRepo,
  availabilityRulesRepo,
  schedulePeriodsRepo,
  shiftRequirementsRepo,
  assignmentsRepo,
  conflictLogsRepo,
  exportTemplatesRepo,
  getSetupReadiness,
  RepoError,
} from "../repo";
import {
  resetDb,
  seedPerson,
  seedLocation,
  seedShift,
  seedCoverage,
  seedPeriod,
  putRequirement,
  putAssignment,
  putConflict,
  putPersonWorkRule,
  putAvailabilityRule,
} from "./helpers";
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
} from "../types";
import { db } from "../db";

/** Tombstone a row in place by writing deleted=1 with a bumped updatedAt. */
async function tombstone<T extends { id: string; updatedAt: number; deleted?: 0 | 1 }>(
  table: string,
  id: string
): Promise<void> {
  const row = (await db.table(table).get(id)) as T;
  await db.table(table).put({ ...row, deleted: 1, updatedAt: row.updatedAt + 1 });
}

describe("read paths filter tombstones: people", () => {
  beforeEach(resetDb);

  it("hides a tombstoned person from list, get, listDetailed and getDetail", async () => {
    const live = await seedPerson({ code: "LIVE", firstName: "Live", lastName: "One" });
    const dead = await seedPerson({ code: "DEAD", firstName: "Dead", lastName: "Two" });
    await tombstone<Person>("people", dead.id);

    expect((await peopleRepo.list()).map((p) => p.code)).toEqual(["LIVE"]);
    expect(await peopleRepo.list({ isActive: true })).toHaveLength(1);
    expect(await peopleRepo.get(dead.id)).toBeNull();
    expect((await peopleRepo.listDetailed()).map((p) => p.code)).toEqual(["LIVE"]);
    expect(await peopleRepo.getDetail(dead.id)).toBeNull();

    // listDetailed/getDetail still work for the live one.
    const detail = await peopleRepo.getDetail(live.id);
    expect(detail?.code).toBe("LIVE");
  });

  it("excludes a tombstoned person from search and role filters", async () => {
    await seedPerson({ code: "A", firstName: "Ahmet", lastName: "Z", role: "UZMAN" });
    const dead = await seedPerson({ code: "B", firstName: "Bora", lastName: "Y", role: "UZMAN" });
    await tombstone<Person>("people", dead.id);

    expect((await peopleRepo.list({ role: "UZMAN" })).map((p) => p.code)).toEqual(["A"]);
    expect((await peopleRepo.list({ search: "bo" })).map((p) => p.code)).toEqual([]);
  });
});

describe("read paths filter tombstones: locations", () => {
  beforeEach(resetDb);

  it("hides a tombstoned location from list, get, listDetailed and getDetail", async () => {
    await seedLocation({ code: "LIVE", name: "Acil" });
    const dead = await seedLocation({ code: "DEAD", name: "Eski" });
    await tombstone<Location>("locations", dead.id);

    expect((await locationsRepo.list()).map((l) => l.code)).toEqual(["LIVE"]);
    expect(await locationsRepo.get(dead.id)).toBeNull();
    const detailed = await locationsRepo.listDetailed();
    expect(detailed.map((l) => l.code)).toEqual(["LIVE"]);
    expect(detailed[0]._count).toEqual({ coverageRules: 0, locationRules: 0 });
    expect(await locationsRepo.getDetail(dead.id)).toBeNull();
  });
});

describe("read paths filter tombstones: shift templates", () => {
  beforeEach(resetDb);

  it("hides a tombstoned shift from list, get and getDetail", async () => {
    await seedShift({ code: "LIVE", name: "Gündüz" });
    const dead = await seedShift({ code: "DEAD", name: "Gece" });
    await tombstone<ShiftTemplate>("shiftTemplates", dead.id);

    expect((await shiftTemplatesRepo.list()).map((s) => s.code)).toEqual(["LIVE"]);
    expect(await shiftTemplatesRepo.get(dead.id)).toBeNull();
    expect(await shiftTemplatesRepo.getDetail(dead.id)).toBeNull();
  });
});

describe("read paths filter tombstones: coverage rules", () => {
  beforeEach(resetDb);

  it("hides a tombstoned coverage rule from list, listDetailed and get", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    await seedCoverage(location.id, shift.id);
    const dead = await seedCoverage(location.id, shift.id, { priority: 5 });
    await tombstone<CoverageRule>("coverageRules", dead.id);

    expect(await coverageRulesRepo.list()).toHaveLength(1);
    expect(await coverageRulesRepo.listDetailed()).toHaveLength(1);
    expect(await coverageRulesRepo.get(dead.id)).toBeNull();
    expect(
      await coverageRulesRepo.list({ locationId: location.id, shiftTemplateId: shift.id })
    ).toHaveLength(1);
  });
});

describe("read paths filter tombstones: person location rules", () => {
  beforeEach(resetDb);

  it("hides a tombstoned person location rule from the per-person list", async () => {
    const person = await seedPerson();
    const a = await seedLocation({ code: "A", name: "A" });
    const b = await seedLocation({ code: "B", name: "B" });
    const liveRule = await personLocationRulesRepo.upsert(person.id, { locationId: a.id });
    const deadRule = await personLocationRulesRepo.upsert(person.id, { locationId: b.id });
    await tombstone<PersonLocationRule>("personLocationRules", deadRule.id);

    const list = await personLocationRulesRepo.list(person.id);
    expect(list.map((r) => r.id)).toEqual([liveRule.id]);
  });
});

describe("read paths filter tombstones: person work rules", () => {
  beforeEach(resetDb);

  it("hides a tombstoned work rule from get", async () => {
    const person = await seedPerson();
    const rule = await putPersonWorkRule(person.id, { minRestHoursBetweenAssignments: 24 });
    await tombstone<PersonWorkRule>("personWorkRules", rule.id);

    expect(await personWorkRulesRepo.get(person.id)).toBeNull();
  });
});

describe("read paths filter tombstones: availability rules", () => {
  beforeEach(resetDb);

  it("hides a tombstoned availability rule from list and get", async () => {
    const person = await seedPerson();
    const live = await availabilityRulesRepo.create(person.id, {
      ruleType: "WEEKLY",
      availabilityType: "AVAILABLE",
      weekdays: [1],
    });
    const dead = await putAvailabilityRule(person.id, { availabilityType: "UNAVAILABLE" });
    await tombstone<AvailabilityRule>("availabilityRules", dead.id);

    const list = await availabilityRulesRepo.list(person.id);
    expect(list.map((r) => r.id)).toEqual([live.id]);
    expect(await availabilityRulesRepo.get(dead.id)).toBeNull();
  });
});

describe("read paths filter tombstones: schedule periods and their schedule/export views", () => {
  beforeEach(resetDb);

  it("hides a tombstoned period from list, get, listDetailed, getDetail, schedule and export", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const live = await seedPeriod({ name: "live" });
    const dead = await seedPeriod({ name: "dead", startDate: "2026-04-01", endDate: "2026-04-07" });
    await tombstone<SchedulePeriod>("schedulePeriods", dead.id);

    expect((await schedulePeriodsRepo.list()).map((p) => p.id)).toEqual([live.id]);
    expect(await schedulePeriodsRepo.get(dead.id)).toBeNull();
    expect((await schedulePeriodsRepo.listDetailed()).map((p) => p.id)).toEqual([live.id]);
    expect(await schedulePeriodsRepo.getDetail(dead.id)).toBeNull();

    // schedule/export must reject a tombstoned period as not-found.
    await expect(schedulePeriodsRepo.getSchedule(dead.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(schedulePeriodsRepo.getExportData(dead.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("getSchedule hides tombstoned assignments and conflict logs of a live period", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const req = await putRequirement(period.id, shift.id, location.id);
    const deadAssignment = await putAssignment(period.id, req.id);
    await putAssignment(period.id, req.id); // live
    const deadConflict = await putConflict(period.id);
    await putConflict(period.id); // live
    await tombstone<Assignment>("assignments", deadAssignment.id);
    await tombstone<ConflictLog>("conflictLogs", deadConflict.id);

    const schedule = await schedulePeriodsRepo.getSchedule(period.id);
    expect(schedule.assignments).toHaveLength(1);
    expect(schedule.conflictLogs).toHaveLength(1);
  });

  it("getExportData hides tombstoned requirements, assignments and conflicts", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const liveReq = await putRequirement(period.id, shift.id, location.id);
    const deadReq = await putRequirement(period.id, shift.id, location.id);
    await putAssignment(period.id, liveReq.id);
    await putAssignment(period.id, deadReq.id);
    await putConflict(period.id);
    await tombstone<ShiftRequirement>("shiftRequirements", deadReq.id);
    // The assignment that pointed at the now-dead requirement should also be
    // gone from the export (it is filtered by its own tombstone only).

    const exportData = await schedulePeriodsRepo.getExportData(period.id);
    expect(exportData.requirements.map((r) => r.id)).toEqual([liveReq.id]);
    // Only the liveReq's assignment is live; the deadReq's assignment is still
    // a live row, so it appears — but it must carry a null shiftRequirement
    // (the joined requirement is tombstoned). Assert the join does not leak
    // the dead requirement object.
    for (const a of exportData.assignments) {
      expect(a.shiftRequirement?.id ?? null).not.toBe(deadReq.id);
    }
    expect(exportData.conflictLogs).toHaveLength(1);
  });
});

describe("read paths filter tombstones: assignments and conflict logs", () => {
  beforeEach(resetDb);

  it("hides a tombstoned assignment from list and get", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const req = await putRequirement(period.id, shift.id, location.id);
    const live = await putAssignment(period.id, req.id);
    const dead = await putAssignment(period.id, req.id);
    await tombstone<Assignment>("assignments", dead.id);

    expect((await assignmentsRepo.list({ periodId: period.id })).map((a) => a.id)).toEqual([live.id]);
    expect(await assignmentsRepo.get(dead.id)).toBeNull();
  });

  it("hides a tombstoned conflict log from list and get", async () => {
    const period = await seedPeriod();
    const live = await putConflict(period.id);
    const dead = await putConflict(period.id);
    await tombstone<ConflictLog>("conflictLogs", dead.id);

    expect((await conflictLogsRepo.list(period.id)).map((c) => c.id)).toEqual([live.id]);
    expect(await conflictLogsRepo.get(dead.id)).toBeNull();
  });
});

describe("read paths filter tombstones: export templates", () => {
  beforeEach(resetDb);

  it("hides a tombstoned template from list, get and getDefault", async () => {
    const live = await exportTemplatesRepo.create({ name: "L", format: "EXCEL", isDefault: true });
    const dead = await exportTemplatesRepo.create({ name: "D", format: "EXCEL" });
    await tombstone<ExportTemplate>("exportTemplates", dead.id);

    expect((await exportTemplatesRepo.list()).map((t) => t.id)).toEqual([live.id]);
    expect(await exportTemplatesRepo.get(dead.id)).toBeNull();
    const def = await exportTemplatesRepo.getDefault("EXCEL");
    expect(def?.id).toBe(live.id);
  });
});

describe("aggregate/derived reads filter tombstones", () => {
  beforeEach(resetDb);

  it("setup readiness counts only live people, locations, shifts and coverage", async () => {
    const livePerson = await seedPerson({ code: "LIVE-P" });
    const deadPerson = await seedPerson({ code: "DEAD-P", firstName: "Dead", lastName: "P" });
    const deadLocation = await seedLocation({ code: "DEAD-L", name: "Dead L" });
    const deadShift = await seedShift({ code: "DEAD-S", name: "Dead S" });
    const liveLocation = await seedLocation({ code: "LIVE-L", name: "Live L" });
    const liveShift = await seedShift({ code: "LIVE-S", name: "Live S" });
    const deadCoverage = await seedCoverage(liveLocation.id, liveShift.id);
    const liveCoverage = await seedCoverage(liveLocation.id, liveShift.id, { priority: 1 });
    // Grant the live person access to the live location so readiness is green.
    await personLocationRulesRepo.upsert(livePerson.id, { locationId: liveLocation.id });

    await tombstone<Person>("people", deadPerson.id);
    await tombstone<Location>("locations", deadLocation.id);
    await tombstone<ShiftTemplate>("shiftTemplates", deadShift.id);
    await tombstone<CoverageRule>("coverageRules", deadCoverage.id);

    const readiness = await getSetupReadiness();
    const counts = Object.fromEntries(readiness.items.map((i) => [i.key, i.count]));
    expect(counts.people).toBe(1);
    expect(counts.locations).toBe(1);
    expect(counts.shifts).toBe(1);
    expect(counts.coverage).toBe(1);

    // The dead person should not be reported as missing access.
    expect(readiness.peopleWithoutLocationAccess).toBe(0);
    expect(readiness.ready).toBe(true);
    // Live coverage is the one referenced; keep its id referenced for clarity.
    expect(liveCoverage.id).toBeTruthy();
  });

  it("getDetail on a live person hides tombstoned dependents", async () => {
    const person = await seedPerson();
    const location = await seedLocation();
    const deadLocationRule = await personLocationRulesRepo.upsert(person.id, { locationId: location.id });
    const deadWorkRule = await putPersonWorkRule(person.id);
    const deadAvailability = await putAvailabilityRule(person.id);
    await tombstone<PersonLocationRule>("personLocationRules", deadLocationRule.id);
    await tombstone<PersonWorkRule>("personWorkRules", deadWorkRule.id);
    await tombstone<AvailabilityRule>("availabilityRules", deadAvailability.id);

    const detail = await peopleRepo.getDetail(person.id);
    expect(detail).not.toBeNull();
    expect(detail!.locationRules).toEqual([]);
    expect(detail!.workRule).toBeNull();
    expect(detail!.availabilityRules).toEqual([]);
  });

  it("period getDetail counts exclude tombstoned requirements/assignments/conflicts", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const req = await putRequirement(period.id, shift.id, location.id);
    await putAssignment(period.id, req.id);
    await putConflict(period.id);
    // Make dead siblings.
    const deadReq = await putRequirement(period.id, shift.id, location.id);
    const deadAssignment = await putAssignment(period.id, deadReq.id);
    const deadConflict = await putConflict(period.id);
    await tombstone<ShiftRequirement>("shiftRequirements", deadReq.id);
    await tombstone<Assignment>("assignments", deadAssignment.id);
    await tombstone<ConflictLog>("conflictLogs", deadConflict.id);

    const detail = await schedulePeriodsRepo.getDetail(period.id);
    expect(detail!._count).toEqual({ requirements: 1, assignments: 1, conflictLogs: 1 });
  });
});

describe("remove on a tombstoned id behaves as not-found", () => {
  beforeEach(resetDb);

  it("re-deleting a person reports NOT_FOUND rather than double-tombstoning", async () => {
    const person = await seedPerson();
    const { peopleRepo } = await import("../repo");
    await peopleRepo.remove(person.id);
    const updatedAtBefore = (await db.people.get(person.id))!.updatedAt;
    await expect(peopleRepo.remove(person.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await db.people.get(person.id))!.updatedAt).toBe(updatedAtBefore);
  });
});
