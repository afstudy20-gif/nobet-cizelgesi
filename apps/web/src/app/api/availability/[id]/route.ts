import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AvailabilityRuleUpdateSchema } from "@nobet/shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = AvailabilityRuleUpdateSchema.safeParse(body);
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

    const { validFrom, validTo, ...rest } = parsed.data;

    const updateData: Record<string, unknown> = { ...rest };
    if (validFrom !== undefined) {
      updateData.validFrom = validFrom ? new Date(validFrom) : null;
    }
    if (validTo !== undefined) {
      updateData.validTo = validTo ? new Date(validTo) : null;
    }

    const rule = await prisma.availabilityRule.update({
      where: { id },
      data: updateData,
      include: { location: true },
    });

    return NextResponse.json(rule);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Availability rule not found" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/availability/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.availabilityRule.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Availability rule not found" } },
        { status: 404 }
      );
    }
    console.error("[DELETE /api/availability/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
