import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eachCalendarDayInRange, coverageRuleMatchesDay, normalizeCalendarDate } from "@nobet/scheduler";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;

    const period = await prisma.schedulePeriod.findUnique({
      where: { id: periodId },
      select: { id: true, startDate: true, endDate: true },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    const coverageRules = await prisma.coverageRule.findMany({
      where: { isActive: true },
      include: {
        shiftTemplate: true,
        location: true,
      },
    });

    const lockedReqIds = await prisma.assignment.findMany({
      where: { periodId, isLocked: true },
      select: { shiftRequirementId: true },
      distinct: ["shiftRequirementId"],
    });
    const lockedReqIdSet = new Set(lockedReqIds.map((a) => a.shiftRequirementId));

    /**
     * Requirements referenced by a locked assignment survive the wipe below.
     * They must therefore be excluded from regeneration — otherwise every
     * locked day gains a second, identical requirement on each run and the
     * headcount for that day doubles (and doubles again on the next run).
     */
    const survivingRequirements = await prisma.shiftRequirement.findMany({
      where: { periodId, id: { in: [...lockedReqIdSet] } },
      select: { date: true, shiftTemplateId: true, locationId: true },
    });

    const requirementKey = (
      date: Date,
      shiftTemplateId: string,
      locationId: string
    ): string => `${date.toISOString()}|${shiftTemplateId}|${locationId}`;

    const existingKeys = new Set(
      survivingRequirements.map((r) => requirementKey(r.date, r.shiftTemplateId, r.locationId))
    );

    const days = eachCalendarDayInRange(period.startDate, period.endDate);

    const toCreate: Prisma.ShiftRequirementCreateManyInput[] = [];

    let skippedDuplicates = 0;

    for (const day of days) {
      const date = normalizeCalendarDate(day);

      for (const rule of coverageRules) {
        if (!coverageRuleMatchesDay(rule, day)) continue;

        const key = requirementKey(date, rule.shiftTemplateId, rule.locationId);

        // Covers both a surviving locked requirement and two overlapping
        // coverage rules that resolve to the same slot on the same day.
        if (existingKeys.has(key)) {
          skippedDuplicates++;
          continue;
        }

        existingKeys.add(key);
        toCreate.push({
          periodId,
          date,
          shiftTemplateId: rule.shiftTemplateId,
          locationId: rule.locationId,
          requiredHeadcount: rule.requiredHeadcount,
          roleRequirements: rule.roleRequirements ?? undefined,
          priority: rule.priority,
        });
      }
    }

    /**
     * Wipe and rebuild atomically. Previously the deletes were committed
     * before the (row-by-row) inserts began, so any failure in between left
     * the period with no requirements at all.
     */
    await prisma.$transaction([
      prisma.assignment.deleteMany({
        where: {
          periodId,
          isLocked: false,
          shiftRequirementId: { notIn: [...lockedReqIdSet] },
        },
      }),
      prisma.shiftRequirement.deleteMany({
        where: {
          periodId,
          id: { notIn: [...lockedReqIdSet] },
        },
      }),
      prisma.shiftRequirement.createMany({ data: toCreate }),
    ]);

    return NextResponse.json({
      created: toCreate.length,
      skippedDuplicates,
      preserved: survivingRequirements.length,
      periodId,
    });
  } catch (err) {
    console.error("[POST /api/periods/:id/requirements/generate]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}