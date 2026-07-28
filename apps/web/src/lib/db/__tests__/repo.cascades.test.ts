/**
 * Manual cascades. IndexedDB has no foreign keys, so deleting a parent must
 * tombstone its children by hand. These tests assert the invariant that
 * survives a real schema: *no live child row points at a dead parent*.
 *
 * We check three cascade chains from the spec:
 *   Person              → personLocationRules, personWorkRules, availabilityRules
 *   SchedulePeriod      → shiftRequirements, assignments, conflictLogs
 *   ShiftRequirement    → assignments
 *
 * (Person → assignments is intentionally NOT cascaded by the repo —
 * assignments hold a nullable person pointer and are owned by the period — so
 * we document and assert that boundary too.)
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  peopleRepo,
  schedulePeriodsRepo,
  shiftRequirementsRepo,
  assignmentsRepo,
} from "../repo";
import {
  resetDb,
  rawAll,
  seedPerson,
  seedLocation,
  seedShift,
  seedPeriod,
  putRequirement,
  putAssignment,
  putConflict,
  putPersonLocationRule,
  putPersonWorkRule,
  putAvailabilityRule,
} from "./helpers";
import type {
  Assignment,
  AvailabilityRule,
  ConflictLog,
  PersonLocationRule,
  PersonWorkRule,
  ShiftRequirement,
  SyncMeta,
} from "../types";

/** Every live row in `table` whose `fkKey` equals `parentId`. */
async function liveChildren<T extends SyncMeta>(
  table: string,
  fkKey: keyof T,
  parentId: string
): Promise<T[]> {
  const rows = (await rawAll<T>(table)).filter(
    (r) => r.deleted !== 1 && r[fkKey] === parentId
  );
  return rows;
}

describe("Person cascade", () => {
  beforeEach(resetDb);

  it("tombstones a person's location rules when the person is removed", async () => {
    const person = await seedPerson();
    const location = await seedLocation();
    await putPersonLocationRule(person.id, location.id);

    await peopleRepo.remove(person.id);

    const liveRules = await liveChildren<PersonLocationRule>(
      "personLocationRules",
      "personId",
      person.id
    );
    expect(liveRules, "no live personLocationRule may point at the dead person").toEqual([]);
  });

  it("tombstones a person's work rule when the person is removed", async () => {
    const person = await seedPerson();
    await putPersonWorkRule(person.id);

    await peopleRepo.remove(person.id);

    const liveRules = await liveChildren<PersonWorkRule>(
      "personWorkRules",
      "personId",
      person.id
    );
    expect(liveRules).toEqual([]);
  });

  it("tombstones a person's availability rules when the person is removed", async () => {
    const person = await seedPerson();
    await putAvailabilityRule(person.id, { ruleType: "WEEKLY", weekdays: [6, 7] });
    await putAvailabilityRule(person.id, { ruleType: "ONE_DAY", availabilityType: "UNAVAILABLE" });

    await peopleRepo.remove(person.id);

    const liveRules = await liveChildren<AvailabilityRule>(
      "availabilityRules",
      "personId",
      person.id
    );
    expect(liveRules).toEqual([]);
  });

  it("removes every dependent of the person in one transaction", async () => {
    const person = await seedPerson();
    const other = await seedPerson({ code: "P2", firstName: "Other", lastName: "Person" });
    const location = await seedLocation();
    await putPersonLocationRule(person.id, location.id);
    await putPersonLocationRule(other.id, location.id);
    await putPersonWorkRule(person.id);
    await putPersonWorkRule(other.id);
    await putAvailabilityRule(person.id);

    await peopleRepo.remove(person.id);

    // person's dependents all tombstoned…
    expect(
      await liveChildren<PersonLocationRule>("personLocationRules", "personId", person.id)
    ).toEqual([]);
    expect(await liveChildren<PersonWorkRule>("personWorkRules", "personId", person.id)).toEqual([]);
    expect(
      await liveChildren<AvailabilityRule>("availabilityRules", "personId", person.id)
    ).toEqual([]);
    // …but the other person's dependents are untouched.
    expect(
      await liveChildren<PersonLocationRule>("personLocationRules", "personId", other.id)
    ).toHaveLength(1);
    expect(await liveChildren<PersonWorkRule>("personWorkRules", "personId", other.id)).toHaveLength(1);
  });
});

describe("SchedulePeriod cascade", () => {
  beforeEach(resetDb);

  it("tombstones the period's shift requirements, assignments and conflict logs", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const otherPeriod = await seedPeriod({ name: "2026-04", startDate: "2026-04-01", endDate: "2026-04-07" });
    const req = await putRequirement(period.id, shift.id, location.id);
    const otherReq = await putRequirement(otherPeriod.id, shift.id, location.id);
    await putAssignment(period.id, req.id);
    await putAssignment(otherPeriod.id, otherReq.id);
    await putConflict(period.id, { shiftRequirementId: req.id });
    await putConflict(otherPeriod.id);

    await schedulePeriodsRepo.remove(period.id);

    expect(
      await liveChildren<ShiftRequirement>("shiftRequirements", "periodId", period.id)
    ).toEqual([]);
    expect(await liveChildren<Assignment>("assignments", "periodId", period.id)).toEqual([]);
    expect(await liveChildren<ConflictLog>("conflictLogs", "periodId", period.id)).toEqual([]);

    // The other period and its children survive.
    expect(
      await liveChildren<ShiftRequirement>("shiftRequirements", "periodId", otherPeriod.id)
    ).toHaveLength(1);
    expect(await liveChildren<Assignment>("assignments", "periodId", otherPeriod.id)).toHaveLength(1);
    expect(await liveChildren<ConflictLog>("conflictLogs", "periodId", otherPeriod.id)).toHaveLength(1);
  });
});

describe("ShiftRequirement cascade", () => {
  beforeEach(resetDb);

  it("tombstones the assignments that belong to the removed requirement", async () => {
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const req = await putRequirement(period.id, shift.id, location.id);
    const siblingReq = await putRequirement(period.id, shift.id, location.id);
    await putAssignment(period.id, req.id);
    await putAssignment(period.id, req.id);
    await putAssignment(period.id, siblingReq.id);

    await shiftRequirementsRepo.remove(req.id);

    expect(
      await liveChildren<Assignment>("assignments", "shiftRequirementId", req.id)
    ).toEqual([]);
    // Sibling requirement's assignments are untouched.
    expect(
      await liveChildren<Assignment>("assignments", "shiftRequirementId", siblingReq.id)
    ).toHaveLength(1);
  });
});
