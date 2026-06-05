import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [
      people,
      locations,
      shiftTemplates,
      coverageRules,
      personLocationRules,
      personWorkRules,
      availabilityRules,
      schedulePeriods,
      shiftRequirements,
      assignments,
      conflictLogs,
    ] = await Promise.all([
      prisma.person.findMany(),
      prisma.location.findMany(),
      prisma.shiftTemplate.findMany(),
      prisma.coverageRule.findMany(),
      prisma.personLocationRule.findMany(),
      prisma.personWorkRule.findMany(),
      prisma.availabilityRule.findMany(),
      prisma.schedulePeriod.findMany(),
      prisma.shiftRequirement.findMany(),
      prisma.assignment.findMany(),
      prisma.conflictLog.findMany(),
    ]);

    // Calculate maximum date from retrieved records
    const dates = [
      ...people.map((p) => p.updatedAt),
      ...people.map((p) => p.createdAt),
      ...availabilityRules.map((a) => a.createdAt),
      ...schedulePeriods.map((s) => s.updatedAt),
      ...schedulePeriods.map((s) => s.createdAt),
      ...assignments.map((a) => a.updatedAt),
      ...assignments.map((a) => a.createdAt),
      ...conflictLogs.map((c) => c.createdAt),
    ].filter(Boolean) as Date[];

    const lastModified = dates.length > 0 ? Math.max(...dates.map((d) => d.getTime())) : 0;

    return NextResponse.json({
      version: 1,
      lastModified,
      data: {
        people,
        locations,
        shiftTemplates,
        coverageRules,
        personLocationRules,
        personWorkRules,
        availabilityRules,
        schedulePeriods,
        shiftRequirements,
        assignments,
        conflictLogs,
      },
    });
  } catch (err) {
    console.error("[GET /api/sync/export]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
