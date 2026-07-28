/**
 * Snapshot build / merge / prune for the Drive sync layer.
 *
 * Invariants under test:
 *  - last-writer-wins by `updatedAt`; a remote record wins only if strictly
 *    newer. Equal timestamps must NOT flip-flop (the local copy wins ties).
 *  - tombstones are records like any other, so deletes propagate instead of
 *    resurrecting.
 *  - buildSnapshot includes tombstoned rows (otherwise deletes can't sync).
 *  - round trip: build → merge into an empty DB reproduces every row.
 *  - pruneTombstones removes only old tombstones, leaving live rows and recent
 *    tombstones intact.
 *
 * We use a single synced store ("people") as the representative case — merge
 * loops over every store identically, so a defect in the loop would surface
 * here. A couple of tests exercise multiple stores explicitly (round trip,
 * snapshot completeness).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { db, uid } from "../../db/db";
import { buildSnapshot, mergeSnapshot, pruneTombstones } from "../merge";
import type { Person, SyncMeta } from "../../db/types";

async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** A minimal live person row, written straight to the table. */
async function putPerson(overrides: Partial<Person> & { id: string }): Promise<Person> {
  const stamp = overrides.updatedAt ?? 1_000;
  const person: Person = {
    id: overrides.id,
    updatedAt: stamp,
    deleted: overrides.deleted,
    code: overrides.code ?? "C",
    firstName: overrides.firstName ?? "F",
    lastName: overrides.lastName ?? "L",
    fullName: overrides.fullName ?? "F L",
    phone: overrides.phone ?? null,
    email: overrides.email ?? null,
    role: overrides.role ?? "ASISTAN",
    isActive: overrides.isActive ?? true,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? new Date(stamp).toISOString(),
  };
  await db.people.put(person);
  return person;
}

function snapshotOf(stores: Record<string, SyncMeta[]>): { version: 1; exportedAt: string; stores: Record<string, SyncMeta[]> } {
  return { version: 1, exportedAt: "2026-03-01T00:00:00.000Z", stores };
}

describe("merge: last-writer-wins by updatedAt", () => {
  beforeEach(resetDb);

  it("applies a remote record that is strictly newer than the local one", async () => {
    await putPerson({ id: "p1", updatedAt: 1_000, code: "OLD" });
    const remote = snapshotOf({
      people: <Person[]>[{ ...(await db.people.get("p1")) as Person, code: "NEW", updatedAt: 2_000 }],
    });

    const stats = await mergeSnapshot(remote);

    expect(stats.applied).toBe(1);
    expect(stats.skipped).toBe(0);
    const merged = (await db.people.get("p1")) as Person;
    expect(merged.code).toBe("NEW");
    expect(merged.updatedAt).toBe(2_000);
  });

  it("skips a remote record with an older updatedAt (local wins)", async () => {
    await putPerson({ id: "p1", updatedAt: 2_000, code: "LOCAL" });
    const remote = snapshotOf({
      people: <Person[]>[{ ...(await db.people.get("p1")) as Person, code: "REMOTE", updatedAt: 1_000 }],
    });

    const stats = await mergeSnapshot(remote);

    expect(stats.applied).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(((await db.people.get("p1")) as Person).code).toBe("LOCAL");
  });

  it("skips a remote record with an equal updatedAt so two devices do not flip-flop", async () => {
    // Both devices wrote at the same millisecond. The merge must NOT overwrite
    // the local copy — otherwise each pull would swap the value back and forth.
    await putPerson({ id: "p1", updatedAt: 5_000, code: "LOCAL" });
    const remote = snapshotOf({
      people: <Person[]>[{ ...(await db.people.get("p1")) as Person, code: "REMOTE", updatedAt: 5_000 }],
    });

    const stats = await mergeSnapshot(remote);

    expect(stats.applied).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(((await db.people.get("p1")) as Person).code).toBe("LOCAL");
  });

  it("applies a remote record when the local one is absent", async () => {
    const remote = snapshotOf({
      people: <Person[]>[
        {
          id: "new-id",
          updatedAt: 3_000,
          code: "BRAND",
          firstName: "New",
          lastName: "Person",
          fullName: "New Person",
          phone: null,
          email: null,
          role: "ASISTAN",
          isActive: true,
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const stats = await mergeSnapshot(remote);

    expect(stats.applied).toBe(1);
    expect(((await db.people.get("new-id")) as Person).code).toBe("BRAND");
  });

  it("ignores an empty or missing store key in the snapshot", async () => {
    await putPerson({ id: "p1", updatedAt: 1_000, code: "LOCAL" });
    const stats = await mergeSnapshot(snapshotOf({ people: [] }));
    expect(stats).toEqual({ applied: 0, skipped: 0 });
    // A snapshot that omits the store entirely is also a no-op.
    const stats2 = await mergeSnapshot(snapshotOf({}));
    expect(stats2).toEqual({ applied: 0, skipped: 0 });
  });
});

describe("merge: tombstones propagate and survive", () => {
  beforeEach(resetDb);

  it("a newer remote tombstone deletes the local live row", async () => {
    await putPerson({ id: "p1", updatedAt: 1_000, code: "LIVE" });
    const remote = snapshotOf({
      people: <Person[]>[{ ...(await db.people.get("p1")) as Person, updatedAt: 2_000, deleted: 1 }],
    });

    await mergeSnapshot(remote);

    const merged = (await db.people.get("p1")) as Person;
    expect(merged.deleted).toBe(1);
    expect(merged.updatedAt).toBe(2_000);
  });

  it("a local tombstone is not resurrected by an older live remote row", async () => {
    await putPerson({ id: "p1", updatedAt: 5_000, deleted: 1, code: "DEAD" });
    const remote = snapshotOf({
      people: <Person[]>[{ ...(await db.people.get("p1")) as Person, updatedAt: 1_000, deleted: undefined, code: "ALIVE" }],
    });

    await mergeSnapshot(remote);

    const merged = (await db.people.get("p1")) as Person;
    expect(merged.deleted).toBe(1);
    expect(merged.code).toBe("DEAD");
  });

  it("a newer live remote row can revive a locally tombstoned row", async () => {
    // Deleted on device A, then re-created (new id, but here same id) on device
    // B later. The newer live state wins — this is the intended undo path.
    await putPerson({ id: "p1", updatedAt: 1_000, deleted: 1, code: "DEAD" });
    const remote = snapshotOf({
      people: <Person[]>[{ ...(await db.people.get("p1")) as Person, updatedAt: 5_000, deleted: undefined, code: "REVIVED" }],
    });

    await mergeSnapshot(remote);

    const merged = (await db.people.get("p1")) as Person;
    expect(merged.deleted).toBeUndefined();
    expect(merged.code).toBe("REVIVED");
  });
});

describe("buildSnapshot includes tombstones", () => {
  beforeEach(resetDb);

  it("serializes live and tombstoned rows together", async () => {
    await putPerson({ id: "live", updatedAt: 1_000, code: "LIVE" });
    await putPerson({ id: "dead", updatedAt: 1_000, code: "DEAD", deleted: 1 });

    const snapshot = await buildSnapshot();

    const people = snapshot.stores.people as Person[];
    expect(people.map((p) => p.id).sort()).toEqual(["dead", "live"]);
    expect(people.find((p) => p.id === "dead")?.deleted).toBe(1);
  });

  it("emits every synced store, even when empty", async () => {
    const snapshot = await buildSnapshot();
    const expected = [
      "people",
      "locations",
      "shiftTemplates",
      "coverageRules",
      "personLocationRules",
      "personWorkRules",
      "availabilityRules",
      "schedulePeriods",
      "shiftRequirements",
      "assignments",
      "conflictLogs",
      "exportTemplates",
    ];
    expect(Object.keys(snapshot.stores).sort()).toEqual(expected.sort());
  });
});

describe("round trip: build then merge into an empty DB", () => {
  beforeEach(resetDb);

  it("reproduces every row identically, across multiple stores", async () => {
    // Populate a source DB with live + tombstoned rows in several stores.
    await putPerson({ id: "p1", updatedAt: 1_000, code: "A" });
    await putPerson({ id: "p2", updatedAt: 2_000, code: "B", deleted: 1 });
    const location = {
      id: "l1", updatedAt: 3_000, code: "L", name: "Acil",
      address: null, isActive: true, notes: null,
    };
    await db.locations.put(location);

    const snapshot = await buildSnapshot();

    // Wipe and rebuild into a fresh DB, then merge the snapshot.
    await resetDb();
    const stats = await mergeSnapshot(snapshot);

    expect(stats.applied).toBe(3);
    expect(((await db.people.get("p1")) as Person).code).toBe("A");
    expect(((await db.people.get("p2")) as Person).deleted).toBe(1);
    expect(await db.locations.get("l1")).toEqual(location);
  });

  it("merging a snapshot built from an empty DB into a full DB leaves it unchanged when timestamps tie", async () => {
    // Edge case: round-tripping the *same* data should be a no-op because every
    // record ties its own updatedAt.
    await putPerson({ id: "p1", updatedAt: 1_000, code: "A" });
    const snapshot = await buildSnapshot();

    const stats = await mergeSnapshot(snapshot);

    expect(stats.applied).toBe(0);
    expect(stats.skipped).toBe(1);
  });
});

describe("pruneTombstones", () => {
  beforeEach(resetDb);

  it("removes only tombstoned rows older than the cutoff", async () => {
    const now = Date.now();
    // old tombstone → pruned
    await putPerson({ id: "old-dead", updatedAt: now - 60 * 24 * 60 * 60 * 1000, deleted: 1, code: "OD" });
    // recent tombstone → kept
    await putPerson({ id: "new-dead", updatedAt: now - 1_000, deleted: 1, code: "ND" });
    // old live row → kept
    await putPerson({ id: "old-live", updatedAt: now - 60 * 24 * 60 * 60 * 1000, code: "OL" });

    const purged = await pruneTombstones(30 * 24 * 60 * 60 * 1000);

    expect(purged).toBe(1);
    expect(await db.people.get("old-dead")).toBeUndefined();
    expect(((await db.people.get("new-dead")) as Person).deleted).toBe(1);
    expect(((await db.people.get("old-live")) as Person).deleted).toBeUndefined();
  });

  it("keeps everything when the cutoff is the default 30 days and nothing is that old", async () => {
    await putPerson({ id: "dead", updatedAt: Date.now() - 1_000, deleted: 1, code: "D" });
    await putPerson({ id: "live", updatedAt: Date.now() - 1_000, code: "L" });

    const purged = await pruneTombstones();

    expect(purged).toBe(0);
    expect(await db.people.count()).toBe(2);
  });

  it("returns 0 on an empty database", async () => {
    expect(await pruneTombstones(1)).toBe(0);
  });
});

// Keep `uid` referenced: it documents that fresh ids are available for any
// future test that builds records inline.
void uid;
