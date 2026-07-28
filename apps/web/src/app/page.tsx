"use client";

import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { useLive } from "@/lib/db/live";
import {
  assignmentsRepo,
  getSetupReadiness,
  locationsRepo,
  peopleRepo,
  schedulePeriodsRepo,
  shiftTemplatesRepo,
} from "@/lib/db/repo";

async function getStats(): Promise<{
  people: number;
  locations: number;
  shifts: number;
  activePeriods: number;
  unfilled: number;
}> {
  const [people, locations, shifts, periods, unfilled] = await Promise.all([
    peopleRepo.list({ isActive: true }),
    locationsRepo.list({ isActive: true }),
    shiftTemplatesRepo.list({ isActive: true }),
    schedulePeriodsRepo.list(),
    assignmentsRepo.list({ status: "UNFILLED" }),
  ]);
  return {
    people: people.length,
    locations: locations.length,
    shifts: shifts.length,
    activePeriods: periods.filter((p) => p.status !== "ARCHIVED").length,
    unfilled: unfilled.length,
  };
}

export default function DashboardPage(): React.ReactElement {
  const stats = useLive(getStats, []);
  const readiness = useLive(getSetupReadiness, []);

  if (stats.loading || readiness.loading) {
    return <div className="p-6 text-sm text-gray-500">Yükleniyor...</div>;
  }
  if (stats.error || readiness.error || !stats.data || !readiness.data) {
    return (
      <div className="p-6 text-sm text-red-600">
        {stats.error?.message ?? readiness.error?.message ?? "Veriler yüklenemedi."}
      </div>
    );
  }

  return <DashboardContent stats={stats.data} readiness={readiness.data} />;
}
