"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  Users,
  MapPin,
  Clock,
  CalendarRange,
  Calendar,
  Download,
  Shield,
  Calculator,
} from "lucide-react";

import { CloudSync } from "./CloudSync";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n, useNavItems } from "@/i18n/I18nProvider";

const iconByKey = {
  overview: LayoutDashboard,
  people: Users,
  locations: MapPin,
  shifts: Clock,
  coverage: Shield,
  periods: CalendarRange,
  schedule: Calendar,
  export: Download,
  calculator: Calculator,
} as const;

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const nav = useNavItems();

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">drtr.uk</p>
            <h1 className="text-base font-bold leading-tight">{t("app.title")}</h1>
          </div>
          <LanguageSwitcher />
        </div>
        <CloudSync />
      </div>
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {nav.map(({ href, label, key }) => {
          const Icon = iconByKey[key];
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}