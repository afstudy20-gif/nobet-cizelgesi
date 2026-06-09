"use client";

import Link from "next/link";
import { Users, MapPin, Clock, CalendarRange, AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

type DashboardStats = {
  people: number;
  locations: number;
  shifts: number;
  activePeriods: number;
  unfilled: number;
};

export function DashboardContent({ stats }: { stats: DashboardStats }) {
  const { t } = useI18n();

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