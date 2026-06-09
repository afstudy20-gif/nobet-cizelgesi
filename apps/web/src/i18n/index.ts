import { en } from "./messages/en";
import { tr } from "./messages/tr";
import type { Locale, MessageKey, Messages } from "./types";

export type { Locale, MessageKey, Messages };
export { LOCALE_STORAGE_KEY } from "./types";

const catalogs: Record<Locale, Messages> = { tr, en };

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "tr" || value === "en";
}

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}

export function t(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  let text = catalogs[locale][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}