import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PersonLocationRuleSchema } from "@nobet/shared";

type Params = { params: Promise<{ id: string; ruleId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { ruleId } = await params;
    const body = await req.json();
    const parsed = PersonLocationRuleSchema.partial().safeParse(body);
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

    const rule = await prisma.personLocationRule.update({
      where: { id: ruleId },
      data: parsed.data,
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
        { error: { code: "NOT_FOUND", message: "Location rule not found" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/people/:id/location-rules/:ruleId]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ruleId } = await params;
    await prisma.personLocationRule.delete({ where: { id: ruleId } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Location rule not found" } },
        { status: 404 }
      );
    }
    console.error("[DELETE /api/people/:id/location-rules/:ruleId]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
