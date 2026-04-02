import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PersonUpdateSchema } from "@nobet/shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        workRule: true,
        locationRules: {
          include: { location: true },
        },
        availabilityRules: {
          include: { location: true },
        },
        assignments: {
          select: { status: true },
        },
      },
    });

    if (!person) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Person not found" } },
        { status: 404 }
      );
    }

    // Summarise assignments as counts by status
    const assignmentCounts = person.assignments.reduce<Record<string, number>>(
      (acc, { status }) => {
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      },
      {}
    );

    const { assignments: _assignments, ...personRest } = person;
    return NextResponse.json({ ...personRest, assignmentCounts });
  } catch (err) {
    console.error("[GET /api/people/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const raw = await req.json();
    const body = {
      ...raw,
      phone: raw.phone === "" ? null : raw.phone,
      email: raw.email === "" ? null : raw.email,
      notes: raw.notes === "" ? null : raw.notes,
    };
    const parsed = PersonUpdateSchema.safeParse(body);
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

    const data = parsed.data;

    // Recompute fullName only when at least one name field is provided
    let fullName: string | undefined;
    if (data.firstName !== undefined || data.lastName !== undefined) {
      // Fetch current values for the fields that weren't supplied
      const existing = await prisma.person.findUnique({
        where: { id },
        select: { firstName: true, lastName: true },
      });
      if (!existing) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Person not found" } },
          { status: 404 }
        );
      }
      const first = data.firstName ?? existing.firstName;
      const last = data.lastName ?? existing.lastName;
      fullName = `${first} ${last}`;
    }

    const person = await prisma.person.update({
      where: { id },
      data: { ...data, ...(fullName !== undefined ? { fullName } : {}) },
    });

    return NextResponse.json(person);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Person not found" } },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/people/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.person.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Person not found" } },
        { status: 404 }
      );
    }
    console.error("[DELETE /api/people/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
