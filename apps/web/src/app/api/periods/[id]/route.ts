import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const isPrismaP2025 = (err: unknown) =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code: string }).code === "P2025";

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const period = await prisma.schedulePeriod.findUnique({
      where: { id },
      include: {
        requirements: {
          include: {
            shiftTemplate: true,
            location: true,
          },
        },
        _count: {
          select: {
            requirements: true,
            assignments: true,
            conflictLogs: true,
          },
        },
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json(period);
  } catch (err) {
    console.error("[GET /api/periods/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

const PeriodPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = PeriodPatchSchema.safeParse(body);
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

    const { startDate, endDate, ...rest } = parsed.data;

    const period = await prisma.schedulePeriod.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate !== undefined ? { startDate: new Date(startDate) } : {}),
        ...(endDate !== undefined ? { endDate: new Date(endDate) } : {}),
      },
    });

    return NextResponse.json(period);
  } catch (err: unknown) {
    if (isPrismaP2025(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/periods/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.schedulePeriod.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    if (isPrismaP2025(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }
    console.error("[DELETE /api/periods/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
