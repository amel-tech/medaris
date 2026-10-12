"use client";

import {
  authErrorMessageKey,
  browserSignInDeps,
  enterSignIn,
  isRetryableAuthError,
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
 * show the box at once.
 *
 * Its look is as before; the twin of tedris's, on the unified kit.
 */
export function AuthEntry({ callbackUrl, error }: AuthEntryProps) {
  const t = useTranslations("nazar.Auth");
  const locale = useLocale();
  const [failed, setFailed] = useState(
    Boolean(error) && !isRetryableAuthError(error)
  );
  const started = useRef(false);
  const request = useMemo(
    () => ({ intent: "signin" as const, callbackUrl, locale }),
    [callbackUrl, locale]
  );

  useEffect(() => {
    // Once only: React runs effects twice in development, and a second run
    // would spend a second unit of the tab's budget. The page has no other
    // job, so there is nothing to cancel.
    if (started.current) return;
    started.current = true;
    void enterSignIn(request, error, browserSignInDeps()).then((outcome) => {
      if (outcome === "show-error") setFailed(true);
    });
  }, [request, error]);

  // A click is the visitor's own decision: it goes, whatever another tab is doing.
  const start = () => signIn(request);

  if (failed) {
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
