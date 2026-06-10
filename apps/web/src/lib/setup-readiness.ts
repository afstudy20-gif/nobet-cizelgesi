import { prisma } from "@/lib/prisma";

export type SetupCheckItem = {
  key: string;
  ok: boolean;
  count: number;
  href: string;
};

export type SetupReadiness = {
  ready: boolean;
  items: SetupCheckItem[];
  blockers: string[];
  peopleWithoutLocationAccess: number;
};

export async function getSetupReadiness(): Promise<SetupReadiness> {
  const [
    activePeople,
    activeLocations,
    activeShifts,
    activeCoverageRules,
    peopleWithRules,
  ] = await Promise.all([
    prisma.person.count({ where: { isActive: true } }),
    prisma.location.count({ where: { isActive: true } }),
    prisma.shiftTemplate.count({ where: { isActive: true } }),
    prisma.coverageRule.count({ where: { isActive: true } }),
    prisma.person.findMany({
      where: { isActive: true },
      select: {
        id: true,
        locationRules: {
          where: { allowed: true },
          select: { locationId: true },
        },
      },
    }),
  ]);

  const requiredLocationIds = new Set(
    (
      await prisma.coverageRule.findMany({
        where: { isActive: true },
        select: { locationId: true },
        distinct: ["locationId"],
      })
    ).map((r) => r.locationId)
  );

  const peopleWithoutLocationAccess = peopleWithRules.filter((person) => {
    if (requiredLocationIds.size === 0) return false;
    const allowed = new Set(
      person.locationRules.map((r) => r.locationId)
    );
    for (const locId of requiredLocationIds) {
      if (!allowed.has(locId)) return true;
    }
    return false;
  }).length;

  const items: SetupCheckItem[] = [
    {
      key: "people",
      ok: activePeople > 0,
      count: activePeople,
      href: "/people",
    },
    {
      key: "locations",
      ok: activeLocations > 0,
      count: activeLocations,
      href: "/locations",
    },
    {
      key: "shifts",
      ok: activeShifts > 0,
      count: activeShifts,
      href: "/shifts",
    },
    {
      key: "coverage",
      ok: activeCoverageRules > 0,
      count: activeCoverageRules,
      href: "/coverage-rules",
    },
    {
      key: "locationAccess",
      ok: activePeople === 0 || peopleWithoutLocationAccess === 0,
      count: activePeople - peopleWithoutLocationAccess,
      href: "/people",
    },
  ];

  const blockers: string[] = [];
  if (activePeople === 0) blockers.push("Aktif personel yok.");
  if (activeLocations === 0) blockers.push("Aktif çalışma yeri yok.");
  if (activeShifts === 0) blockers.push("Aktif vardiya şablonu yok.");
  if (activeCoverageRules === 0) blockers.push("Nöbet ihtiyaç kuralı tanımlı değil.");
  if (activePeople > 0 && peopleWithoutLocationAccess > 0) {
    blockers.push(
      `${peopleWithoutLocationAccess} aktif personelin nöbet lokasyonu izni eksik.`
    );
  }

  const ready = blockers.length === 0;

  return {
    ready,
    items,
    blockers,
    peopleWithoutLocationAccess,
  };
}