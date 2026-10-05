"use client";

import {
  authErrorMessageKey,
  keycloakSignIn,
} from "@medaris/services/auth-client";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";

export interface AuthEntryProps {
  /** Already reduced to a same-origin path by the page. */
  callbackUrl: string;
  /** NextAuth's `?error=` code; when present nothing starts on its own. */
  error?: string | null;
}

/**
 * The body of the sign-in and error pages (MDRS-101). They replace NextAuth's
 * built-in English pages, and all they do is send the visitor straight on to
 * Keycloak — or, after a failed round trip, say so in the visitor's language
 * and offer a retry. Retrying never starts by itself: a failure that repeats
 * would otherwise bounce between here and Keycloak.
 *
 * The twin of apps/nizam/features/auth/auth-entry.tsx, on the unified kit.
 */
export function AuthEntry({ callbackUrl, error }: AuthEntryProps) {
  const t = useTranslations("nazar.Auth");
  const locale = useLocale();
  const started = useRef(false);

  const start = useCallback(() => {
    started.current = true;
    keycloakSignIn({ intent: "signin", callbackUrl, locale });
  }, [callbackUrl, locale]);

  useEffect(() => {
    // Once only: React runs effects twice in development.
    if (error || started.current) return;
    start();
  }, [error, start]);

  if (error) {
    return (
      <SystemState
        kind="error"
        title={t("errorTitle")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={start}>{t("retry")}</Button>
            <Button href="/" variant="secondary">
              {t("backHome")}
            </Button>
          </div>
        }
      >
        {t(authErrorMessageKey(error))}
      </SystemState>
    );
  }

  return (
    <SystemState
      title={t("redirectingTitle")}
      action={
        <Button variant="secondary" onClick={start}>
          {t("continue")}
        </Button>
      }
    >
      {t("redirectingDescription")}
    </SystemState>
  );
}
