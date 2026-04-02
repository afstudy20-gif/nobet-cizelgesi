import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  eachDayOfInterval,
  getISODay,
  isWithinInterval,
  startOfDay,
} from "date-fns";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;

    // 1. Load the period
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

    // 2. Load all active CoverageRules with shiftTemplate and location
    const coverageRules = await prisma.coverageRule.findMany({
      where: { isActive: true },
      include: {
        shiftTemplate: true,
        location: true,
      },
    });

    // 3. Delete existing non-locked requirements (and their non-locked assignments)
    //    Cascade is: ShiftRequirement → Assignment (onDelete: Cascade)
    //    We need to delete only non-locked ones, so delete non-locked assignments first,
    //    then requirements that have no more locked assignments (i.e., non-locked requirements).
    //    A "locked requirement" means it has at least one locked assignment — skip those.

    // Get requirement IDs that have at least one locked assignment
    const lockedReqIds = await prisma.assignment.findMany({
      where: { periodId, isLocked: true },
      select: { shiftRequirementId: true },
      distinct: ["shiftRequirementId"],
    });
    const lockedReqIdSet = new Set(lockedReqIds.map((a) => a.shiftRequirementId));

    // Delete non-locked assignments for non-locked requirements
    await prisma.assignment.deleteMany({
      where: {
        periodId,
        isLocked: false,
        shiftRequirementId: { notIn: [...lockedReqIdSet] },
      },
    });

    // Delete non-locked requirements (those without locked assignments)
    await prisma.shiftRequirement.deleteMany({
      where: {
        periodId,
        id: { notIn: [...lockedReqIdSet] },
      },
    });

    // 4. Generate requirements for each day in the period range
    const days = eachDayOfInterval({
      start: startOfDay(period.startDate),
      end: startOfDay(period.endDate),
    });

    let created = 0;

    for (const day of days) {
      const isoWeekday = getISODay(day); // 1=Monday … 7=Sunday
      const dayStart = startOfDay(day);

      for (const rule of coverageRules) {
        let matches = false;

        if (rule.ruleType === "WEEKLY") {
          matches = rule.weekdays.includes(isoWeekday);
        } else if (rule.ruleType === "SPECIFIC_DATE") {
          if (rule.specificDate != null) {
            matches =
              startOfDay(rule.specificDate).getTime() === dayStart.getTime();
          }
        } else if (rule.ruleType === "DATE_RANGE") {
          if (rule.validFrom != null && rule.validTo != null) {
            const withinRange = isWithinInterval(dayStart, {
              start: startOfDay(rule.validFrom),
              end: startOfDay(rule.validTo),
            });
            // If weekdays array is non-empty, check weekday; otherwise all days match
            const weekdayMatches =
              rule.weekdays.length === 0 || rule.weekdays.includes(isoWeekday);
            matches = withinRange && weekdayMatches;
          }
        }

        if (!matches) continue;

        // Create one ShiftRequirement per (date, shiftTemplate, location, headcount)
        await prisma.shiftRequirement.create({
          data: {
            periodId,
            date: dayStart,
            shiftTemplateId: rule.shiftTemplateId,
            locationId: rule.locationId,
            requiredHeadcount: rule.requiredHeadcount,
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
