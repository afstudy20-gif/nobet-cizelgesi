/**
 * Uniqueness. The Dexie schema declares `&code` on people/locations/shift
 * templates and `&personId` on work rules. A second row violating one of these
 * must surface as `RepoError("DUPLICATE", …)` — never as a raw Dexie
 * `ConstraintError` leaking out of the repository.
 *
 * Note on personWorkRules: the public API is `personWorkRulesRepo.put`, which
 * always reuses the existing row id (including a tombstoned one) via an
 * upsert. That means a DUPLICATE is structurally unreachable through the
 * public path. We assert the observable contract — that calling `put` twice
 * for the same person yields exactly one row, not an error and not two rows —
 * rather than forcing an error the API cannot produce.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  peopleRepo,
  locationsRepo,
  shiftTemplatesRepo,
  personWorkRulesRepo,
  RepoError,
} from "../repo";
import { resetDb, rawAll, rawCount, seedPerson } from "./helpers";
import type { PersonWorkRule } from "../types";

function expectDuplicate(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => {
      throw new Error("expected the write to throw DUPLICATE, but it succeeded");
    },
    (error: unknown) => {
      if (!(error instanceof RepoError) || error.code !== "DUPLICATE") {
        throw error;
      }
    }
  );
}

describe("uniqueness surfaces as RepoError(DUPLICATE)", () => {
  beforeEach(resetDb);

  it("rejects a second person with the same code", async () => {
    await peopleRepo.create({
      code: "DUP",
      firstName: "First",
      lastName: "Person",
      role: "ASISTAN",
      isActive: true,
    });

    await expectDuplicate(
      peopleRepo.create({
        code: "DUP",
        firstName: "Second",
        lastName: "Person",
        role: "ASISTAN",
        isActive: true,
      })
    );
    // The rejected row must not have been written.
    expect(await rawCount("people")).toBe(1);
  });

  it("rejects a person code collision even after the original was soft-deleted", async () => {
    // The Dexie unique index sees tombstoned rows too. This documents that
    // constraint: reusing a deleted person's code is rejected until the
    // tombstone is hard-pruned.
    const first = await seedPerson({ code: "DUP" });
    await peopleRepo.remove(first.id);

    await expectDuplicate(
      peopleRepo.create({
        code: "DUP",
        firstName: "Second",
        lastName: "Person",
        role: "ASISTAN",
        isActive: true,
      })
    );
  });

  it("rejects renaming a person onto another person's code", async () => {
    const a = await seedPerson({ code: "A" });
    await seedPerson({ code: "B" });

    await expectDuplicate(peopleRepo.update(a.id, { code: "B" }));
  });

  it("rejects a second location with the same code", async () => {
    await locationsRepo.create({ code: "DUP", name: "One", isActive: true });

    await expectDuplicate(
      locationsRepo.create({ code: "DUP", name: "Two", isActive: true })
    );
    expect(await rawCount("locations")).toBe(1);
  });

  it("rejects a second shift template with the same code", async () => {
    await shiftTemplatesRepo.create({
      code: "DUP",
      name: "One",
      startTime: "08:00",
      endTime: "16:00",
      isActive: true,
    });

    await expectDuplicate(
      shiftTemplatesRepo.create({
        code: "DUP",
        name: "Two",
        startTime: "08:00",
        endTime: "16:00",
        isActive: true,
      })
    );
    expect(await rawCount("shiftTemplates")).toBe(1);
  });
});

describe("personWorkRules stays one-row-per-person through put()", () => {
  beforeEach(resetDb);

  it("calling put twice for the same person keeps a single row", async () => {
    const person = await seedPerson();

    await personWorkRulesRepo.put(person.id, { minRestHoursBetweenAssignments: 12 });
    await personWorkRulesRepo.put(person.id, { minRestHoursBetweenAssignments: 24 });

    const rows = await rawAll<PersonWorkRule>("personWorkRules");
    expect(rows).toHaveLength(1);
    expect(rows[0].minRestHoursBetweenAssignments).toBe(24);
  });

  it("put after a tombstone revives the same row instead of creating a second", async () => {
    const person = await seedPerson();
    await personWorkRulesRepo.put(person.id, { minRestHoursBetweenAssignments: 12 });
    await personWorkRulesRepo.remove(person.id);
    await personWorkRulesRepo.put(person.id, { minRestHoursBetweenAssignments: 24 });

    const rows = await rawAll<PersonWorkRule>("personWorkRules");
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted).toBeUndefined();
    expect(rows[0].minRestHoursBetweenAssignments).toBe(24);
  });
});
