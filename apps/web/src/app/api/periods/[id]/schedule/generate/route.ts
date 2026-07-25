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

    /**
     * 4. Establish what survives regeneration.
     *
     * Regeneration only wipes assignments that it created itself and that the
     * user has not locked. Everything else — locked rows, and MANUAL rows the
     * user placed by hand — stays in the database, so the engine has to treat
     * those slots and those people as already committed. Seeding the tracking
     * from locked rows alone let a non-locked MANUAL assignment stay in the DB
     * while being invisible to the overlap, rest and quota checks, which
     * double-booked that person.
     *
     * `survivesRegeneration` is the exact complement of the delete filter
     * below; the two must always be changed together.
     */
    const deleteFilter = { isLocked: false, source: AssignmentSource.AUTO };
    const survivesRegeneration = (a: { isLocked: boolean; source: AssignmentSource }): boolean =>
      a.isLocked || a.source !== AssignmentSource.AUTO;

    // Includes rows with no person (e.g. a locked UNFILLED slot), which the
    // per-person lists below cannot see.
    const survivingAssignments = await prisma.assignment.findMany({
      where: { periodId, NOT: deleteFilter },
      select: {
        shiftRequirementId: true,
        personId: true,
        role: true,
        status: true,
      },
    });

    type SurvivingSlot = {
      personId: string | null;
      role: string | null;
      status: AssignmentStatus;
    };

    const survivingByRequirement = new Map<string, SurvivingSlot[]>();

    for (const a of survivingAssignments) {
      const slots = survivingByRequirement.get(a.shiftRequirementId) ?? [];
      slots.push({ personId: a.personId, role: a.role, status: a.status });
      survivingByRequirement.set(a.shiftRequirementId, slots);
    }

    // Build mutable per-person assignment tracking, seeded from every
    // assignment that survives the wipe.
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
      const retained = person.assignments
        .filter(survivesRegeneration)
        .map((a) => ({
          startDateTime: a.startDateTime,
          endDateTime: a.endDateTime,
          isNightShift: a.shiftRequirement.shiftTemplate.isNightShift,
          isOnCall: a.shiftRequirement.shiftTemplate.isOnCall,
          locationId: a.shiftRequirement.locationId,
          date: startOfDay(a.startDateTime),
        }));
      personAssignments.set(person.id, retained);
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

      const surviving = survivingByRequirement.get(req.id) ?? [];

      // Locked / manual rows already occupy part of this requirement. Starting
      // from zero here meant a requirement for 2 people with one locked
      // assignment got 2 *more* people assigned to it.
      let filled = surviving.filter((s) => s.status === AssignmentStatus.ASSIGNED).length;

      // Nobody already on this requirement may be picked again for it.
      const assignedToReq = new Set<string>(
        surviving.map((s) => s.personId).filter((id): id is string => id !== null)
      );

      /**
       * Every slot this requirement declares: role-typed where the coverage
       * rule names a role, padded with unrestricted slots up to
       * requiredHeadcount. Without the padding a rule of headcount 3 with
       * `{ UZMAN: 1 }` produced a single slot yet still reported 2 unfilled,
       * with no row anywhere to show for them.
       */
      const slotRoles: string[] = [];
      const roleReqs = req.roleRequirements as Record<string, number> | null;
      if (roleReqs && typeof roleReqs === "object") {
        for (const [roleName, count] of Object.entries(roleReqs)) {
          for (let i = 0; i < count; i++) {
            slotRoles.push(roleName);
          }
        }
      }
      while (slotRoles.length < req.requiredHeadcount) {
        slotRoles.push("ANY");
      }

      const totalSlots = slotRoles.length;

      // Remove the slots the surviving rows already cover, matching on role so
      // a retained UZMAN row consumes an UZMAN slot rather than an open one.
      for (const slot of surviving) {
        const wantedRole = slot.role ?? "ANY";
        const exactIndex = slotRoles.indexOf(wantedRole);
        const index = exactIndex !== -1 ? exactIndex : slotRoles.indexOf("ANY");
        if (index !== -1) {
          slotRoles.splice(index, 1);
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

      // 8. Create ConflictLog for each unfilled slot. Counted against the slots
      // actually declared, so the number always matches the UNFILLED rows.
      const unfilled = totalSlots - filled;
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

    const total = totalAssigned + totalUnfilled;
    const summary = `Generated ${new Date().toISOString()}: ${totalAssigned}/${total} slots filled, ${totalUnfilled} unfilled, ${conflictEntries.length} conflicts.`;

    /**
     * 9. Apply the whole regeneration atomically.
     *
     * The solve above is pure in-memory work, so only the writes need to be in
     * the transaction — which keeps it short enough to stay clear of statement
     * timeouts. Previously the deletes were committed first and the inserts
     * ran hundreds of iterations later, so any failure, timeout or client
     * abort in between left the period with its schedule erased and nothing
     * written back.
     */
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { periodId, ...deleteFilter } }),
      prisma.conflictLog.deleteMany({ where: { periodId } }),
      prisma.assignment.createMany({ data: newAssignments }),
      prisma.conflictLog.createMany({ data: conflictEntries }),
      prisma.schedulePeriod.update({
        where: { id: periodId },
        data: { generationNotes: summary },
      }),
    ]);

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
