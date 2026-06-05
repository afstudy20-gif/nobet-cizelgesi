import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [
      personUpdate,
      personCreate,
      availCreate,
      periodUpdate,
      periodCreate,
      assignUpdate,
      assignCreate,
      conflictCreate,
    ] = await Promise.all([
      prisma.person.aggregate({ _max: { updatedAt: true } }),
      prisma.person.aggregate({ _max: { createdAt: true } }),
      prisma.availabilityRule.aggregate({ _max: { createdAt: true } }),
      prisma.schedulePeriod.aggregate({ _max: { updatedAt: true } }),
      prisma.schedulePeriod.aggregate({ _max: { createdAt: true } }),
      prisma.assignment.aggregate({ _max: { updatedAt: true } }),
      prisma.assignment.aggregate({ _max: { createdAt: true } }),
      prisma.conflictLog.aggregate({ _max: { createdAt: true } }),
    ]);

    const dates = [
      personUpdate._max.updatedAt,
      personCreate._max.createdAt,
      availCreate._max.createdAt,
      periodUpdate._max.updatedAt,
      periodCreate._max.createdAt,
      assignUpdate._max.updatedAt,
      assignCreate._max.createdAt,
      conflictCreate._max.createdAt,
    ].filter(Boolean) as Date[];

    const lastModified = dates.length > 0 ? Math.max(...dates.map((d) => d.getTime())) : 0;

    return NextResponse.json({ lastModified });
  } catch (err) {
    console.error("[GET /api/sync/status]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
