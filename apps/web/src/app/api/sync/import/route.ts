import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BackupSchema, type BackupData } from "@/lib/sync/backup-schema";

export const dynamic = "force-dynamic";

/**
 * Restoring a full backup wipes every table before repopulating it, so the
 * whole thing runs in one transaction: a failure part-way must not leave the
 * database empty. The default interactive-transaction timeout of 5s is far too
 * short for that.
 */
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

/** Rejected before the body is read, so an oversized payload is never parsed. */
const MAX_BODY_BYTES = 200 * 1024 * 1024;

/**
 * One restore at a time.
 *
 * Two concurrent restores each hold a 2-minute transaction that deletes and
 * repopulates every table; they contend on row locks until one times out and
 * rolls back. A double-clicked "restore" button is enough to trigger it.
 */
let restoreInProgress = false;

async function restore(data: BackupData): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // Children first, so no delete is blocked by a foreign key.
      await tx.conflictLog.deleteMany();
      await tx.assignment.deleteMany();
      await tx.shiftRequirement.deleteMany();
      await tx.schedulePeriod.deleteMany();
      await tx.availabilityRule.deleteMany();
      await tx.personWorkRule.deleteMany();
      await tx.personLocationRule.deleteMany();
      await tx.coverageRule.deleteMany();
      await tx.shiftTemplate.deleteMany();
      await tx.location.deleteMany();
      await tx.person.deleteMany();

      // Parents first, so every foreign key has something to point at.
      if (data.people.length) await tx.person.createMany({ data: data.people });
      if (data.locations.length) await tx.location.createMany({ data: data.locations });
      if (data.shiftTemplates.length)
        await tx.shiftTemplate.createMany({ data: data.shiftTemplates });
      if (data.coverageRules.length)
        await tx.coverageRule.createMany({ data: data.coverageRules });
      if (data.personLocationRules.length)
        await tx.personLocationRule.createMany({ data: data.personLocationRules });
      if (data.personWorkRules.length)
        await tx.personWorkRule.createMany({ data: data.personWorkRules });
      if (data.availabilityRules.length)
        await tx.availabilityRule.createMany({ data: data.availabilityRules });
      if (data.schedulePeriods.length)
        await tx.schedulePeriod.createMany({ data: data.schedulePeriods });
      if (data.shiftRequirements.length)
        await tx.shiftRequirement.createMany({ data: data.shiftRequirements });
      if (data.assignments.length) await tx.assignment.createMany({ data: data.assignments });
      if (data.conflictLogs.length) await tx.conflictLog.createMany({ data: data.conflictLogs });

      // Version 1 backups carry no export templates at all. Absent means "this
      // backup says nothing about them", not "delete them" — so the table is
      // only touched when the key is actually present.
      if (data.exportTemplates) {
        await tx.exportTemplate.deleteMany();

        if (data.exportTemplates.length) {
          await tx.exportTemplate.createMany({ data: data.exportTemplates });
        }
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS }
  );
}

export async function POST(req: NextRequest) {
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");

    if (declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Backup is too large" } },
        { status: 413 }
      );
    }

    if (restoreInProgress) {
      return NextResponse.json(
        { error: { code: "RESTORE_IN_PROGRESS", message: "A restore is already running" } },
        { status: 409 }
      );
    }

    let payload: unknown;

    try {
      payload = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Body is not valid JSON" } },
        { status: 400 }
      );
    }

    const parsed = BackupSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid backup payload",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { data } = parsed.data;

    restoreInProgress = true;

    try {
      await restore(data);
    } finally {
      restoreInProgress = false;
    }

    const restored = Object.fromEntries(
      Object.entries(data).map(([table, rows]) => [table, rows?.length ?? 0])
    );

    return NextResponse.json({ success: true, restored });
  } catch (err) {
    // Never surface the raw message: Prisma errors carry table, column and
    // constraint names, and sometimes row values.
    console.error("[POST /api/sync/import]", err);

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
