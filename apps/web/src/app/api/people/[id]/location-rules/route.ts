import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PersonLocationRuleSchema } from "@nobet/shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const rules = await prisma.personLocationRule.findMany({
      where: { personId: id },
      include: { location: true },
      orderBy: { priority: "desc" },
    });

    return NextResponse.json(rules);
  } catch (err) {
    console.error("[GET /api/people/:id/location-rules]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = PersonLocationRuleSchema.safeParse(body);
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

    const { locationId, ...rest } = parsed.data;

    // Upsert: the unique constraint is (personId, locationId)
    const rule = await prisma.personLocationRule.upsert({
      where: { personId_locationId: { personId: id, locationId } },
      create: { personId: id, locationId, ...rest },
      update: rest,
      include: { location: true },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    console.error("[POST /api/people/:id/location-rules]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
