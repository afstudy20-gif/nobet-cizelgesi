"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getMessages, isLocale, t as translate, type Locale, type MessageKey } from "./index";
import { LOCALE_STORAGE_KEY } from "./types";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "tr";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(stored) ? stored : "tr";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("tr");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    if (ready) {
      document.documentElement.lang = locale;
    }
  }, [locale, ready]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

export function useNavItems() {
  const { t } = useI18n();
  return [
    { href: "/", label: t("nav.overview"), key: "overview" },
    { href: "/people", label: t("nav.people"), key: "people" },
    { href: "/locations", label: t("nav.locations"), key: "locations" },
    { href: "/shifts", label: t("nav.shifts"), key: "shifts" },
    { href: "/coverage-rules", label: t("nav.coverage"), key: "coverage" },
    { href: "/periods", label: t("nav.periods"), key: "periods" },
    { href: "/schedule", label: t("nav.schedule"), key: "schedule" },
    { href: "/export", label: t("nav.export"), key: "export" },
  ] as const;
}

export { getMessages };