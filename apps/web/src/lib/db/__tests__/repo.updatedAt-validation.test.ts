/**
 * `updatedAt` is the merge key for Drive sync. Every write must bump it
 * strictly, or the change is silently lost on the next pull (last-writer-wins
 * treats an equal timestamp as "no change"). Validation failures must reject
 * *before* anything is written — the table should still be empty.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  peopleRepo,
  locationsRepo,
  shiftTemplatesRepo,
  coverageRulesRepo,
  availabilityRulesRepo,
  exportTemplatesRepo,
  RepoError,
} from "../repo";
import { resetDb, rawCount, rawAll, seedPerson, seedLocation, seedShift } from "./helpers";
import type { Person } from "../types";

function expectValidation(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => {
      throw new Error("expected the write to throw VALIDATION_ERROR, but it succeeded");
    },
    (error: unknown) => {
      if (!(error instanceof RepoError) || error.code !== "VALIDATION_ERROR") {
        throw error;
      }
    }
  );
}

/** Accepts VALIDATION_ERROR or NOT_FOUND — both are pre-write rejections. */
function expectRejectedBeforeWrite(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => {
      throw new Error("expected the write to throw, but it succeeded");
    },
    (error: unknown) => {
      if (!(error instanceof RepoError) || (error.code !== "VALIDATION_ERROR" && error.code !== "NOT_FOUND")) {
        throw error;
      }
    }
  );
}

describe("updatedAt strictly increases on every write", () => {
  beforeEach(resetDb);

  it("bumps updatedAt when a person is updated", async () => {
    const person = await seedPerson({ code: "P1" });
    const original = person.updatedAt;
    await new Promise((r) => setTimeout(r, 5));

    const updated = await peopleRepo.update(person.id, { firstName: "Newname" });

    expect(updated.updatedAt).toBeGreaterThan(original);
    const stored = (await rawAll<Person>("people"))[0];
    expect(stored.updatedAt).toBeGreaterThan(original);
  });

  it("bumps updatedAt when a location is updated", async () => {
    const location = await seedLocation();
    await new Promise((r) => setTimeout(r, 5));
    const updated = await locationsRepo.update(location.id, { name: "Renamed" });
    expect(updated.updatedAt).toBeGreaterThan(location.updatedAt);
  });

  it("bumps updatedAt when a shift template is updated", async () => {
    const shift = await seedShift();
    await new Promise((r) => setTimeout(r, 5));
    const updated = await shiftTemplatesRepo.update(shift.id, { name: "Renamed" });
    expect(updated.updatedAt).toBeGreaterThan(shift.updatedAt);
  });

  it("bumps updatedAt when an assignment is locked/unlocked", async () => {
    const { assignmentsRepo } = await import("../repo");
    const { putRequirement, putAssignment, seedPeriod } = await import("./helpers");
    const shift = await seedShift();
    const location = await seedLocation();
    const period = await seedPeriod();
    const req = await putRequirement(period.id, shift.id, location.id);
    const assignment = await putAssignment(period.id, req.id);

    const original = assignment.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const locked = await assignmentsRepo.setLocked(assignment.id, true);
    expect(locked.updatedAt).toBeGreaterThan(original);
    expect(locked.isLocked).toBe(true);
  });

  it("bumps updatedAt when a tombstone is written on delete", async () => {
    const person = await seedPerson();
    const original = person.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await peopleRepo.remove(person.id);
    const stored = (await rawAll<Person>("people"))[0];
    expect(stored.deleted).toBe(1);
    expect(stored.updatedAt).toBeGreaterThan(original);
  });
});

describe("validation rejects before any write", () => {
  beforeEach(resetDb);

  it("rejects a person with an invalid email and writes nothing", async () => {
    await expectValidation(
      peopleRepo.create({
        code: "P1",
        firstName: "A",
        lastName: "B",
        email: "not-an-email",
        role: "ASISTAN",
        isActive: true,
      })
    );
    expect(await rawCount("people")).toBe(0);
  });

  it("rejects a person with an empty code and writes nothing", async () => {
    await expectValidation(
      peopleRepo.create({
        code: "",
        firstName: "A",
        lastName: "B",
        role: "ASISTAN",
        isActive: true,
      })
    );
    expect(await rawCount("people")).toBe(0);
  });

  it("rejects a shift template with a bad time format and writes nothing", async () => {
    await expectValidation(
      shiftTemplatesRepo.create({
        code: "S1",
        name: "Bad",
        startTime: "8am",
        endTime: "16:00",
        isActive: true,
      })
    );
    expect(await rawCount("shiftTemplates")).toBe(0);
  });

  it("rejects a coverage rule pointing at a nonexistent location and writes nothing", async () => {
    const shift = await seedShift();
    // The repo validates the FK reference and throws NOT_FOUND before writing.
    await expectRejectedBeforeWrite(
      coverageRulesRepo.create({
        locationId: "does-not-exist",
        shiftTemplateId: shift.id,
        ruleType: "WEEKLY",
        weekdays: [1],
        isActive: true,
      })
    );
    expect(await rawCount("coverageRules")).toBe(0);
  });

  it("rejects a coverage rule with a negative headcount and writes nothing", async () => {
    const location = await seedLocation();
    const shift = await seedShift();
    await expectValidation(
      coverageRulesRepo.create({
        locationId: location.id,
        shiftTemplateId: shift.id,
        ruleType: "WEEKLY",
        weekdays: [1],
        requiredHeadcount: -3,
        isActive: true,
      })
    );
    expect(await rawCount("coverageRules")).toBe(0);
  });

  it("rejects an availability rule with an unknown availabilityType and writes nothing", async () => {
    const person = await seedPerson();
    await expectValidation(
      availabilityRulesRepo.create(person.id, {
        ruleType: "WEEKLY",
        availabilityType: "MAYBE" as unknown as "AVAILABLE",
        weekdays: [1],
      })
    );
    expect(await rawCount("availabilityRules")).toBe(0);
  });

  it("rejects an export template with an unknown format enum and writes nothing", async () => {
    await expectValidation(
      exportTemplatesRepo.create({
        name: "X",
        format: "CSV" as unknown as "EXCEL",
      })
    );
    expect(await rawCount("exportTemplates")).toBe(0);
  });

  it("rejects a SchedulePeriod with endDate before startDate and writes nothing", async () => {
    const { schedulePeriodsRepo } = await import("../repo");
    await expectValidation(
      schedulePeriodsRepo.create({
        name: "bad",
        startDate: "2026-03-10",
        endDate: "2026-03-01",
      })
    );
    expect(await rawCount("schedulePeriods")).toBe(0);
  });
});
