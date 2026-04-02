import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SchedulePeriodCreateSchema } from "@nobet/shared";

export async function GET() {
  try {
    const periods = await prisma.schedulePeriod.findMany({
      orderBy: { startDate: "desc" },
      include: {
        _count: {
          select: {
            requirements: true,
            assignments: true,
          },
        },
      },
    });
    return NextResponse.json(periods);
  } catch (err) {
    console.error("[GET /api/periods]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SchedulePeriodCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { name, startDate, endDate } = parsed.data;

    const period = await prisma.schedulePeriod.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    return NextResponse.json(period, { status: 201 });
  } catch (err) {
    console.error("[POST /api/periods]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
