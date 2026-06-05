/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    if (!payload || typeof payload !== "object" || !payload.data) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid payload format" } },
        { status: 400 }
      );
    }

    const { data } = payload;

    // Parse string date fields to JS Date objects
    const people = (data.people || []).map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }));

    const locations = data.locations || [];

    const shiftTemplates = data.shiftTemplates || [];

    const coverageRules = (data.coverageRules || []).map((r: any) => ({
      ...r,
      specificDate: r.specificDate ? new Date(r.specificDate) : null,
      validFrom: r.validFrom ? new Date(r.validFrom) : null,
      validTo: r.validTo ? new Date(r.validTo) : null,
    }));

    const personLocationRules = data.personLocationRules || [];

    const personWorkRules = data.personWorkRules || [];

    const availabilityRules = (data.availabilityRules || []).map((r: any) => ({
      ...r,
      validFrom: r.validFrom ? new Date(r.validFrom) : null,
      validTo: r.validTo ? new Date(r.validTo) : null,
      createdAt: new Date(r.createdAt),
    }));

    const schedulePeriods = (data.schedulePeriods || []).map((p: any) => ({
      ...p,
      startDate: new Date(p.startDate),
      endDate: new Date(p.endDate),
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }));

    const shiftRequirements = (data.shiftRequirements || []).map((r: any) => ({
      ...r,
      date: new Date(r.date),
    }));

    const assignments = (data.assignments || []).map((a: any) => ({
      ...a,
      date: new Date(a.date),
      startDateTime: new Date(a.startDateTime),
      endDateTime: new Date(a.endDateTime),
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
    }));

    const conflictLogs = (data.conflictLogs || []).map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
    }));

    // Perform wipe and restore inside a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete all tables in reverse relation order (dependent children first)
      await tx.conflictLog.deleteMany();
      await tx.assignment.deleteMany();
      await tx.shiftRequirement.deleteMany();
      await tx.schedulePeriod.deleteMany();
      await tx.availabilityRule.deleteMany();
      await tx.personWorkRule.deleteMany();
      await tx.personLocationRule.deleteMany();
      await tx.coverageRule.deleteMany();
      await tx.shiftTemplate.deleteMany();
      await tx.location.deleteMany();
      await tx.person.deleteMany();

      // 2. Insert all tables in dependency order (parents first)
      if (people.length > 0) await tx.person.createMany({ data: people });
      if (locations.length > 0) await tx.location.createMany({ data: locations });
      if (shiftTemplates.length > 0) await tx.shiftTemplate.createMany({ data: shiftTemplates });
      if (coverageRules.length > 0) await tx.coverageRule.createMany({ data: coverageRules });
      if (personLocationRules.length > 0) await tx.personLocationRule.createMany({ data: personLocationRules });
      if (personWorkRules.length > 0) await tx.personWorkRule.createMany({ data: personWorkRules });
      if (availabilityRules.length > 0) await tx.availabilityRule.createMany({ data: availabilityRules });
      if (schedulePeriods.length > 0) await tx.schedulePeriod.createMany({ data: schedulePeriods });
      if (shiftRequirements.length > 0) await tx.shiftRequirement.createMany({ data: shiftRequirements });
      if (assignments.length > 0) await tx.assignment.createMany({ data: assignments });
      if (conflictLogs.length > 0) await tx.conflictLog.createMany({ data: conflictLogs });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/sync/import]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: err.message || "Unexpected error" } },
      { status: 500 }
    );
  }
}
