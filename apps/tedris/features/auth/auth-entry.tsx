"use client";

import {
  authErrorMessageKey,
  browserSignInDeps,
  enterSignIn,
  isRetryableAuthError,
  type SignInIntent,
  signIn,
} from "@medaris/auth/client";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

export interface AuthEntryProps {
  intent: SignInIntent;
  /** Already reduced to a same-origin path by the page. */
  callbackUrl: string;
  /** The `?error=` code a failed round trip came back with (`AuthErrorCode`). */
  error?: string | null;
  /**
   * `?reauth=1`: tedrisat refused the token this session holds, so the
   * session the page came with does not count as signed in; the round trip
   * fetches new tokens instead of going straight back to the refusal.
   */
  reauth?: boolean;
}

/**
 * The body of the sign-in and registration pages (MDRS-101): they send the
 * visitor on to Keycloak, one tab at a time (#180).
 *
 * A failed round trip does not show the box straight away. By the time this
 * page loads another tab may already have the session — then the visitor goes
 * straight on to `callbackUrl` — and otherwise one automatic retry usually
 * fixes it (`OAuthCallback`: a replayed or expired callback). The retry is
 * counted per tab, and so are the automatic starts, so a failure that repeats
 * ends on the box instead of bouncing between here and Keycloak.
 * `AccessDenied`, `Configuration` and `SignInLimit` fail the same way every
 * time and show the box at once. With `?reauth=1` (a page whose token
 * tedrisat refused) the session already there does not count: only a newer
 * one goes on. See `enterSignIn` in `@medaris/auth/client`.
 */
export function AuthEntry({
  intent,
  callbackUrl,
  error,
  reauth,
}: AuthEntryProps) {
  const t = useTranslations("tedris");
  const locale = useLocale();
  // The code whose message the box shows; `null` while there is no box.
  const [shown, setShown] = useState<string | null>(
    error && !isRetryableAuthError(error) ? error : null
  );
  const started = useRef(false);
  const request = useMemo(
    () => ({ intent, callbackUrl, locale, reauth }),
    [intent, callbackUrl, locale, reauth]
  );

  useEffect(() => {
    // Once only: React runs effects twice in development, and the page has
    // no other job, so there is nothing to cancel.
    if (started.current) return;
    started.current = true;
    void enterSignIn(request, error, browserSignInDeps()).then((outcome) => {
      // `outcome.error`, not the page's `?error=`: a tab whose budget ran
      // out had no error, and shows `SignInLimit`.
      if (outcome.kind === "show-error") setShown(outcome.error);
    });
  }, [request, error]);

  const start = () => signIn(request);

  if (shown !== null) {
    return (
      <SystemState
        shell
        className="font-ui"
        title={t("Auth.errorTitle")}
        action={
          isRetryableAuthError(shown) ? (
            // "Giriş sayfasına dön" (MDRS-216, the Keycloak theme's own error
            // box): the sign-in page is Keycloak's, so going back starts a new
            // round trip, claimed over any waiting tab.
            <Button variant="secondary" onClick={start}>
              {t("Auth.backToSignIn")}
            </Button>
          ) : (
            <Button href={`/${locale}`} variant="secondary">
              {t("Auth.backHome")}
            </Button>
          )
        }
      >
        {t(`Auth.${authErrorMessageKey(shown)}`)}
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
