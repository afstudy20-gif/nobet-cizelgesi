import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const isPrismaP2025 = (err: unknown) =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code: string }).code === "P2025";

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const assignment = await prisma.assignment.update({
      where: { id },
      data: { isLocked: false },
    });

    return NextResponse.json(assignment);
  } catch (err: unknown) {
    if (isPrismaP2025(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Assignment not found" } },
        { status: 404 }
      );
    }
    console.error("[POST /api/assignments/:id/unlock]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
