import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AvailabilityRuleCreateSchema } from "@nobet/shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const rules = await prisma.availabilityRule.findMany({
      where: { personId: id },
      include: { location: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(rules);
  } catch (err) {
    console.error("[GET /api/people/:id/availability]", err);
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
    const parsed = AvailabilityRuleCreateSchema.safeParse(body);
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

    const { validFrom, validTo, weekdays, ...rest } = parsed.data;

    const rule = await prisma.availabilityRule.create({
      data: {
        personId: id,
        ...rest,
        weekdays: weekdays ?? [],
        validFrom: validFrom ? new Date(validFrom) : null,
        validTo: validTo ? new Date(validTo) : null,
      },
      include: { location: true },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    console.error("[POST /api/people/:id/availability]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
