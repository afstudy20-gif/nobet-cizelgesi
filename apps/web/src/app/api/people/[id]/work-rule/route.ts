import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PersonWorkRuleSchema } from "@nobet/shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const workRule = await prisma.personWorkRule.findUnique({
      where: { personId: id },
    });

    return NextResponse.json(workRule);
  } catch (err) {
    console.error("[GET /api/people/:id/work-rule]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = PersonWorkRuleSchema.safeParse(body);
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

    const workRule = await prisma.personWorkRule.upsert({
      where: { personId: id },
      create: { personId: id, ...parsed.data },
      update: parsed.data,
    });

    return NextResponse.json(workRule);
  } catch (err) {
    console.error("[PUT /api/people/:id/work-rule]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
