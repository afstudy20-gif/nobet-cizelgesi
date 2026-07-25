"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/types";

const ERROR_MESSAGE_BY_STATUS: Record<number, MessageKey> = {
  400: "auth.errorInvalid",
  401: "auth.errorInvalid",
  429: "auth.errorRateLimited",
  503: "auth.errorNotConfigured",
};

/**
 * Mirrors the middleware's `safeRedirectTarget` — the query string is
 * attacker-controllable, so it is re-checked before being handed to the router.
 */
function safeRedirectTarget(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const passwordId = useId();
  const errorId = useId();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError(t(ERROR_MESSAGE_BY_STATUS[response.status] ?? "auth.errorGeneric"));
        return;
      }

      const target = safeRedirectTarget(new URLSearchParams(window.location.search).get("next"));

      setPassword("");
      router.replace(target);
      router.refresh();
    } catch {
      setError(t("auth.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">{t("auth.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("auth.subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Input
            id={passwordId}
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            required
            label={t("auth.password")}
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
          />

          {error && (
            <p id={errorId} role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </div>
    </div>
  );
}
