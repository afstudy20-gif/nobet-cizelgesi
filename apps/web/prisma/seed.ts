import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // People
  const people = await Promise.all([
    prisma.person.upsert({
      where: { code: "P001" },
      update: {},
      create: { code: "P001", firstName: "Ayşe", lastName: "Yılmaz", fullName: "Ayşe Yılmaz", isActive: true, notes: "Gece nöbetini mümkünse az almalı." },
    }),
    prisma.person.upsert({
      where: { code: "P002" },
      update: {},
      create: { code: "P002", firstName: "Mehmet", lastName: "Kaya", fullName: "Mehmet Kaya", isActive: true, notes: "Hafta sonu çalışabilir." },
    }),
    prisma.person.upsert({
      where: { code: "P003" },
      update: {},
      create: { code: "P003", firstName: "Elif", lastName: "Demir", fullName: "Elif Demir", isActive: true, notes: "Yarı zamanlı düzen." },
    }),
    prisma.person.upsert({
      where: { code: "P004" },
      update: {},
      create: { code: "P004", firstName: "Burak", lastName: "Şen", fullName: "Burak Şen", isActive: true, notes: "Acil kapatma atamaları için uygun." },
    }),
  ]);

  // Locations
  const loc1 = await prisma.location.upsert({
    where: { code: "LOC1" },
    update: {},
    create: { code: "LOC1", name: "Merkez Klinik", isActive: true },
  });
  const loc2 = await prisma.location.upsert({
    where: { code: "LOC2" },
    update: {},
    create: { code: "LOC2", name: "Ek Hizmet Binası", isActive: true },
  });

  // Shift Templates
  const sabah = await prisma.shiftTemplate.upsert({
    where: { code: "SABAH" },
    update: {},
    create: {
      code: "SABAH", name: "Sabah Vardiyası",
      startTime: "08:00", endTime: "16:00",
      crossesMidnight: false, requiredHeadcount: 1,
      isNightShift: false, minimumRestHoursAfter: 12,
      color: "#3B82F6", isActive: true,
    },
  });
  const aksam = await prisma.shiftTemplate.upsert({
    where: { code: "AKSAM" },
    update: {},
    create: {
      code: "AKSAM", name: "Akşam Vardiyası",
      startTime: "16:00", endTime: "00:00",
      crossesMidnight: true, requiredHeadcount: 1,
      isNightShift: false, minimumRestHoursAfter: 12,
      color: "#F59E0B", isActive: true,
    },
  });
  const gece = await prisma.shiftTemplate.upsert({
    where: { code: "GECE" },
    update: {},
    create: {
      code: "GECE", name: "Gece Nöbeti",
      startTime: "00:00", endTime: "08:00",
      crossesMidnight: false, requiredHeadcount: 1,
      isNightShift: true, minimumRestHoursAfter: 24,
      color: "#6366F1", isActive: true,
    },
  });

  // Coverage Rules
  await prisma.coverageRule.deleteMany({}); // clean for idempotency
  await prisma.coverageRule.createMany({
    data: [
      { locationId: loc1.id, shiftTemplateId: sabah.id, ruleType: "WEEKLY", weekdays: [1,2,3,4,5], requiredHeadcount: 1, priority: 0, isActive: true },
      { locationId: loc1.id, shiftTemplateId: aksam.id, ruleType: "WEEKLY", weekdays: [1,2,3,4,5,6,7], requiredHeadcount: 1, priority: 0, isActive: true },
      { locationId: loc1.id, shiftTemplateId: gece.id, ruleType: "WEEKLY", weekdays: [1,2,3,4,5,6,7], requiredHeadcount: 1, priority: 0, isActive: true },
      { locationId: loc2.id, shiftTemplateId: sabah.id, ruleType: "WEEKLY", weekdays: [1,3,5], requiredHeadcount: 1, priority: 0, isActive: true },
    ],
  });

  // Person Location Rules
  const locationRuleData = [
    { personId: people[0].id, locationId: loc1.id, allowed: true, priority: 0 },
    { personId: people[1].id, locationId: loc1.id, allowed: true, priority: 0 },
    { personId: people[1].id, locationId: loc2.id, allowed: true, priority: 0 },
    { personId: people[2].id, locationId: loc1.id, allowed: true, priority: 0 },
    { personId: people[3].id, locationId: loc1.id, allowed: true, priority: 0 },
    { personId: people[3].id, locationId: loc2.id, allowed: true, priority: 0 },
  ];
  for (const rule of locationRuleData) {
    await prisma.personLocationRule.upsert({
      where: { personId_locationId: { personId: rule.personId, locationId: rule.locationId } },
      update: {},
      create: rule,
    });
  }

  // Person Work Rules
  const workRules = [
    { personId: people[0].id, maxAssignmentsPerPeriod: 18, maxNightAssignmentsPerPeriod: 2, maxWeekendAssignmentsPerPeriod: 3, minRestHoursBetweenAssignments: 12, allowBackToBackNightShift: false },
    { personId: people[1].id, maxAssignmentsPerPeriod: 22, maxNightAssignmentsPerPeriod: 6, maxWeekendAssignmentsPerPeriod: 6, minRestHoursBetweenAssignments: 12, allowBackToBackNightShift: false },
    { personId: people[2].id, maxAssignmentsPerPeriod: 12, maxNightAssignmentsPerPeriod: 0, maxWeekendAssignmentsPerPeriod: 2, minRestHoursBetweenAssignments: 12, allowBackToBackNightShift: false },
    { personId: people[3].id, maxAssignmentsPerPeriod: 24, maxNightAssignmentsPerPeriod: 8, maxWeekendAssignmentsPerPeriod: 6, minRestHoursBetweenAssignments: 12, allowBackToBackNightShift: true },
  ];
  for (const rule of workRules) {
    await prisma.personWorkRule.upsert({
      where: { personId: rule.personId },
      update: rule,
      create: rule,
    });
  }

  // Availability Rules
  await prisma.availabilityRule.deleteMany({});
  await prisma.availabilityRule.createMany({
    data: [
      { personId: people[0].id, ruleType: "WEEKLY", availabilityType: "AVAILABLE", weekdays: [1,2,3,4,5], startTime: "08:00", endTime: "16:00" },
      { personId: people[0].id, ruleType: "WEEKLY", availabilityType: "UNAVAILABLE", weekdays: [6,7] },
      { personId: people[0].id, ruleType: "DATE_RANGE", availabilityType: "UNAVAILABLE", validFrom: new Date("2026-04-10"), validTo: new Date("2026-04-12"), notes: "Yıllık izin" },
      { personId: people[1].id, ruleType: "WEEKLY", availabilityType: "AVAILABLE", weekdays: [1,2,3,4,5,6,7], startTime: "16:00", endTime: "23:59" },
      { personId: people[2].id, ruleType: "WEEKLY", availabilityType: "AVAILABLE", weekdays: [1,3,5], startTime: "08:00", endTime: "16:00" },
      { personId: people[3].id, ruleType: "WEEKLY", availabilityType: "AVAILABLE", weekdays: [1,2,3,4,5,6,7], startTime: "00:00", endTime: "23:59" },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
