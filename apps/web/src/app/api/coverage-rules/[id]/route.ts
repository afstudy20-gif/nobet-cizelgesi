import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CoverageRuleUpdateSchema } from "@nobet/shared";

type Params = { params: Promise<{ id: string }> };

function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const rule = await prisma.coverageRule.findUnique({
      where: { id },
      include: {
        location: true,
        shiftTemplate: true,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Coverage rule not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json(rule);
  } catch (err) {
    console.error("[GET /api/coverage-rules/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = CoverageRuleUpdateSchema.safeParse(body);
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

    const { specificDate, validFrom, validTo, weekdays, locationId, shiftTemplateId, ...rest } = parsed.data;

    const rule = await prisma.coverageRule.update({
      where: { id },
      data: {
        ...rest,
        ...(weekdays !== undefined ? { weekdays: weekdays ?? [] } : {}),
        ...(locationId !== undefined ? { location: { connect: { id: locationId } } } : {}),
        ...(shiftTemplateId !== undefined ? { shiftTemplate: { connect: { id: shiftTemplateId } } } : {}),
        ...(specificDate !== undefined
          ? { specificDate: specificDate != null ? new Date(specificDate) : null }
          : {}),
        ...(validFrom !== undefined
          ? { validFrom: validFrom != null ? new Date(validFrom) : null }
          : {}),
        ...(validTo !== undefined
          ? { validTo: validTo != null ? new Date(validTo) : null }
          : {}),
      },
    });
    return NextResponse.json(rule);
  } catch (err: unknown) {
    if (isPrismaNotFound(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Coverage rule not found" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/coverage-rules/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.coverageRule.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    if (isPrismaNotFound(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Coverage rule not found" } },
        { status: 404 }
      );
    }
    console.error("[DELETE /api/coverage-rules/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
