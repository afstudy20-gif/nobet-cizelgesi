import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AssignmentPatchSchema } from "@nobet/shared";
import { AssignmentSource } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const isPrismaP2025 = (err: unknown) =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code: string }).code === "P2025";

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = AssignmentPatchSchema.safeParse(body);
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

    const assignment = await prisma.assignment.update({
      where: { id },
      data: {
        ...parsed.data,
        source: AssignmentSource.MANUAL,
      },
    });

    return NextResponse.json(assignment);
  } catch (err: unknown) {
    if (isPrismaP2025(err)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Assignment not found" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/assignments/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
