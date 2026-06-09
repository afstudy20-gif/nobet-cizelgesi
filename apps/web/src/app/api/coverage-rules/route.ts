import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CoverageRuleCreateSchema } from "@nobet/shared";
import { parseCalendarDate } from "@nobet/scheduler";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const locationId = searchParams.get("locationId") ?? undefined;
    const shiftTemplateId = searchParams.get("shiftTemplateId") ?? undefined;

    const rules = await prisma.coverageRule.findMany({
      where: {
        ...(locationId !== undefined ? { locationId } : {}),
        ...(shiftTemplateId !== undefined ? { shiftTemplateId } : {}),
      },
      include: {
        location: true,
        shiftTemplate: true,
      },
    });
    return NextResponse.json(rules);
  } catch (err) {
    console.error("[GET /api/coverage-rules]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CoverageRuleCreateSchema.safeParse(body);
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

    const { specificDate, validFrom, validTo, weekdays, ruleType, ...rest } =
      parsed.data;

    const storedRuleType =
      ruleType === "ONE_DAY" ? ("ONE_DAY" as const) : ruleType;

    const rule = await prisma.coverageRule.create({
      data: {
        ...rest,
        ruleType: storedRuleType,
        weekdays: weekdays ?? [],
        specificDate:
          specificDate != null ? parseCalendarDate(specificDate) : null,
        validFrom: validFrom != null ? parseCalendarDate(validFrom) : null,
        validTo: validTo != null ? parseCalendarDate(validTo) : null,
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    console.error("[POST /api/coverage-rules]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
