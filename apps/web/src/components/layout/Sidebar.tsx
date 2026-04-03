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

const nav = [
  { href: "/", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/people", label: "Personel", icon: Users },
  { href: "/locations", label: "Çalışma Yerleri", icon: MapPin },
  { href: "/shifts", label: "Vardiya Şablonları", icon: Clock },
  { href: "/coverage-rules", label: "Nöbet İhtiyaçları", icon: Shield },
  { href: "/periods", label: "Dönem & Çizelge", icon: CalendarRange },
  { href: "/schedule", label: "Çizelge Görünümü", icon: Calendar },
  { href: "/export", label: "Dışa Aktar", icon: Download },
  { href: "/calculator", label: "Hesap Araçları", icon: Calculator },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">drtr.uk</p>
        <h1 className="text-base font-bold leading-tight">Nöbet Çizelgesi</h1>
      </div>
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {nav.map(({ href, label, icon: Icon }) => {
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
