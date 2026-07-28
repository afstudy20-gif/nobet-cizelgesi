import { db, SYNCED_STORES } from "../db/db";
import type { SyncMeta } from "../db/types";

/**
 * Snapshot + last-writer-wins merge for the local-first DB.
 *
 * The whole database is serialized as one JSON file on Drive. A pull does not
 * replace local data wholesale: each record is merged by primary key, and the
 * remote copy wins only when it is strictly newer. Tombstones (`deleted`) are
 * records like any other, so deletes propagate across devices instead of
 * resurrecting on the next pull.
 *
 * `SYNCED_STORES` is the single source of truth for which tables sync; it is
 * declared next to the Dexie schema in `lib/db/db.ts`.
 */

export interface Snapshot {
  version: 1;
  exportedAt: string;
  stores: Record<string, SyncMeta[]>;
}

export interface MergeStats {
  applied: number;
  skipped: number;
}

/** Serialize every synced store — including tombstones — into one snapshot. */
export async function buildSnapshot(): Promise<Snapshot> {
  const stores: Record<string, SyncMeta[]> = {};
  for (const name of SYNCED_STORES) {
    stores[name] = (await db.table(name).toArray()) as SyncMeta[];
  }
  return { version: 1, exportedAt: new Date().toISOString(), stores };
}

/**
 * Merge a remote snapshot into the local DB using last-writer-wins by
 * `updatedAt`. A remote record wins only if it is strictly newer than the local
 * one (or the local one is absent); equal timestamps never flip-flop between
 * devices. Each store merges inside one read/write transaction.
 */
export async function mergeSnapshot(remote: Snapshot): Promise<MergeStats> {
  let applied = 0;
  let skipped = 0;

  for (const name of SYNCED_STORES) {
    const incoming = remote.stores[name];
    if (!incoming || incoming.length === 0) continue;
    const table = db.table(name);

    await db.transaction("rw", table, async () => {
      for (const rec of incoming) {
        const local = (await table.get(rec.id)) as SyncMeta | undefined;
        if (!local || rec.updatedAt > local.updatedAt) {
          await table.put(rec);
          applied++;
        } else {
          skipped++;
        }
      }
    });
  }

  return { applied, skipped };
}

/**
 * Hard-delete tombstoned rows (`deleted === 1`) older than `maxAgeMs`, so the
 * snapshot does not grow forever once a delete has propagated everywhere.
 * Returns the number of rows purged.
 */
export async function pruneTombstones(
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let purged = 0;
  for (const name of SYNCED_STORES) {
    const table = db.table(name);
    const rows = (await table.toArray()) as SyncMeta[];
    const toDelete = rows
      .filter((r) => r.deleted === 1 && r.updatedAt < cutoff)
      .map((r) => r.id);
    if (toDelete.length) {
      await table.bulkDelete(toDelete);
      purged += toDelete.length;
    }
  }
  return purged;
}
