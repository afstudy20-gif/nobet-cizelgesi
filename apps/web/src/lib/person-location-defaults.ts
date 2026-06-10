import { prisma } from "@/lib/prisma";

/** Grant access to every active location for a newly created person. */
export async function grantDefaultLocationRules(personId: string): Promise<number> {
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  if (locations.length === 0) return 0;

  const result = await prisma.personLocationRule.createMany({
    data: locations.map((loc) => ({
      personId,
      locationId: loc.id,
      allowed: true,
      priority: 0,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function grantDefaultLocationRulesForPeople(
  personIds: string[]
): Promise<void> {
  if (personIds.length === 0) return;

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  if (locations.length === 0) return;

  await prisma.personLocationRule.createMany({
    data: personIds.flatMap((personId) =>
      locations.map((loc) => ({
        personId,
        locationId: loc.id,
        allowed: true,
        priority: 0,
      }))
    ),
    skipDuplicates: true,
  });
}

/** Backfill missing allowed rules for active people (existing records). */
export async function backfillMissingLocationAccess(): Promise<number> {
  const [activePeople, activeLocations] = await Promise.all([
    prisma.person.findMany({
      where: { isActive: true },
      select: {
        id: true,
        locationRules: { where: { allowed: true }, select: { locationId: true } },
      },
    }),
    prisma.location.findMany({
      where: { isActive: true },
      select: { id: true },
    }),
  ]);

  if (activeLocations.length === 0 || activePeople.length === 0) return 0;

  const locationIds = activeLocations.map((l) => l.id);
  const toCreate: Array<{
    personId: string;
    locationId: string;
    allowed: boolean;
    priority: number;
  }> = [];

  for (const person of activePeople) {
    const allowed = new Set(person.locationRules.map((r) => r.locationId));
    for (const locationId of locationIds) {
      if (!allowed.has(locationId)) {
        toCreate.push({
          personId: person.id,
          locationId,
          allowed: true,
          priority: 0,
        });
      }
    }
  }

  if (toCreate.length === 0) return 0;

  const result = await prisma.personLocationRule.createMany({
    data: toCreate,
    skipDuplicates: true,
  });
  return result.count;
}