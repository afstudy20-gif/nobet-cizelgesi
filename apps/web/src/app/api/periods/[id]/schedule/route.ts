import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;

    const period = await prisma.schedulePeriod.findUnique({
      where: { id: periodId },
      select: { id: true },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    const [assignments, conflictLogs] = await Promise.all([
      prisma.assignment.findMany({
        where: { periodId },
        include: {
          person: {
            select: {
              id: true,
              code: true,
              fullName: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          shiftRequirement: {
            include: {
              shiftTemplate: true,
              location: true,
            },
          },
        },
        orderBy: [{ date: "asc" }, { startDateTime: "asc" }],
      }),
      prisma.conflictLog.findMany({
        where: { periodId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({ assignments, conflictLogs });
  } catch (err) {
    console.error("[GET /api/periods/:id/schedule]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
