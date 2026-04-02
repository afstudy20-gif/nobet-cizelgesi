export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, MapPin, Clock, CalendarRange, AlertTriangle } from "lucide-react";

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

  const cards = [
    { label: "Aktif Personel", value: stats.people, icon: Users, href: "/people", color: "text-blue-600 bg-blue-50" },
    { label: "Çalışma Yerleri", value: stats.locations, icon: MapPin, href: "/locations", color: "text-green-600 bg-green-50" },
    { label: "Vardiya Şablonları", value: stats.shifts, icon: Clock, href: "/shifts", color: "text-purple-600 bg-purple-50" },
    { label: "Aktif Dönemler", value: stats.activePeriods, icon: CalendarRange, href: "/periods", color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Genel Bakış</h1>
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
            <strong>{stats.unfilled}</strong> nöbet ataması boş kalmış.{" "}
            <Link href="/schedule" className="underline font-medium">Çizelgeye git</Link>
          </p>
        </div>
      )}

      <div className="card card-body">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Hızlı Eylemler</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Personel Ekle", href: "/people?new=1" },
            { label: "Dönem Oluştur", href: "/periods?new=1" },
            { label: "Çizelge Görüntüle", href: "/schedule" },
            { label: "Dışa Aktar", href: "/export" },
          ].map(({ label, href }) => (
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
