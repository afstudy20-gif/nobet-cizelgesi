"use client";

import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n";

const options: { value: Locale; label: string }[] = [
  { value: "tr", label: "TR" },
  { value: "en", label: "EN" },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="mt-3" role="group" aria-label={t("lang.switch")}>
      <div className="inline-flex rounded-md border border-gray-600 overflow-hidden text-xs font-semibold">
        {options.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setLocale(value)}
            className={cn(
              "px-2.5 py-1 transition-colors",
              locale === value
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
            )}
            aria-pressed={locale === value}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}