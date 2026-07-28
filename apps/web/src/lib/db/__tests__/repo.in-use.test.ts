/**
 * Restraint deletes. A Location or ShiftTemplate that is still referenced by a
 * rule or requirement must refuse with `RepoError("IN_USE")`, and — because
 * the delete runs inside a transaction — must leave every table untouched.
 *
 * The "DB untouched after the failed attempt" assertion is the one that
 * catches a check that throws *after* it has already tombstoned some rows.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RepoError } from "../repo";
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
  putPersonLocationRule,
  putAvailabilityRule,
} from "./helpers";
import type { Location, ShiftTemplate } from "../types";

function expectInUse(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => {
      throw new Error("expected the delete to throw IN_USE, but it succeeded");
    },
    (error: unknown) => {
      if (!(error instanceof RepoError) || error.code !== "IN_USE") {
        throw error;
      }
    }
  );
}

describe("restraint deletes", () => {
  beforeEach(resetDb);

  it("refuses to delete a location referenced by a coverage rule and leaves the DB untouched", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    await seedCoverage(location.id, shift.id);
    const original = await rawGet<Location>("locations", location.id);
    const { locationsRepo } = await import("../repo");

    await expectInUse(locationsRepo.remove(location.id));

    const after = await rawGet<Location>("locations", location.id);
    expect(after).toEqual(original); // unchanged, including updatedAt and deleted
    expect((await rawAll("coverageRules"))).toHaveLength(1);
  });

  it("refuses to delete a location referenced by a person location rule", async () => {
    // Create the person before any location exists, so peopleRepo.create does
    // not auto-grant a rule and the count stays deterministic at one.
    const person = await seedPerson();
    const location = await seedLocation();
    await putPersonLocationRule(person.id, location.id);
    const { locationsRepo } = await import("../repo");

    await expectInUse(locationsRepo.remove(location.id));

    expect((await rawGet<Location>("locations", location.id))?.deleted).toBeUndefined();
    expect((await rawAll("personLocationRules"))).toHaveLength(1);
  });

  it("refuses to delete a location referenced by an availability rule", async () => {
    const person = await seedPerson();
    const location = await seedLocation();
    await putAvailabilityRule(person.id, { locationId: location.id });
    const { locationsRepo } = await import("../repo");

    await expectInUse(locationsRepo.remove(location.id));

    expect((await rawGet<Location>("locations", location.id))?.deleted).toBeUndefined();
  });

  it("refuses to delete a location referenced by a shift requirement", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    const period = await seedPeriod();
    await putRequirement(period.id, shift.id, location.id);
    const { locationsRepo } = await import("../repo");

    await expectInUse(locationsRepo.remove(location.id));

    expect((await rawGet<Location>("locations", location.id))?.deleted).toBeUndefined();
  });

  it("refuses to delete a location that a shift template uses as its default", async () => {
    const location = await seedLocation();
    await seedShift({ defaultLocationId: location.id });
    const { locationsRepo } = await import("../repo");

    await expectInUse(locationsRepo.remove(location.id));

    expect((await rawGet<Location>("locations", location.id))?.deleted).toBeUndefined();
  });

  it("refuses to delete a shift template referenced by a coverage rule", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    await seedCoverage(location.id, shift.id);
    const { shiftTemplatesRepo } = await import("../repo");

    await expectInUse(shiftTemplatesRepo.remove(shift.id));

    expect((await rawGet<ShiftTemplate>("shiftTemplates", shift.id))?.deleted).toBeUndefined();
  });

  it("refuses to delete a shift template referenced by a shift requirement", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    const period = await seedPeriod();
    await putRequirement(period.id, shift.id, location.id);
    const { shiftTemplatesRepo } = await import("../repo");

    await expectInUse(shiftTemplatesRepo.remove(shift.id));

    expect((await rawGet<ShiftTemplate>("shiftTemplates", shift.id))?.deleted).toBeUndefined();
  });

  it("deletes a location once every reference is gone", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    const rule = await seedCoverage(location.id, shift.id);
    const { locationsRepo, coverageRulesRepo } = await import("../repo");

    // Now referenced → refuses.
    await expectInUse(locationsRepo.remove(location.id));
    // Remove the reference → succeeds and tombstones.
    await coverageRulesRepo.remove(rule.id);
    await locationsRepo.remove(location.id);

    expect((await rawGet<Location>("locations", location.id))?.deleted).toBe(1);
  });
});
