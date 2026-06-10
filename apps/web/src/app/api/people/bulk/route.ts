import { NextRequest, NextResponse } from "next/server";
import { PersonBulkCreateSchema, suggestPersonCodes } from "@nobet/shared";
import { prisma } from "@/lib/prisma";
import { grantDefaultLocationRulesForPeople } from "@/lib/person-location-defaults";

export async function POST(req: NextRequest) {
  try {
    const parsed = PersonBulkCreateSchema.safeParse(await req.json());
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

    const existing = await prisma.person.findMany({
      select: { code: true, fullName: true },
    });
    const existingCodes = existing.map((p) => p.code);
    const existingNames = new Set(
      existing.map((p) => p.fullName.toLocaleLowerCase("tr"))
    );

    const toCreate: Array<{
      code: string;
      firstName: string;
      lastName: string;
      fullName: string;
      isActive: boolean;
    }> = [];

    const skipped: Array<{ fullName: string; reason: string }> = [];
    const autoCodes = suggestPersonCodes(existingCodes, parsed.data.people.length);
    let autoIndex = 0;

    for (const person of parsed.data.people) {
      const fullName = `${person.firstName} ${person.lastName}`;
      const nameKey = fullName.toLocaleLowerCase("tr");

      if (existingNames.has(nameKey)) {
        skipped.push({ fullName, reason: "ALREADY_EXISTS" });
        continue;
      }

      let code = person.code?.trim();
      if (code && existingCodes.includes(code)) {
        skipped.push({ fullName, reason: "CODE_EXISTS" });
        continue;
      }
      if (!code) {
        code = autoCodes[autoIndex++] ?? suggestPersonCodes([...existingCodes, ...toCreate.map((p) => p.code)], 1)[0];
      }

      toCreate.push({
        code,
        firstName: person.firstName,
        lastName: person.lastName,
        fullName,
        isActive: person.isActive ?? true,
      });
      existingNames.add(nameKey);
      existingCodes.push(code);
    }

    if (toCreate.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "No new people to import",
            details: { skipped },
          },
        },
        { status: 400 }
      );
    }

    const created = await prisma.$transaction(
      toCreate.map((data) => prisma.person.create({ data }))
    );

    await grantDefaultLocationRulesForPeople(created.map((p) => p.id));

    return NextResponse.json(
      {
        created: created.length,
        skipped,
        people: created,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/people/bulk]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}