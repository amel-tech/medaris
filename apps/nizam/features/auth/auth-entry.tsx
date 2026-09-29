"use client";

import {
  authErrorMessageKey,
  keycloakSignIn,
} from "@medaris/services/auth-client";
import { Button } from "@medaris/ui/components/button";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";

export interface AuthEntryProps {
  /** Already reduced to a same-origin path by the page. */
  callbackUrl: string;
  /** NextAuth's `?error=` code; when present nothing starts on its own. */
  error?: string | null;
}

/**
 * The body of the sign-in and error pages (MDRS-101). They
 * replace NextAuth's built-in English pages, and all they do is send the
 * visitor straight on to Keycloak — or, after a failed round trip, say so in
 * the visitor's language and offer a retry. Retrying never starts by itself:
 * a failure that repeats would otherwise bounce between here and Keycloak.
 *
 * Placeholder layout until the launch screens are designed (MDRS-127). The
 * twin of apps/tedris/features/auth/auth-entry.tsx.
 */
export function AuthEntry({ callbackUrl, error }: AuthEntryProps) {
  const t = useTranslations("nizam");
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
      <section className="mx-auto flex max-w-md flex-col gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-primary">
          {t("Auth.errorTitle")}
        </h1>
        <p className="text-neutral-secondary">
          {t(`Auth.${authErrorMessageKey(error)}`)}
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={start}>{t("Auth.retry")}</Button>
          <Button variant="outline" asChild>
            <Link href={`/${locale}`}>{t("Auth.backHome")}</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <output className="text-neutral-secondary">
        {t("Auth.redirectingSignIn")}
      </output>
      <Button variant="outline" onClick={start}>
        {t("Auth.continue")}
      </Button>
    </section>
  );
}
