"use client";

import {
  authErrorMessageKey,
  browserKeycloakEntryDeps,
  enterKeycloak,
  isRetryableAuthError,
  type KeycloakSignInIntent,
  startKeycloakSignIn,
} from "@medaris/services/auth-client";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

export interface AuthEntryProps {
  intent: KeycloakSignInIntent;
  /** Already reduced to a same-origin path by the page. */
  callbackUrl: string;
  /** NextAuth's `?error=` code. */
  error?: string | null;
}

/**
 * The body of the sign-in, registration and error pages (MDRS-101). They
 * replace NextAuth's built-in English pages and send the visitor on to
 * Keycloak.
 *
 * A failed round trip does not show the box straight away. Most failures are
 * two tabs signing in at once and overwriting each other's state cookie
 * (`OAuthCallback`): by the time this page loads the other tab may already
 * have the session — then the visitor goes straight on to `callbackUrl` — and
 * otherwise one automatic retry fixes it. The retry is counted per tab, so a
 * failure that repeats ends on the box instead of bouncing between here and
 * Keycloak. `AccessDenied` and `Configuration` fail the same way every time
 * and show the box at once. See `enterKeycloak`.
 */
export function AuthEntry({ intent, callbackUrl, error }: AuthEntryProps) {
  const t = useTranslations("tedris");
  const locale = useLocale();
  const retryable = isRetryableAuthError(error);
  const [failed, setFailed] = useState(Boolean(error) && !retryable);
  const started = useRef(false);
  const request = useMemo(
    () => ({ intent, callbackUrl, locale }),
    [intent, callbackUrl, locale]
  );

  useEffect(() => {
    // Once only: React runs effects twice in development, and the page has
    // no other job, so there is nothing to cancel.
    if (started.current) return;
    started.current = true;
    void enterKeycloak(request, error, browserKeycloakEntryDeps()).then(
      (outcome) => {
        if (outcome === "show-error") setFailed(true);
      }
    );
  }, [request, error]);

  const start = () => startKeycloakSignIn(request);

  if (failed) {
    return (
      <SystemState
        shell
        className="font-ui"
        title={t("Auth.errorTitle")}
        action={
          retryable ? (
            <Button variant="secondary" onClick={start}>
              {t("Auth.retry")}
            </Button>
          ) : (
            <Button href={`/${locale}`} variant="secondary">
              {t("Auth.backHome")}
            </Button>
          )
        }
      >
        {t(`Auth.${authErrorMessageKey(error)}`)}
      </SystemState>
    );
  }

  return (
    <section className="mds-system-state font-ui">
      <output className="mds-system-state__text">
        {intent === "register"
          ? t("Auth.redirectingRegister")
          : t("Auth.redirectingSignIn")}
      </output>
      <Button variant="secondary" onClick={start}>
        {t("Auth.continue")}
      </Button>
    </section>
  );
}
