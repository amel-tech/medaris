"use client";

import {
  authErrorMessageKey,
  browserSignInDeps,
  enterSignIn,
  isRetryableAuthError,
  signIn,
} from "@medaris/auth/client";
import { Button } from "@medaris/ui/components/button";
import Link from "next/link";
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
}

/**
 * The body of the sign-in page (MDRS-101): it sends the visitor on to
 * Keycloak, or, after a failed round trip, says so in the visitor's language
 * and offers a retry.
 *
 * Through `enterSignIn` (`@medaris/auth/client`), as tedris has had since
 * #180, instead of starting a round trip outright (B3): one tab at a time
 * goes to Keycloak and the others wait for its session; a session already
 * there (another tab finished first, or the Back button replayed a callback,
 * MDRS-249 B) goes straight on to `callbackUrl`; a failed round trip is
 * retried once per tab, then shows the box; and a tab that keeps starting on
 * its own ends on the box too, so a Keycloak that is down or a client secret
 * that no longer matches cannot bounce it between here and Keycloak (B2).
 * `AccessDenied`, `Configuration` and `SignInLimit` show the box at once,
 * without a retry. With `?reauth=1` (a page whose token tedrisat refused) the
 * session already there does not count: only a newer one goes on.
 *
 * Placeholder layout until the launch screens are designed (MDRS-127).
 */
export function AuthEntry({ callbackUrl, error, reauth }: AuthEntryProps) {
  const t = useTranslations("nizam");
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

  // A click is the visitor's own decision: it takes the round trip over any
  // tab that is waiting.
  const start = () => signIn(request);

  if (shown !== null) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-primary">
          {t("Auth.errorTitle")}
        </h1>
        <p className="text-neutral-secondary">
          {t(`Auth.${authErrorMessageKey(shown)}`)}
        </p>
        <div className="flex justify-center gap-2">
          {/* A final error fails the same way on a click too. */}
          {isRetryableAuthError(shown) && (
            <Button onClick={start}>{t("Auth.retry")}</Button>
          )}
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
