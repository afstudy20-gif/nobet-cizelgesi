import { NextRequest, NextResponse } from "next/server";
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

    await prisma.assignment.deleteMany({
      where: {
        periodId,
        isLocked: false,
        shiftRequirementId: { notIn: [...lockedReqIdSet] },
      },
    });

    await prisma.shiftRequirement.deleteMany({
      where: {
        periodId,
        id: { notIn: [...lockedReqIdSet] },
      },
    });

    const days = eachCalendarDayInRange(period.startDate, period.endDate);

    let created = 0;

    for (const day of days) {
      for (const rule of coverageRules) {
        if (!coverageRuleMatchesDay(rule, day)) continue;

        await prisma.shiftRequirement.create({
          data: {
            periodId,
            date: normalizeCalendarDate(day),
            shiftTemplateId: rule.shiftTemplateId,
            locationId: rule.locationId,
            requiredHeadcount: rule.requiredHeadcount,
            roleRequirements: rule.roleRequirements ?? undefined,
            priority: rule.priority,
          },
        });
        created++;
      }
    }

    return NextResponse.json({ created, periodId });
  } catch (err) {
    console.error("[POST /api/periods/:id/requirements/generate]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}