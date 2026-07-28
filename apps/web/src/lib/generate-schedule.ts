import { addDays, getISODay, isWithinInterval, startOfDay } from "date-fns";
import { AssignmentSource, AssignmentStatus, ConflictSeverity } from "@nobet/shared";
import {
  getAvailabilityMatch,
  isPersonUnavailable,
  isWeekend,
  overlaps,
  shiftEnd,
  shiftStart,
} from "@nobet/scheduler";
import {
  schedulePeriodsRepo,
  type GeneratedSchedule,
  type NewAssignment,
  type NewConflictLog,
  type ScheduleGenerationInputs,
} from "@/lib/db/repo";
import type { AvailabilityRule } from "@/lib/db/types";
import { driveSync } from "@/lib/sync";

/**
 * Tarayıcı içi çizelge çözücü — eski `POST /api/periods/:id/schedule/generate`
 * route'unun birebir yerel karşılığı.
 *
 * Veriyi `schedulePeriodsRepo.getGenerationInputs()` ile IndexedDB'den okur,
 * atamaları bellek içinde puanlayıp seçer ve `applyGeneratedSchedule` ile tek
 * Dexie transaction'ında yazar. Başarılı yazım sonrası Drive senkronunu
 * `markDirty` ile tetikler.
 */

export type ScheduleGenerationResult = {
  assigned: number;
  unfilled: number;
  total: number;
  conflicts: number;
};

type SolverTemplate = {
  id: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isNightShift: boolean;
  isOnCall: boolean;
  minimumRestHoursAfter: number;
};

type SolverRequirement = {
  id: string;
  date: Date;
  requiredHeadcount: number;
  locationId: string;
  roleRequirements: Record<string, number> | null;
  shiftTemplate: SolverTemplate;
};

type SolverAvailabilityRule = {
  ruleType: string;
  availabilityType: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  locationId: string | null;
};

type SolverWorkRule = {
  maxAssignmentsPerPeriod: number | null;
  maxNightAssignmentsPerPeriod: number | null;
  maxWeekendAssignmentsPerPeriod: number | null;
  maxOnCallAssignmentsPerPeriod: number | null;
  minRestHoursBetweenAssignments: number;
  allowBackToBackNightShift: boolean;
} | null;

type SolverPerson = {
  id: string;
  isActive: boolean;
  role: string;
  workRule: SolverWorkRule;
  locationRules: Array<{ locationId: string; allowed: boolean }>;
  availabilityRules: SolverAvailabilityRule[];
};

type TrackingAssignment = {
  startDateTime: Date;
  endDateTime: Date;
  isNightShift: boolean;
  isOnCall: boolean;
  locationId: string;
  date: Date;
};

type SurvivingSlot = {
  personId: string | null;
  role: string | null;
  status: AssignmentStatus;
};

function toAvailabilityRule(rule: AvailabilityRule): SolverAvailabilityRule {
  return {
    ruleType: rule.ruleType,
    availabilityType: rule.availabilityType,
    weekdays: rule.weekdays as number[],
    startTime: rule.startTime,
    endTime: rule.endTime,
    validFrom: rule.validFrom ? new Date(rule.validFrom) : null,
    validTo: rule.validTo ? new Date(rule.validTo) : null,
    locationId: rule.locationId,
  };
}

function buildSolverInputs(inputs: ScheduleGenerationInputs): {
  requirements: SolverRequirement[];
  people: Map<string, SolverPerson>;
  personAssignments: Map<string, TrackingAssignment[]>;
  survivingByRequirement: Map<string, SurvivingSlot[]>;
} {
  const requirements: SolverRequirement[] = inputs.requirements.map((requirement) => {
    const template = requirement.shiftTemplate;
    if (!template) {
      throw new Error("Vardiya şablonu bulunamadı");
    }
    return {
      id: requirement.id,
      date: new Date(requirement.date),
      requiredHeadcount: requirement.requiredHeadcount,
      locationId: requirement.locationId,
      roleRequirements: requirement.roleRequirements,
      shiftTemplate: {
        id: template.id,
        startTime: template.startTime,
        endTime: template.endTime,
        crossesMidnight: template.crossesMidnight,
        isNightShift: template.isNightShift,
        isOnCall: template.isOnCall,
        minimumRestHoursAfter: template.minimumRestHoursAfter,
      },
    };
  });

  requirements.sort((a, b) => {
    const aIsNight = a.shiftTemplate.isNightShift ? 0 : 1;
    const bIsNight = b.shiftTemplate.isNightShift ? 0 : 1;
    if (aIsNight !== bIsNight) return aIsNight - bIsNight;

    const aIsWeekend = isWeekend(a.date) ? 0 : 1;
    const bIsWeekend = isWeekend(b.date) ? 0 : 1;
    if (aIsWeekend !== bIsWeekend) return aIsWeekend - bIsWeekend;

    return a.date.getTime() - b.date.getTime();
  });

  const people = new Map<string, SolverPerson>();
  for (const person of inputs.people) {
    people.set(person.id, {
      id: person.id,
      isActive: person.isActive,
      role: person.role,
      workRule: person.workRule
        ? {
            maxAssignmentsPerPeriod: person.workRule.maxAssignmentsPerPeriod,
            maxNightAssignmentsPerPeriod: person.workRule.maxNightAssignmentsPerPeriod,
            maxWeekendAssignmentsPerPeriod:
              person.workRule.maxWeekendAssignmentsPerPeriod,
            maxOnCallAssignmentsPerPeriod: person.workRule.maxOnCallAssignmentsPerPeriod,
            minRestHoursBetweenAssignments:
              person.workRule.minRestHoursBetweenAssignments,
            allowBackToBackNightShift: person.workRule.allowBackToBackNightShift,
          }
        : null,
      locationRules: person.locationRules.map((rule) => ({
        locationId: rule.locationId,
        allowed: rule.allowed,
      })),
      availabilityRules: person.availabilityRules.map(toAvailabilityRule),
    });
  }

  const personAssignments = new Map<string, TrackingAssignment[]>();
  for (const person of inputs.people) {
    const tracked: TrackingAssignment[] = [];
    for (const assignment of person.assignments) {
      if (!(assignment.isLocked || assignment.source !== AssignmentSource.AUTO)) continue;
      const requirement = assignment.shiftRequirement;
      const template = requirement?.shiftTemplate;
      if (!requirement || !template) continue;
      tracked.push({
        startDateTime: new Date(assignment.startDateTime),
        endDateTime: new Date(assignment.endDateTime),
        isNightShift: template.isNightShift,
        isOnCall: template.isOnCall,
        locationId: requirement.locationId,
        date: startOfDay(new Date(assignment.startDateTime)),
      });
    }
    personAssignments.set(person.id, tracked);
  }

  const survivingByRequirement = new Map<string, SurvivingSlot[]>();
  for (const assignment of inputs.survivingAssignments) {
    const slots = survivingByRequirement.get(assignment.shiftRequirementId) ?? [];
    slots.push({
      personId: assignment.personId,
      role: assignment.role,
      status: assignment.status,
    });
    survivingByRequirement.set(assignment.shiftRequirementId, slots);
  }

  return { requirements, people, personAssignments, survivingByRequirement };
}

function solve(inputs: ScheduleGenerationInputs): {
  schedule: GeneratedSchedule;
  result: ScheduleGenerationResult;
} {
  const { requirements, people, personAssignments, survivingByRequirement } =
    buildSolverInputs(inputs);
  const periodId = inputs.period.id;

  let totalAssigned = 0;
  let totalUnfilled = 0;
  const newAssignments: NewAssignment[] = [];
  const conflictEntries: NewConflictLog[] = [];

  const periodAssignCount = new Map<string, number>();
  const periodNightCount = new Map<string, number>();
  const periodWeekendCount = new Map<string, number>();
  const periodOnCallCount = new Map<string, number>();

  for (const [personId, assignments] of personAssignments.entries()) {
    periodAssignCount.set(personId, assignments.length);
    periodNightCount.set(personId, assignments.filter((a) => a.isNightShift).length);
    periodWeekendCount.set(personId, assignments.filter((a) => isWeekend(a.date)).length);
    periodOnCallCount.set(personId, assignments.filter((a) => a.isOnCall).length);
  }

  for (const req of requirements) {
    const reqStart = shiftStart(req.date, req.shiftTemplate.startTime);
    const reqEnd = shiftEnd(req.date, req.shiftTemplate.endTime, req.shiftTemplate.crossesMidnight);

    const surviving = survivingByRequirement.get(req.id) ?? [];
    let filled = surviving.filter((s) => s.status === AssignmentStatus.ASSIGNED).length;
    const assignedToReq = new Set<string>(
      surviving.map((s) => s.personId).filter((id): id is string => id !== null)
    );

    const slotRoles: string[] = [];
    const roleReqs = req.roleRequirements;
    if (roleReqs && typeof roleReqs === "object") {
      for (const [roleName, count] of Object.entries(roleReqs)) {
        for (let i = 0; i < count; i++) slotRoles.push(roleName);
      }
    }
    while (slotRoles.length < req.requiredHeadcount) slotRoles.push("ANY");
    const totalSlots = slotRoles.length;

    for (const slot of surviving) {
      const wantedRole = slot.role ?? "ANY";
      const exactIndex = slotRoles.indexOf(wantedRole);
      const index = exactIndex !== -1 ? exactIndex : slotRoles.indexOf("ANY");
      if (index !== -1) slotRoles.splice(index, 1);
    }

    for (const requiredRole of slotRoles) {
      type Candidate = { personId: string; score: number };
      const candidates: Candidate[] = [];

      const allPersonIds = [...people.keys()];
      const totalPeople = allPersonIds.length;
      const avgAssignments =
        totalPeople > 0
          ? [...periodAssignCount.values()].reduce((sum, value) => sum + value, 0) /
            totalPeople
          : 0;

      for (const personId of allPersonIds) {
        const person = people.get(personId);
        if (!person) continue;
        const personTrack = personAssignments.get(personId) ?? [];

        if (assignedToReq.has(personId)) continue;
        if (!person.isActive) continue;
        if (requiredRole !== "ANY" && person.role !== requiredRole) continue;

        const locationAllowed = person.locationRules.some(
          (rule) => rule.locationId === req.locationId && rule.allowed
        );
        if (!locationAllowed) continue;

        if (isPersonUnavailable(person, req.date, reqStart, reqEnd)) continue;

        const hasOverlap = personTrack.some((a) =>
          overlaps(reqStart, reqEnd, a.startDateTime, a.endDateTime)
        );
        if (hasOverlap) continue;

        const minRest = person.workRule?.minRestHoursBetweenAssignments ?? 12;
        const tooClose = personTrack.some((a) => {
          const gap1 = (reqStart.getTime() - a.endDateTime.getTime()) / 3600000;
          const gap2 = (a.startDateTime.getTime() - reqEnd.getTime()) / 3600000;
          return (gap1 >= 0 && gap1 < minRest) || (gap2 >= 0 && gap2 < minRest);
        });
        if (tooClose) continue;

        const maxAssign = person.workRule?.maxAssignmentsPerPeriod ?? null;
        const currentCount = periodAssignCount.get(personId) ?? 0;
        if (maxAssign !== null && currentCount >= maxAssign) continue;

        if (req.shiftTemplate.isNightShift) {
          const maxNight = person.workRule?.maxNightAssignmentsPerPeriod ?? null;
          const currentNight = periodNightCount.get(personId) ?? 0;
          if (maxNight !== null && currentNight >= maxNight) continue;
        }

        if (isWeekend(req.date)) {
          const maxWeekend = person.workRule?.maxWeekendAssignmentsPerPeriod ?? null;
          const currentWeekend = periodWeekendCount.get(personId) ?? 0;
          if (maxWeekend !== null && currentWeekend >= maxWeekend) continue;
        }

        if (req.shiftTemplate.isOnCall) {
          const maxOnCall = person.workRule?.maxOnCallAssignmentsPerPeriod ?? null;
          const currentOnCall = periodOnCallCount.get(personId) ?? 0;
          if (maxOnCall !== null && currentOnCall >= maxOnCall) continue;
        }

        let score = 100;

        const availMatch = getAvailabilityMatch(person, req.date, reqStart, reqEnd);
        if (availMatch === "preferred") score += 15;
        if (availMatch === "unpreferred") score -= 10;

        if (currentCount < avgAssignments) score += 10;
        if (currentCount > avgAssignments) score -= 20;

        if (
          req.shiftTemplate.isNightShift &&
          !(person.workRule?.allowBackToBackNightShift ?? false)
        ) {
          const lastNight = personTrack
            .filter((a) => a.isNightShift)
            .sort((a, b) => b.endDateTime.getTime() - a.endDateTime.getTime())[0];
          if (lastNight) {
            const hoursSinceLast =
              (reqStart.getTime() - lastNight.endDateTime.getTime()) / 3600000;
            if (hoursSinceLast >= 0 && hoursSinceLast < 24) score -= 25;
          }
        }

        const recentHeavy = personTrack.some((a) => {
          const diff = Math.abs(reqStart.getTime() - a.endDateTime.getTime()) / 3600000;
          return diff < 24;
        });
        if (recentHeavy) score -= 15;

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

      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const best = candidates[0];
        if (!best) continue;

        newAssignments.push({
          periodId,
          shiftRequirementId: req.id,
          personId: best.personId,
          date: req.date.toISOString(),
          startDateTime: reqStart.toISOString(),
          endDateTime: reqEnd.toISOString(),
          role: requiredRole !== "ANY" ? requiredRole : null,
          isOnCall: req.shiftTemplate.isOnCall,
          status: AssignmentStatus.ASSIGNED,
          isLocked: false,
          source: AssignmentSource.AUTO,
          score: best.score,
          notes: null,
        });

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

        periodAssignCount.set(best.personId, (periodAssignCount.get(best.personId) ?? 0) + 1);
        if (req.shiftTemplate.isNightShift) {
          periodNightCount.set(best.personId, (periodNightCount.get(best.personId) ?? 0) + 1);
        }
        if (isWeekend(req.date)) {
          periodWeekendCount.set(
            best.personId,
            (periodWeekendCount.get(best.personId) ?? 0) + 1
          );
        }
        if (req.shiftTemplate.isOnCall) {
          periodOnCallCount.set(best.personId, (periodOnCallCount.get(best.personId) ?? 0) + 1);
        }

        assignedToReq.add(best.personId);
        filled++;
        totalAssigned++;
      } else {
        newAssignments.push({
          periodId,
          shiftRequirementId: req.id,
          personId: null,
          date: req.date.toISOString(),
          startDateTime: reqStart.toISOString(),
          endDateTime: reqEnd.toISOString(),
          role: requiredRole !== "ANY" ? requiredRole : null,
          isOnCall: req.shiftTemplate.isOnCall,
          status: AssignmentStatus.UNFILLED,
          isLocked: false,
          source: AssignmentSource.AUTO,
          score: null,
          notes: null,
        });
        totalUnfilled++;
      }
    }

    const unfilled = totalSlots - filled;
    if (unfilled > 0) {
      conflictEntries.push({
        periodId,
        shiftRequirementId: req.id,
        personId: null,
        type: "UNFILLED_REQUIREMENT",
        severity: ConflictSeverity.ERROR,
        message: `Requirement on ${req.date.toISOString().slice(0, 10)} could not be fully staffed: ${unfilled} slot(s) unfilled.`,
        metadata: null,
      });
    }
  }

  const total = totalAssigned + totalUnfilled;
  const summary = `Generated ${new Date().toISOString()}: ${totalAssigned}/${total} slots filled, ${totalUnfilled} unfilled, ${conflictEntries.length} conflicts.`;

  return {
    schedule: {
      assignments: newAssignments,
      conflicts: conflictEntries,
      generationNotes: summary,
    },
    result: {
      assigned: totalAssigned,
      unfilled: totalUnfilled,
      total,
      conflicts: conflictEntries.length,
    },
  };
}

/** Dönem için çizelge üretir, yazar ve senkronu tetikler. */
export async function generateScheduleForPeriod(
  periodId: string
): Promise<ScheduleGenerationResult> {
  const inputs = await schedulePeriodsRepo.getGenerationInputs(periodId);
  const { schedule, result } = solve(inputs);
  await schedulePeriodsRepo.applyGeneratedSchedule(periodId, schedule);
  driveSync.markDirty();
  return result;
}
