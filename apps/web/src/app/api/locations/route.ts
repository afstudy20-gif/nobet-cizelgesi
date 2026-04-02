import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LocationCreateSchema } from "@nobet/shared";

export async function GET() {
  try {
    const locations = await prisma.location.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            coverageRules: true,
            locationRules: true,
          },
        },
      },
    });
    return NextResponse.json(locations);
  } catch (err) {
    console.error("[GET /api/locations]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LocationCreateSchema.safeParse(body);
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

    const location = await prisma.location.create({ data: parsed.data });
    return NextResponse.json(location, { status: 201 });
  } catch (err) {
    console.error("[POST /api/locations]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
