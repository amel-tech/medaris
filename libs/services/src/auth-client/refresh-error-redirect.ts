"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
// Deep import, not the `../auth` barrel: that barrel reaches `next/headers`
// through `get-access-token`, which throws in a client bundle.
import { REFRESH_ACCESS_TOKEN_ERROR } from "../auth/refresh-error";

export interface RefreshErrorRedirectProps {
  /**
   * The active locale, passed in rather than read here: this library is
   * framework-agnostic about i18n and must not depend on `next-intl`. It
   * becomes Keycloak's `ui_locales`.
   */
  locale: string;
}

/**
 * Sends a visitor whose token refresh has failed back to Keycloak.
 *
 * A session whose refresh failed still exists as a cookie, so nothing signs the
 * user out — the next server call simply fails, and the page reports it as an
 * unexpected server response. Keycloak is the only place the session can
 * actually be renewed, and a silent redirect is what an expired session is
 * supposed to look like.
 *
 * Shared rather than copied, for the same reason as `createAccessTokenReader`
 * and `refreshDeadline`: this is the client half of one refresh contract, and
 * two copies of a contract drift silently.
 *
 * A `.ts` file rather than `.tsx` deliberately: it renders nothing, so it
 * needs no JSX, and keeping it JSX-free means `libs/services` does not have to
 * grow a `jsx` compiler option and a `.tsx` include just to host one component
 * that returns `null`. Consumers still write `<RefreshErrorRedirect />` in
 * their own `.tsx`.
 */
export const RefreshErrorRedirect = ({ locale }: RefreshErrorRedirectProps) => {
  const { data: session } = useSession();

  // Each app augments next-auth's `Session` with `error` in its own
  // `next-auth.d.ts`; this library sees only the un-augmented type, so it names
  // the structural minimum instead of importing an app's declaration — the same
  // reason `AccessTokenJwt` exists beside `createAccessTokenReader`.
  const error = (session as { error?: unknown } | null)?.error;

  useEffect(() => {
    if (error !== REFRESH_ACCESS_TOKEN_ERROR) return;
    signIn("keycloak", { redirect: true }, { ui_locales: locale });
  }, [error, locale]);

  return null;
};
