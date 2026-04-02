import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LocationUpdateSchema } from "@nobet/shared";

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

    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        coverageRules: {
          include: { shiftTemplate: true },
        },
        locationRules: {
          include: { person: true },
        },
      },
    });

    if (!location) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Location not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json(location);
  } catch (err) {
    console.error("[GET /api/locations/:id]", err);
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
    const parsed = LocationUpdateSchema.safeParse(body);
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

    const location = await prisma.location.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(location);
  } catch (err: unknown) {
    if (isPrismaNotFound(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Location not found" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/locations/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.location.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    if (isPrismaNotFound(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Location not found" } },
        { status: 404 }
      );
    }
    console.error("[DELETE /api/locations/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
