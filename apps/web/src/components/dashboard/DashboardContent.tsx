"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, MapPin, Clock, CalendarRange, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import type { SetupReadiness } from "@/lib/setup-readiness";

type DashboardStats = {
  people: number;
  locations: number;
  shifts: number;
  activePeriods: number;
  unfilled: number;
};

const SETUP_LABEL_KEYS = {
  people: "dashboard.setupPeople",
  locations: "dashboard.setupLocations",
  shifts: "dashboard.setupShifts",
  coverage: "dashboard.setupCoverage",
  locationAccess: "dashboard.setupLocationAccess",
} as const;

export function DashboardContent({
  stats,
  readiness,
}: {
  stats: DashboardStats;
  readiness: SetupReadiness;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [backfilling, setBackfilling] = useState(false);

  async function handleBackfillLocationAccess() {
    setBackfilling(true);
    try {
      const res = await fetch("/api/people/backfill-location-access", { method: "POST" });
      if (!res.ok) throw new Error("backfill failed");
      router.refresh();
    } catch {
      // refresh anyway on next navigation
    } finally {
      setBackfilling(false);
    }
  }

  const cards = [
    {
      label: t("dashboard.activePeople"),
      value: stats.people,
      icon: Users,
      href: "/people",
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: t("dashboard.locations"),
      value: stats.locations,
      icon: MapPin,
      href: "/locations",
      color: "text-green-600 bg-green-50",
    },
    {
      label: t("dashboard.shiftTemplates"),
      value: stats.shifts,
      icon: Clock,
      href: "/shifts",
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: t("dashboard.activePeriods"),
      value: stats.activePeriods,
      icon: CalendarRange,
      href: "/periods",
      color: "text-orange-600 bg-orange-50",
    },
  ];

  const quickActions = [
    { label: t("dashboard.addPerson"), href: "/people?new=1" },
    { label: t("dashboard.createPeriod"), href: "/periods?new=1" },
    { label: t("dashboard.viewSchedule"), href: "/schedule" },
    { label: t("dashboard.export"), href: "/export" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t("dashboard.title")}</h1>
      </div>

      <div className="card card-body mb-6">
        <div className="flex items-start gap-3 mb-4">
          {readiness.ready ? (
            <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t("dashboard.setupTitle")}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {readiness.ready ? t("dashboard.setupReady") : t("dashboard.setupNotReady")}
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {readiness.items.map((item) => {
            const labelKey = SETUP_LABEL_KEYS[item.key as keyof typeof SETUP_LABEL_KEYS];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                    item.ok
                      ? "border-green-200 bg-green-50 text-green-900 hover:bg-green-100"
                      : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  }`}
                >
                  <span>{labelKey ? t(labelKey) : item.key}</span>
                  <span className="font-medium">{item.ok ? "✓" : "—"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {!readiness.ready && readiness.blockers.length > 0 && (
          <ul className="mt-3 text-sm text-amber-800 list-disc list-inside space-y-1">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
        {readiness.peopleWithoutLocationAccess > 0 && (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={backfilling}
              onClick={handleBackfillLocationAccess}
            >
              {backfilling
                ? "İzinler ekleniyor..."
                : `Eksik lokasyon izinlerini tamamla (${readiness.peopleWithoutLocationAccess} personel)`}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, href, color }) => (
          <Link key={href} href={href} className="card card-body hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-lg ${color}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {stats.unfilled > 0 && (
        <div className="card card-body border-yellow-200 bg-yellow-50 flex items-center gap-3 mb-6">
          <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0" />
          <p className="text-sm text-yellow-800">
            {t("dashboard.unfilled", { count: stats.unfilled })}{" "}
            <Link href="/schedule" className="underline font-medium">
              {t("dashboard.unfilledLink")}
            </Link>
          </p>
        </div>
      )}

      <div className="card card-body">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{t("dashboard.quickActions")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-center px-3 py-3 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors font-medium"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}