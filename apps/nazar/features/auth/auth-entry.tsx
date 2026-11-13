"use client";

import {
  authErrorMessageKey,
  browserSignInDeps,
  enterSignIn,
  isRetryableAuthError,
  type SignInLimit,
  signIn,
} from "@medaris/auth/client";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

export interface AuthEntryProps {
  /** Already reduced to a same-origin path by the page. */
  callbackUrl: string;
  /** The `?error=` code of a failed round trip. */
  error?: string | null;
  /**
   * `?reauth=1`: tedrisat refused the token this session holds, so the
   * session the page came with does not count as signed in; the round trip
   * fetches new tokens instead of going straight back to the refusal.
   */
  reauth?: boolean;
  /** The app's `AUTH_SIGN_IN_LIMIT`, when it raises the defaults (`lib/auth.ts`). */
  limit?: SignInLimit;
}

/**
 * The body of the sign-in page (MDRS-101): it sends the visitor on to
 * Keycloak, or, after a failed round trip, says so in the visitor's language
 * and offers a retry.
 *
 * It no longer starts a round trip outright (B3, A11): `enterSignIn` lets one
 * tab at a time go, and the others wait for the session it brings back;
 * already signed in (another tab, or the Back button after a sign-in, MDRS-249
 * B) is straight on to `callbackUrl`; a failure that two tabs signing in at
 * once can cause gets one automatic retry per tab, then this box. And nothing
 * starts on its own without end (B2): a tab starts at most a few round trips
 * by itself in two minutes, and the start route refuses a browser that starts
 * too many (`SignInLimit`). `AccessDenied`, `Configuration` and `SignInLimit`
 * show the box at once, without a retry. With `?reauth=1` (a page whose
 * token tedrisat refused) the session already there does not count: only a
 * newer one goes on.
 *
 * Its look is as before; the twin of tedris's, on the unified kit.
 */
export function AuthEntry({
  callbackUrl,
  error,
  reauth,
  limit,
}: AuthEntryProps) {
  const t = useTranslations("nazar.Auth");
  const locale = useLocale();
  // The code whose message the box shows; `null` while there is no box.
  const [shown, setShown] = useState<string | null>(
    error && !isRetryableAuthError(error) ? error : null
  );
  const started = useRef(false);
  const request = useMemo(
    () => ({ intent: "signin" as const, callbackUrl, locale, reauth }),
    [callbackUrl, locale, reauth]
  );

  useEffect(() => {
    // Once only: React runs effects twice in development, and a second run
    // would spend a second unit of the tab's budget. The page has no other
    // job, so there is nothing to cancel.
    if (started.current) return;
    started.current = true;
    void enterSignIn(
      request,
      error,
      browserSignInDeps(limit ? { limit } : {})
    ).then((outcome) => {
      // `outcome.error`, not the page's `?error=`: a tab whose budget ran
      // out had no error, and shows `SignInLimit`.
      if (outcome.kind === "show-error") setShown(outcome.error);
    });
  }, [request, error, limit]);

  // A click is the visitor's own decision: it goes, whatever another tab is doing.
  const start = () => signIn(request);

  if (shown !== null) {
    return (
      <SystemState
        kind="error"
        title={t("errorTitle")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {/* A final error fails the same way on a click too. */}
            {isRetryableAuthError(shown) && (
              <Button onClick={start}>{t("retry")}</Button>
            )}
            <Button href="/" variant="secondary">
              {t("backHome")}
            </Button>
          </div>
        }
      >
        {t(authErrorMessageKey(shown))}
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
