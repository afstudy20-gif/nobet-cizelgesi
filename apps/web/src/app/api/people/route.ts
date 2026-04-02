import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PersonCreateSchema } from "@nobet/shared";

export async function GET() {
  try {
    const people = await prisma.person.findMany({
      include: {
        workRule: true,
        locationRules: {
          include: { location: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return NextResponse.json(people);
  } catch (err) {
    console.error("[GET /api/people]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const body = {
      ...raw,
      phone: raw.phone === "" ? null : raw.phone,
      email: raw.email === "" ? null : raw.email,
      notes: raw.notes === "" ? null : raw.notes,
    };
    const parsed = PersonCreateSchema.safeParse(body);
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

    const { firstName, lastName, ...rest } = parsed.data;
    const fullName = `${firstName} ${lastName}`;

    const person = await prisma.person.create({
      data: { firstName, lastName, fullName, ...rest },
    });

    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    console.error("[POST /api/people]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
