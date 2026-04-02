import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ShiftTemplateCreateSchema } from "@nobet/shared";

export async function GET() {
  try {
    const templates = await prisma.shiftTemplate.findMany({
      orderBy: { name: "asc" },
      include: {
        defaultLocation: true,
      },
    });
    return NextResponse.json(templates);
  } catch (err) {
    console.error("[GET /api/shift-templates]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ShiftTemplateCreateSchema.safeParse(body);
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

    const template = await prisma.shiftTemplate.create({ data: parsed.data });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error("[POST /api/shift-templates]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
