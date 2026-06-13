import { PrismaClient, AssignmentStatus, AssignmentSource, ConflictSeverity } from "@prisma/client";
import { parseCalendarDate, eachCalendarDayInRange, coverageRuleMatchesDay, normalizeCalendarDate } from "@nobet/scheduler";
import { getISODay, addDays, startOfDay, isWithinInterval } from "date-fns";
import {
  shiftStart,
  shiftEnd,
  overlaps,
  isWeekend,
  isPersonUnavailable,
  getAvailabilityMatch,
} from "@nobet/scheduler";

const prisma = new PrismaClient();

async function simulate() {
  console.log("=== SIMULATION 2 STARTED (50 People, Roles, On-Call) ===");

  // 1. Clean up database
  console.log("Cleaning up database...");
  await prisma.conflictLog.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.shiftRequirement.deleteMany();
  await prisma.schedulePeriod.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.personWorkRule.deleteMany();
  await prisma.personLocationRule.deleteMany();
  await prisma.coverageRule.deleteMany();
  await prisma.shiftTemplate.deleteMany();
  await prisma.location.deleteMany();
  await prisma.person.deleteMany();

  // 2. Create 50 People
  console.log("Creating 50 people...");
  const people = [];
  for (let i = 1; i <= 50; i++) {
    const code = `P${String(i).padStart(3, "0")}`;
    const firstName = `Personel`;
    const lastName = `${i}`;
    const fullName = `${firstName} ${lastName}`;
    
    // Assign roles: 12 Uzman, 8 Hemsire, 30 Asistan
    let role = "ASISTAN";
    if (i <= 12) {
      role = "UZMAN";
    } else if (i <= 20) {
      role = "HEMSIRE";
    }

    const p = await prisma.person.create({
      data: { code, firstName, lastName, fullName, role, isActive: true },
    });
    people.push(p);
  }

  // 3. Create Locations
  // 5 Polyclinics + 1 ICU + 2 Wards = 8 locations total
  console.log("Creating 8 locations...");
  const polyclinics = [];
  
  // 5 Polyclinics
  for (let i = 1; i <= 5; i++) {
    const loc = await prisma.location.create({
      data: { code: `POLI_${i}`, name: `Poliklinik ${i}`, isActive: true },
    });
    polyclinics.push(loc);
  }
  
  // 1 ICU (Yoğun Bakım)
  const icu = await prisma.location.create({
    data: { code: "ICU", name: "Yoğun Bakım", isActive: true },
  });
  
  // 2 Wards (Servis 1, Servis 2)
  const ward1 = await prisma.location.create({
    data: { code: "WARD_1", name: "Servis 1", isActive: true },
  });
  const ward2 = await prisma.location.create({
    data: { code: "WARD_2", name: "Servis 2", isActive: true },
  });

  const allLocations = [...polyclinics, icu, ward1, ward2];

  // 4. Create Shift Templates
  console.log("Creating shift templates...");
  const gunduz = await prisma.shiftTemplate.create({
    data: {
      code: "GUNDUZ",
      name: "Gündüz Mesaisi",
      startTime: "08:00",
      endTime: "17:00",
      crossesMidnight: false,
      requiredHeadcount: 1,
      isNightShift: false,
      minimumRestHoursAfter: 12,
      isActive: true,
    },
  });
  
  const nobet = await prisma.shiftTemplate.create({
    data: {
      code: "NOBET",
      name: "Akşam Nöbeti",
      startTime: "17:00",
      endTime: "08:00",
      crossesMidnight: true,
      requiredHeadcount: 2,
      isNightShift: true,
      minimumRestHoursAfter: 24,
      isActive: true,
    },
  });

  const onCall = await prisma.shiftTemplate.create({
    data: {
      code: "ICAP",
      name: "İcap Nöbeti (Yedek)",
      startTime: "17:00",
      endTime: "08:00",
      crossesMidnight: true,
      requiredHeadcount: 1,
      isNightShift: false,
      isOnCall: true,
      minimumRestHoursAfter: 0,
      isActive: true,
    },
  });

  // 5. Create Coverage Rules
  console.log("Creating coverage rules...");
  
  // Weekday daytime rules (Monday-Friday):
  // 5 Polyclinics: 1 Uzman each
  for (const poly of polyclinics) {
    await prisma.coverageRule.create({
      data: { locationId: poly.id, shiftTemplateId: gunduz.id, ruleType: "WEEKLY", weekdays: [1, 2, 3, 4, 5], requiredHeadcount: 1, roleRequirements: { UZMAN: 1 } },
    });
  }
  // ICU Daytime: 1 Uzman
  await prisma.coverageRule.create({
    data: { locationId: icu.id, shiftTemplateId: gunduz.id, ruleType: "WEEKLY", weekdays: [1, 2, 3, 4, 5], requiredHeadcount: 1, roleRequirements: { UZMAN: 1 } },
  });
  // Wards Daytime: 1 Asistan each
  await prisma.coverageRule.create({
    data: { locationId: ward1.id, shiftTemplateId: gunduz.id, ruleType: "WEEKLY", weekdays: [1, 2, 3, 4, 5], requiredHeadcount: 1, roleRequirements: { ASISTAN: 1 } },
  });
  await prisma.coverageRule.create({
    data: { locationId: ward2.id, shiftTemplateId: gunduz.id, ruleType: "WEEKLY", weekdays: [1, 2, 3, 4, 5], requiredHeadcount: 1, roleRequirements: { ASISTAN: 1 } },
  });
  
  // Night Duty (NOBET) rules every day:
  // ICU: 1 Uzman + 1 Asistan
  await prisma.coverageRule.create({
    data: {
      locationId: icu.id,
      shiftTemplateId: nobet.id,
      ruleType: "WEEKLY",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      requiredHeadcount: 2,
      roleRequirements: { UZMAN: 1, ASISTAN: 1 },
    },
  });
  // Ward 1 (covers ward duty): 1 Asistan + 1 Hemşire
  await prisma.coverageRule.create({
    data: {
      locationId: ward1.id,
      shiftTemplateId: nobet.id,
      ruleType: "WEEKLY",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      requiredHeadcount: 2,
      roleRequirements: { ASISTAN: 1, HEMSIRE: 1 },
    },
  });

  // On-Call (İcap) rules every day:
  // ICU: 1 Uzman
  await prisma.coverageRule.create({
    data: {
      locationId: icu.id,
      shiftTemplateId: onCall.id,
      ruleType: "WEEKLY",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      requiredHeadcount: 1,
      roleRequirements: { UZMAN: 1 },
    },
  });
  // Ward 1: 1 Asistan
  await prisma.coverageRule.create({
    data: {
      locationId: ward1.id,
      shiftTemplateId: onCall.id,
      ruleType: "WEEKLY",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      requiredHeadcount: 1,
      roleRequirements: { ASISTAN: 1 },
    },
  });

  // 6. Set Location Rules (Allow everyone to work everywhere)
  console.log("Configuring location rules...");
  for (const p of people) {
    for (const loc of allLocations) {
      await prisma.personLocationRule.create({ data: { personId: p.id, locationId: loc.id, allowed: true } });
    }
  }

  // 7. Set Work Rules
  console.log("Configuring work rules...");
  for (const p of people) {
    await prisma.personWorkRule.create({
      data: {
        personId: p.id,
        maxAssignmentsPerPeriod: 12,
        maxNightAssignmentsPerPeriod: 5,
        maxWeekendAssignmentsPerPeriod: 5,
        maxOnCallAssignmentsPerPeriod: 4, // Max 4 on-call duties
        minRestHoursBetweenAssignments: 12,
        allowBackToBackNightShift: false,
      },
    });
  }

  // 8. Create Period
  console.log("Creating Schedule Period...");
  const period = await prisma.schedulePeriod.create({
    data: {
      name: "Temmuz 2026 Simülasyonu 2 (50 Kişi)",
      startDate: parseCalendarDate("2026-07-01"),
      endDate: parseCalendarDate("2026-07-30"),
      status: "DRAFT",
    },
  });

  // 9. Generate Requirements
  console.log("Generating requirements...");
  const coverageRules = await prisma.coverageRule.findMany({ where: { isActive: true } });
  const days = eachCalendarDayInRange(period.startDate, period.endDate);
  let reqCreated = 0;

  for (const day of days) {
    for (const rule of coverageRules) {
      if (!coverageRuleMatchesDay(rule, day)) continue;
      await prisma.shiftRequirement.create({
        data: {
          periodId: period.id,
          date: normalizeCalendarDate(day),
          shiftTemplateId: rule.shiftTemplateId,
          locationId: rule.locationId,
          requiredHeadcount: rule.requiredHeadcount,
          roleRequirements: rule.roleRequirements ?? undefined,
        },
      });
      reqCreated++;
    }
  }
  console.log(`Generated ${reqCreated} shift requirements.`);

  // 10. Run Schedule Generation Algorithm
  console.log("Running schedule generation algorithm...");
  const rawRequirements = await prisma.shiftRequirement.findMany({
    where: { periodId: period.id },
    include: { shiftTemplate: true, location: true },
  });

  const rawPeople = await prisma.person.findMany({
    where: { isActive: true },
    include: {
      workRule: true,
      locationRules: true,
      availabilityRules: true,
      assignments: { where: { periodId: period.id }, include: { shiftRequirement: { include: { shiftTemplate: true } } } },
    },
  });

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
    personAssignments.set(person.id, []);
  }

  type RequirementType = {
    id: string;
    date: Date;
    requiredHeadcount: number;
    roleRequirements: any;
    locationId: string;
    shiftTemplate: {
      id: string;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      isNightShift: boolean;
      isOnCall: boolean;
      minimumRestHoursAfter: number;
    };
  };

  const requirements: RequirementType[] = rawRequirements.map((r) => ({
    id: r.id,
    date: r.date,
    requiredHeadcount: r.requiredHeadcount,
    roleRequirements: r.roleRequirements,
    locationId: r.locationId,
    shiftTemplate: r.shiftTemplate,
  }));

  // Sort requirements: Night shifts first, then weekends, then by date
  requirements.sort((a, b) => {
    const aIsNight = a.shiftTemplate.isNightShift ? 0 : 1;
    const bIsNight = b.shiftTemplate.isNightShift ? 0 : 1;
    if (aIsNight !== bIsNight) return aIsNight - bIsNight;

    const aIsWeekend = isWeekend(a.date) ? 0 : 1;
    const bIsWeekend = isWeekend(b.date) ? 0 : 1;
    if (aIsWeekend !== bIsWeekend) return aIsWeekend - bIsWeekend;

    return a.date.getTime() - b.date.getTime();
  });

  const peopleMap = new Map();
  for (const p of rawPeople) {
    peopleMap.set(p.id, p);
  }

  let totalAssigned = 0;
  let totalUnfilled = 0;
  const newAssignments = [];
  const conflictEntries = [];

  const periodAssignCount = new Map<string, number>();
  const periodNightCount = new Map<string, number>();
  const periodWeekendCount = new Map<string, number>();
  const periodOnCallCount = new Map<string, number>();

  for (const person of rawPeople) {
    periodAssignCount.set(person.id, 0);
    periodNightCount.set(person.id, 0);
    periodWeekendCount.set(person.id, 0);
    periodOnCallCount.set(person.id, 0);
  }

  for (const req of requirements) {
    const reqStart = shiftStart(req.date, req.shiftTemplate.startTime);
    const reqEnd = shiftEnd(req.date, req.shiftTemplate.endTime, req.shiftTemplate.crossesMidnight);

    let filled = 0;
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
      const candidates = [];
      const allPersonIds = [...peopleMap.keys()];
      const totalPeople = allPersonIds.length;
      const avgAssignments = totalPeople > 0 ? [...periodAssignCount.values()].reduce((s, v) => s + v, 0) / totalPeople : 0;

      for (const personId of allPersonIds) {
        const person = peopleMap.get(personId);
        const personTrack = personAssignments.get(personId) || [];

        if (assignedToReq.has(personId)) continue;
        if (!person.isActive) continue;

        // Unvan / Rol Kontrolü
        if (requiredRole !== "ANY" && person.role !== requiredRole) continue;

        const locationAllowed = person.locationRules.some((lr: any) => lr.locationId === req.locationId && lr.allowed);
        if (!locationAllowed) continue;

        if (isPersonUnavailable(person, req.date, reqStart, reqEnd)) continue;

        const hasOverlap = personTrack.some((a) => overlaps(reqStart, reqEnd, a.startDateTime, a.endDateTime));
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

        // Passed constraints - score
        let score = 100;
        const availMatch = getAvailabilityMatch(person, req.date, reqStart, reqEnd);
        if (availMatch === "preferred") score += 15;
        if (availMatch === "unpreferred") score -= 10;

        if (req.shiftTemplate.isOnCall) {
          const currentOnCall = periodOnCallCount.get(personId) ?? 0;
          const totalPeopleOnCall = allPersonIds.length;
          const avgOnCall = totalPeopleOnCall > 0 ? [...periodOnCallCount.values()].reduce((s, v) => s + v, 0) / totalPeopleOnCall : 0;
          if (currentOnCall < avgOnCall) score += 15;
          if (currentOnCall > avgOnCall) score -= 20;
        } else {
          if (currentCount < avgAssignments) score += 10;
          if (currentCount > avgAssignments) score -= 20;
        }

        if (req.shiftTemplate.isNightShift && !(person.workRule?.allowBackToBackNightShift ?? false)) {
          const lastNight = personTrack
            .filter((a) => a.isNightShift)
            .sort((a, b) => b.endDateTime.getTime() - a.endDateTime.getTime())[0];
          if (lastNight) {
            const hoursSinceLast = (reqStart.getTime() - lastNight.endDateTime.getTime()) / 3600000;
            if (hoursSinceLast >= 0 && hoursSinceLast < 24) score -= 25;
          }
        }

        const recentHeavy = personTrack.some((a) => {
          const diff = Math.abs(reqStart.getTime() - a.endDateTime.getTime()) / 3600000;
          return diff < 24;
        });
        if (recentHeavy) score -= 15;

        // Location clustering
        const weekStart = new Date(req.date);
        weekStart.setDate(weekStart.getDate() - getISODay(req.date) + 1);
        const weekEnd = addDays(weekStart, 6);
        const sameLocationThisWeek = personTrack.filter(
          (a) => a.locationId === req.locationId && isWithinInterval(a.date, { start: weekStart, end: weekEnd })
        ).length;
        if (sameLocationThisWeek > 2) score -= 10;

        candidates.push({ personId, score });
      }

      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const best = candidates[0];
        newAssignments.push({
          periodId: period.id,
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

        const track = personAssignments.get(best.personId) || [];
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
          periodWeekendCount.set(best.personId, (periodWeekendCount.get(best.personId) ?? 0) + 1);
        }
        if (req.shiftTemplate.isOnCall) {
          periodOnCallCount.set(best.personId, (periodOnCallCount.get(best.personId) ?? 0) + 1);
        }

        assignedToReq.add(best.personId);
        filled++;
        totalAssigned++;
      } else {
        newAssignments.push({
          periodId: period.id,
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

    const unfilled = req.requiredHeadcount - filled;
    if (unfilled > 0) {
      conflictEntries.push({
        periodId: period.id,
        shiftRequirementId: req.id,
        personId: null,
        type: "UNFILLED_REQUIREMENT",
        severity: ConflictSeverity.ERROR,
        message: `Gereksinim ${req.date.toISOString().slice(0, 10)} tarihinde doldurulamadı: ${unfilled} boş kaldı.`,
      });
    }
  }

  // Bulk save
  console.log("Saving assignments to database...");
  await prisma.assignment.createMany({ data: newAssignments });
  if (conflictEntries.length > 0) {
    await prisma.conflictLog.createMany({ data: conflictEntries });
  }

  const total = totalAssigned + totalUnfilled;
  const summaryMsg = `Generated: ${totalAssigned}/${total} slots filled, ${totalUnfilled} unfilled, ${conflictEntries.length} conflicts.`;
  await prisma.schedulePeriod.update({
    where: { id: period.id },
    data: { generationNotes: summaryMsg },
  });

  // 11. Print Results
  console.log("\n=== SIMULATION RESULTS ===");
  console.log(summaryMsg);
  console.log(`Unfilled shift count: ${totalUnfilled}`);
  console.log(`Conflicts: ${conflictEntries.length}`);

  console.log("\nAssignment count per person (first 15 for brevity):");
  let printed = 0;
  for (const [pId, count] of periodAssignCount.entries()) {
    if (printed++ >= 15) break;
    const p = peopleMap.get(pId);
    const role = p.role;
    const nights = periodNightCount.get(pId) || 0;
    const weekends = periodWeekendCount.get(pId) || 0;
    const onCalls = periodOnCallCount.get(pId) || 0;
    console.log(`- ${p.fullName} (${role}): Total=${count}, Nights=${nights}, Weekends=${weekends}, OnCalls=${onCalls}`);
  }
  
  console.log("\n=== SIMULATION FINISHED SUCCESSFUL ===");
}

simulate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
