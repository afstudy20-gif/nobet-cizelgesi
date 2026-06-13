import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AssignmentStatus, AssignmentSource, ConflictSeverity } from "@prisma/client";
import { getISODay, addDays, startOfDay, isWithinInterval } from "date-fns";
import {
  shiftStart,
  shiftEnd,
  overlaps,
  isWeekend,
  isPersonUnavailable,
  getAvailabilityMatch,
} from "@nobet/scheduler";

type Params = { params: Promise<{ id: string }> };

// ─── Types ────────────────────────────────────────────────────────────────────

type ShiftTemplate = {
  id: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isNightShift: boolean;
  isOnCall: boolean;
  minimumRestHoursAfter: number;
};

type Requirement = {
  id: string;
  date: Date;
  requiredHeadcount: number;
  locationId: string;
  roleRequirements: unknown;
  shiftTemplate: ShiftTemplate;
};

type AvailabilityRule = {
  ruleType: string;
  availabilityType: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  locationId: string | null;
};

type WorkRule = {
  maxAssignmentsPerPeriod: number | null;
  maxNightAssignmentsPerPeriod: number | null;
  maxWeekendAssignmentsPerPeriod: number | null;
  maxOnCallAssignmentsPerPeriod: number | null;
  minRestHoursBetweenAssignments: number;
  allowBackToBackNightShift: boolean;
} | null;

type LocationRule = {
  locationId: string;
  allowed: boolean;
};

type Person = {
  id: string;
  isActive: boolean;
  role: string;
  workRule: WorkRule;
  locationRules: LocationRule[];
  availabilityRules: AvailabilityRule[];
};

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;

    // 1. Load the period
    const period = await prisma.schedulePeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    // 2. Load all ShiftRequirements for this period with their template + location
    const rawRequirements = await prisma.shiftRequirement.findMany({
      where: { periodId },
      include: {
        shiftTemplate: true,
        location: true,
      },
    });

    // 3. Load all active people with their rules and existing assignments in this period
    const rawPeople = await prisma.person.findMany({
      where: { isActive: true },
      include: {
        workRule: true,
        locationRules: true,
        availabilityRules: true,
        assignments: {
          where: { periodId },
          include: {
            shiftRequirement: {
              include: { shiftTemplate: true },
            },
          },
        },
      },
    });

    // 4. Keep locked assignments untouched; delete non-locked AUTO assignments
    await prisma.assignment.deleteMany({
      where: { periodId, isLocked: false, source: AssignmentSource.AUTO },
    });

    // 5. Delete ConflictLogs for this period
    await prisma.conflictLog.deleteMany({ where: { periodId } });

    // Build mutable per-person assignment tracking (start from locked assignments only)
    type TrackingAssignment = {
      startDateTime: Date;
      endDateTime: Date;
      isNightShift: boolean;
      isOnCall: boolean;
      locationId: string;
      date: Date;
    };

    const personAssignments = new Map<string, TrackingAssignment[]>();

    for (const person of rawPeople) {
      const locked = person.assignments
        .filter((a) => a.isLocked)
        .map((a) => ({
          startDateTime: a.startDateTime,
          endDateTime: a.endDateTime,
          isNightShift: a.shiftRequirement.shiftTemplate.isNightShift,
          isOnCall: a.shiftRequirement.shiftTemplate.isOnCall,
          locationId: a.shiftRequirement.locationId,
          date: startOfDay(a.startDateTime),
        }));
      personAssignments.set(person.id, locked);
    }

    // 6. Sort requirements by difficulty: night shifts first, then weekends, then by date
    const requirements: Requirement[] = rawRequirements.map((r) => ({
      id: r.id,
      date: r.date,
      requiredHeadcount: r.requiredHeadcount,
      locationId: r.locationId,
      roleRequirements: r.roleRequirements,
      shiftTemplate: {
        id: r.shiftTemplate.id,
        startTime: r.shiftTemplate.startTime,
        endTime: r.shiftTemplate.endTime,
        crossesMidnight: r.shiftTemplate.crossesMidnight,
        isNightShift: r.shiftTemplate.isNightShift,
        isOnCall: r.shiftTemplate.isOnCall,
        minimumRestHoursAfter: r.shiftTemplate.minimumRestHoursAfter,
      },
    }));

    requirements.sort((a, b) => {
      const aIsNight = a.shiftTemplate.isNightShift ? 0 : 1;
      const bIsNight = b.shiftTemplate.isNightShift ? 0 : 1;
      if (aIsNight !== bIsNight) return aIsNight - bIsNight;

      const aIsWeekend = isWeekend(a.date) ? 0 : 1;
      const bIsWeekend = isWeekend(b.date) ? 0 : 1;
      if (aIsWeekend !== bIsWeekend) return aIsWeekend - bIsWeekend;

      return a.date.getTime() - b.date.getTime();
    });

    // Build person map for fast lookup
    const people = new Map<string, Person>();
    for (const p of rawPeople) {
      people.set(p.id, {
        id: p.id,
        isActive: p.isActive,
        role: p.role,
        workRule: p.workRule
          ? {
              maxAssignmentsPerPeriod: p.workRule.maxAssignmentsPerPeriod,
              maxNightAssignmentsPerPeriod:
                p.workRule.maxNightAssignmentsPerPeriod,
              maxWeekendAssignmentsPerPeriod:
                p.workRule.maxWeekendAssignmentsPerPeriod,
              maxOnCallAssignmentsPerPeriod:
                p.workRule.maxOnCallAssignmentsPerPeriod,
              minRestHoursBetweenAssignments:
                p.workRule.minRestHoursBetweenAssignments,
              allowBackToBackNightShift: p.workRule.allowBackToBackNightShift,
            }
          : null,
        locationRules: p.locationRules.map((lr) => ({
          locationId: lr.locationId,
          allowed: lr.allowed,
        })),
        availabilityRules: p.availabilityRules.map((ar) => ({
          ruleType: ar.ruleType,
          availabilityType: ar.availabilityType,
          weekdays: ar.weekdays,
          startTime: ar.startTime,
          endTime: ar.endTime,
          validFrom: ar.validFrom,
          validTo: ar.validTo,
          locationId: ar.locationId,
        })),
      });
    }

    let totalAssigned = 0;
    let totalUnfilled = 0;
    const newAssignments: {
      periodId: string;
      shiftRequirementId: string;
      personId: string | null;
      date: Date;
      startDateTime: Date;
      endDateTime: Date;
      role: string | null;
      isOnCall: boolean;
      status: AssignmentStatus;
      isLocked: boolean;
      source: AssignmentSource;
      score: number | null;
    }[] = [];
    const conflictEntries: {
      periodId: string;
      shiftRequirementId: string;
      personId: null;
      type: string;
      severity: ConflictSeverity;
      message: string;
    }[] = [];

    // Count total assignments per person across period (from locked baseline)
    const periodAssignCount = new Map<string, number>();
    const periodNightCount = new Map<string, number>();
    const periodWeekendCount = new Map<string, number>();
    const periodOnCallCount = new Map<string, number>();

    for (const [personId, assignments] of personAssignments.entries()) {
      periodAssignCount.set(personId, assignments.length);
      periodNightCount.set(
        personId,
        assignments.filter((a) => a.isNightShift).length
      );
      periodWeekendCount.set(
        personId,
        assignments.filter((a) => isWeekend(a.date)).length
      );
      periodOnCallCount.set(
        personId,
        assignments.filter((a) => a.isOnCall).length
      );
    }

    // 7. For each requirement, attempt to fill requiredHeadcount slots
    for (const req of requirements) {
      const reqStart = shiftStart(req.date, req.shiftTemplate.startTime);
      const reqEnd = shiftEnd(
        req.date,
        req.shiftTemplate.endTime,
        req.shiftTemplate.crossesMidnight
      );

      let filled = 0;

      // Collect already-assigned person IDs for this requirement slot (from locked ones)
      // to avoid double-assigning the same person
      const assignedToReq = new Set<string>();

      const slotRoles: string[] = [];
      const roleReqs = req.roleRequirements as Record<string, number> | null;
      if (roleReqs && typeof roleReqs === "object" && Object.keys(roleReqs).length > 0) {
        for (const [roleName, count] of Object.entries(roleReqs)) {
          for (let i = 0; i < count; i++) {
            slotRoles.push(roleName);
          }
        }
      } else {
        for (let i = 0; i < req.requiredHeadcount; i++) {
          slotRoles.push("ANY");
        }
      }

      for (const requiredRole of slotRoles) {
        // Build scored candidates
        type Candidate = { personId: string; score: number };
        const candidates: Candidate[] = [];

        const allPersonIds = [...people.keys()];
        const totalPeople = allPersonIds.length;
        const avgAssignments =
          totalPeople > 0
            ? [...periodAssignCount.values()].reduce((s, v) => s + v, 0) /
              totalPeople
            : 0;

        for (const personId of allPersonIds) {
          const person = people.get(personId)!;
          const personTrack = personAssignments.get(personId) ?? [];

          // Already assigned to this requirement
          if (assignedToReq.has(personId)) continue;

          // Hard constraints

          // a. Must be active
          if (!person.isActive) continue;

          // b. Unvan/Rol eşleşmesi kontrolü
          if (requiredRole !== "ANY" && person.role !== requiredRole) continue;

          // c. Must have allowed location rule
          const locationAllowed = person.locationRules.some(
            (lr) => lr.locationId === req.locationId && lr.allowed
          );
          if (!locationAllowed) continue;

          // d. Must not be UNAVAILABLE on this date/time
          if (isPersonUnavailable(person, req.date, reqStart, reqEnd)) continue;

          // e. No overlapping assignment
          const hasOverlap = personTrack.some((a) =>
            overlaps(reqStart, reqEnd, a.startDateTime, a.endDateTime)
          );
          if (hasOverlap) continue;

          // f. minRestHours from last assignment
          const minRest =
            person.workRule?.minRestHoursBetweenAssignments ?? 12;
          const tooClose = personTrack.some((a) => {
            const gap1 = (reqStart.getTime() - a.endDateTime.getTime()) / 3600000;
            const gap2 = (a.startDateTime.getTime() - reqEnd.getTime()) / 3600000;
            return (gap1 >= 0 && gap1 < minRest) || (gap2 >= 0 && gap2 < minRest);
          });
          if (tooClose) continue;

          // g. maxAssignmentsPerPeriod
          const maxAssign = person.workRule?.maxAssignmentsPerPeriod ?? null;
          const currentCount = periodAssignCount.get(personId) ?? 0;
          if (maxAssign !== null && currentCount >= maxAssign) continue;

          // h. maxNightAssignmentsPerPeriod
          if (req.shiftTemplate.isNightShift) {
            const maxNight =
              person.workRule?.maxNightAssignmentsPerPeriod ?? null;
            const currentNight = periodNightCount.get(personId) ?? 0;
            if (maxNight !== null && currentNight >= maxNight) continue;
          }

          // i. maxWeekendAssignmentsPerPeriod
          if (isWeekend(req.date)) {
            const maxWeekend =
              person.workRule?.maxWeekendAssignmentsPerPeriod ?? null;
            const currentWeekend = periodWeekendCount.get(personId) ?? 0;
            if (maxWeekend !== null && currentWeekend >= maxWeekend) continue;
          }

          // j. maxOnCallAssignmentsPerPeriod
          if (req.shiftTemplate.isOnCall) {
            const maxOnCall =
              person.workRule?.maxOnCallAssignmentsPerPeriod ?? null;
            const currentOnCall = periodOnCallCount.get(personId) ?? 0;
            if (maxOnCall !== null && currentOnCall >= maxOnCall) continue;
          }

          // Passed all hard constraints — now score
          let score = 100;

          // Preferred availability match
          const availMatch = getAvailabilityMatch(
            person,
            req.date,
            reqStart,
            reqEnd
          );
          if (availMatch === "preferred") score += 15;
          if (availMatch === "unpreferred") score -= 10;

          // Assignment count relative to average
          if (currentCount < avgAssignments) score += 10;
          if (currentCount > avgAssignments) score -= 20;

          // Night-after-night penalty
          if (
            req.shiftTemplate.isNightShift &&
            !(person.workRule?.allowBackToBackNightShift ?? false)
          ) {
            const lastNight = personTrack
              .filter((a) => a.isNightShift)
              .sort(
                (a, b) =>
                  b.endDateTime.getTime() - a.endDateTime.getTime()
              )[0];
            if (lastNight) {
              const hoursSinceLast =
                (reqStart.getTime() - lastNight.endDateTime.getTime()) /
                3600000;
              // "back to back" = within 24h
              if (hoursSinceLast >= 0 && hoursSinceLast < 24) score -= 25;
            }
          }

          // Heavy shift in last 24h
          const recentHeavy = personTrack.some((a) => {
            const diff =
              Math.abs(reqStart.getTime() - a.endDateTime.getTime()) / 3600000;
            return diff < 24;
          });
          if (recentHeavy) score -= 15;

          // Location clustering: >2 assignments at same location this week
          const weekStart = new Date(req.date);
          weekStart.setDate(weekStart.getDate() - getISODay(req.date) + 1);
          const weekEnd = addDays(weekStart, 6);
          const sameLocationThisWeek = personTrack.filter(
            (a) =>
              a.locationId === req.locationId &&
              isWithinInterval(a.date, { start: weekStart, end: weekEnd })
          ).length;
          if (sameLocationThisWeek > 2) score -= 10;

          candidates.push({ personId, score });
        }

        // Sort candidates by score descending
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0) {
          const best = candidates[0]!;

          // Record the assignment
          newAssignments.push({
            periodId,
            shiftRequirementId: req.id,
            personId: best.personId,
            date: req.date,
            startDateTime: reqStart,
            endDateTime: reqEnd,
            role: requiredRole !== "ANY" ? requiredRole : null,
            isOnCall: req.shiftTemplate.isOnCall,
            status: AssignmentStatus.ASSIGNED,
            isLocked: false,
            source: AssignmentSource.AUTO,
            score: best.score,
          });

          // Update tracking data
          const track = personAssignments.get(best.personId) ?? [];
          track.push({
            startDateTime: reqStart,
            endDateTime: reqEnd,
            isNightShift: req.shiftTemplate.isNightShift,
            isOnCall: req.shiftTemplate.isOnCall,
            locationId: req.locationId,
            date: startOfDay(req.date),
          });
          personAssignments.set(best.personId, track);

          periodAssignCount.set(
            best.personId,
            (periodAssignCount.get(best.personId) ?? 0) + 1
          );
          if (req.shiftTemplate.isNightShift) {
            periodNightCount.set(
              best.personId,
              (periodNightCount.get(best.personId) ?? 0) + 1
            );
          }
          if (isWeekend(req.date)) {
            periodWeekendCount.set(
              best.personId,
              (periodWeekendCount.get(best.personId) ?? 0) + 1
            );
          }
          if (req.shiftTemplate.isOnCall) {
            periodOnCallCount.set(
              best.personId,
              (periodOnCallCount.get(best.personId) ?? 0) + 1
            );
          }

          assignedToReq.add(best.personId);
          filled++;
          totalAssigned++;
        } else {
          // No candidate found: UNFILLED
          newAssignments.push({
            periodId,
            shiftRequirementId: req.id,
            personId: null,
            date: req.date,
            startDateTime: reqStart,
            endDateTime: reqEnd,
            role: requiredRole !== "ANY" ? requiredRole : null,
            isOnCall: req.shiftTemplate.isOnCall,
            status: AssignmentStatus.UNFILLED,
            isLocked: false,
            source: AssignmentSource.AUTO,
            score: null,
          });
          totalUnfilled++;
        }
      }

      // 8. Create ConflictLog for each unfilled slot
      const unfilled = req.requiredHeadcount - filled;
      if (unfilled > 0) {
        conflictEntries.push({
          periodId,
          shiftRequirementId: req.id,
          personId: null,
          type: "UNFILLED_REQUIREMENT",
          severity: ConflictSeverity.ERROR,
          message: `Requirement on ${req.date.toISOString().slice(0, 10)} could not be fully staffed: ${unfilled} slot(s) unfilled.`,
        });
      }
    }

    // Bulk-create assignments and conflict logs
    await prisma.assignment.createMany({ data: newAssignments });
    if (conflictEntries.length > 0) {
      await prisma.conflictLog.createMany({ data: conflictEntries });
    }

    // 9. Update period.generationNotes with summary
    const total = totalAssigned + totalUnfilled;
    const summary = `Generated ${new Date().toISOString()}: ${totalAssigned}/${total} slots filled, ${totalUnfilled} unfilled, ${conflictEntries.length} conflicts.`;
    await prisma.schedulePeriod.update({
      where: { id: periodId },
      data: { generationNotes: summary },
    });

    return NextResponse.json({
      assigned: totalAssigned,
      unfilled: totalUnfilled,
      total,
      conflicts: conflictEntries.length,
    });
  } catch (err) {
    console.error("[POST /api/periods/:id/schedule/generate]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
