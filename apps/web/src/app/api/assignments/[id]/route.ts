import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AssignmentPatchSchema } from "@nobet/shared";
import {
  AssignmentSource,
  AssignmentStatus,
} from "@prisma/client";
import {
  buildShiftWindow,
  normalizeCalendarDate,
  validatePersonAssignment,
} from "@nobet/scheduler";

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

    const existing = await prisma.assignment.findUnique({
      where: { id },
      include: {
        shiftRequirement: {
          include: { shiftTemplate: true, location: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Assignment not found" } },
        { status: 404 }
      );
    }

    const patch = parsed.data;
    const changingAssignment =
      patch.personId !== undefined || patch.status !== undefined;

    if (existing.isLocked && changingAssignment) {
      return NextResponse.json(
        {
          error: {
            code: "LOCKED",
            message: "Locked assignments cannot change person or status. Unlock first.",
          },
        },
        { status: 409 }
      );
    }

    const nextPersonId =
      patch.personId !== undefined ? patch.personId : existing.personId;

    if (nextPersonId) {
      const person = await prisma.person.findUnique({
        where: { id: nextPersonId },
        include: {
          workRule: true,
          locationRules: true,
          availabilityRules: true,
          assignments: {
            where: {
              periodId: existing.periodId,
              id: { not: id },
            },
            include: {
              shiftRequirement: { include: { shiftTemplate: true } },
            },
          },
        },
      });

      if (!person) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Person not found" } },
          { status: 404 }
        );
      }

      const template = existing.shiftRequirement.shiftTemplate;
      const shiftContext = {
        date: existing.shiftRequirement.date,
        locationId: existing.shiftRequirement.locationId,
        startTime: template.startTime,
        endTime: template.endTime,
        crossesMidnight: template.crossesMidnight,
        isNightShift: template.isNightShift,
      };

      const tracked = person.assignments.map((a) => ({
        id: a.id,
        startDateTime: a.startDateTime,
        endDateTime: a.endDateTime,
        isNightShift: a.shiftRequirement.shiftTemplate.isNightShift,
        locationId: a.shiftRequirement.locationId,
        date: a.date,
      }));

      const validation = validatePersonAssignment(
        {
          id: person.id,
          isActive: person.isActive,
          workRule: person.workRule
            ? {
                maxAssignmentsPerPeriod: person.workRule.maxAssignmentsPerPeriod,
                maxNightAssignmentsPerPeriod:
                  person.workRule.maxNightAssignmentsPerPeriod,
                maxWeekendAssignmentsPerPeriod:
                  person.workRule.maxWeekendAssignmentsPerPeriod,
                minRestHoursBetweenAssignments:
                  person.workRule.minRestHoursBetweenAssignments,
                allowBackToBackNightShift:
                  person.workRule.allowBackToBackNightShift,
              }
            : null,
          locationRules: person.locationRules.map((lr) => ({
            locationId: lr.locationId,
            allowed: lr.allowed,
          })),
          availabilityRules: person.availabilityRules.map((ar) => ({
            ruleType: ar.ruleType,
            availabilityType: ar.availabilityType,
            weekdays: ar.weekdays,
            startTime: ar.startTime,
            endTime: ar.endTime,
            validFrom: ar.validFrom,
            validTo: ar.validTo,
            locationId: ar.locationId,
          })),
        },
        shiftContext,
        tracked,
        { excludeAssignmentId: id }
      );

      if (!validation.ok) {
        return NextResponse.json(
          {
            error: {
              code: validation.code,
              message: validation.message,
            },
          },
          { status: 422 }
        );
      }
    }

    const { reqStart, reqEnd } = buildShiftWindow({
      date: existing.shiftRequirement.date,
      locationId: existing.shiftRequirement.locationId,
      startTime: existing.shiftRequirement.shiftTemplate.startTime,
      endTime: existing.shiftRequirement.shiftTemplate.endTime,
      crossesMidnight: existing.shiftRequirement.shiftTemplate.crossesMidnight,
      isNightShift: existing.shiftRequirement.shiftTemplate.isNightShift,
    });

    const resolvedStatus =
      patch.status ??
      (patch.personId !== undefined
        ? nextPersonId
          ? AssignmentStatus.ASSIGNED
          : AssignmentStatus.UNFILLED
        : undefined);

    const assignment = await prisma.assignment.update({
      where: { id },
      data: {
        ...(patch.personId !== undefined ? { personId: patch.personId } : {}),
        ...(patch.isLocked !== undefined ? { isLocked: patch.isLocked } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(resolvedStatus !== undefined ? { status: resolvedStatus } : {}),
        ...(patch.personId !== undefined
          ? {
              startDateTime: reqStart,
              endDateTime: reqEnd,
              date: normalizeCalendarDate(existing.shiftRequirement.date),
              source: AssignmentSource.MANUAL,
            }
          : { source: AssignmentSource.MANUAL }),
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