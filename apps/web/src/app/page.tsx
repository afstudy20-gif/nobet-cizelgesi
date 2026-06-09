export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

async function getStats() {
  const [people, locations, shifts, activePeriods, unfilled] = await Promise.all([
    prisma.person.count({ where: { isActive: true } }),
    prisma.location.count({ where: { isActive: true } }),
    prisma.shiftTemplate.count({ where: { isActive: true } }),
    prisma.schedulePeriod.count({ where: { status: { not: "ARCHIVED" } } }),
    prisma.assignment.count({ where: { status: "UNFILLED" } }),
  ]);
  return { people, locations, shifts, activePeriods, unfilled };
}

export default async function DashboardPage() {
  const stats = await getStats();
  return <DashboardContent stats={stats} />;
}