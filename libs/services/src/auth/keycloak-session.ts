import { cache } from "react";
import type { AccessTokenJwt } from "./get-access-token";
import { REFRESH_ACCESS_TOKEN_ERROR } from "./refresh-error";

/**
 * Keeps each web app's NextAuth session tied to the one Keycloak SSO session
 * behind it (MDRS-210).
 *
 * tedris, nizam and nazar each keep their own NextAuth cookie against the same
 * realm. Signing out of one of them ends the Keycloak SSO session through the
 * end-session endpoint (`createKeycloakSignOut`), but the other two never
 * asked Keycloak again until their access token expired, so they went on
 * showing the old account — and after "switch user" in one app, a different
 * account than the app next to it. Nothing on Keycloak's side may change to
 * fix this (no back-channel logout URLs: the realm is shared), so each app
 * asks Keycloak itself, through the standard OIDC endpoints only:
 *
 * - while the access token is fresh, at most once per
 *   `KEYCLOAK_SESSION_CHECK_INTERVAL_MS`, it calls `userinfo`. Keycloak
 *   answers `401` once the user session behind the token is gone;
 * - once the access token has expired, the app's own refresh does the same
 *   job: Keycloak refuses the refresh with `invalid_grant`.
 *
 * Either answer turns the token into an ended session
 * (`KEYCLOAK_SESSION_ENDED_ERROR`). The app's `session` callback then hands
 * out no session at all, so a public tedris page renders the visitor's view,
 * and the middleware sends a protected page to sign-in. Nothing sends the
 * visitor to Keycloak by itself: that is what `REFRESH_ACCESS_TOKEN_ERROR`
 * and `RefreshErrorRedirect` are for, and they keep that meaning for the
 * failures a second round trip can repair.
 */

/**
 * The sentinel for "Keycloak says this SSO session is over". Terminal: the
 * token carrying it is never refreshed or checked again, and only a new
 * sign-in (which builds a new token) replaces it.
 */
export const KEYCLOAK_SESSION_ENDED_ERROR = "KeycloakSessionEnded";

/**
 * How long a confirmation from Keycloak is trusted. Bounds how late an app
 * notices a sign-out in another app: the first session read after this much
 * time asks Keycloak again.
 */
export const KEYCLOAK_SESSION_CHECK_INTERVAL_MS = 60_000;

/** The fields of the session JWT the check reads and writes. */
export interface KeycloakSessionJwt extends AccessTokenJwt {
  /** Keycloak's subject for the signed-in account. */
  sub?: string;
  /** Epoch milliseconds when Keycloak last confirmed the SSO session. */
  ssoCheckedAt?: number;
}

export interface KeycloakSessionCheckOptions {
  /** `KEYCLOAK_ISSUER` — the realm URL, without a trailing slash. */
  issuer: string;
  /** Epoch milliseconds; defaults to `Date.now()`. */
  now?: number;
  /** Defaults to `KEYCLOAK_SESSION_CHECK_INTERVAL_MS`. */
  intervalMs?: number;
}

export type KeycloakSessionVerdict = "active" | "ended" | "unknown";

/** Whether `token` carries the ended-session sentinel. */
export const isKeycloakSessionEnded = (
  token: { error?: unknown } | null | undefined
): boolean => token?.error === KEYCLOAK_SESSION_ENDED_ERROR;

/** `token`, marked as an ended SSO session. */
export const endKeycloakSession = <T extends KeycloakSessionJwt>(
  token: T
): T => ({
  ...token,
  error: KEYCLOAK_SESSION_ENDED_ERROR,
});

/**
 * The `error` an app's `refreshAccessToken` writes for a failed refresh.
 *
 * `invalid_grant` is Keycloak's answer for a refresh token whose session no
 * longer exists ("Session not active", "Token is not active"): the user signed
 * out, or signed in as someone else, somewhere else. Everything else — a
 * network failure, a 5xx, a client misconfiguration, the local deadline guard
 * — keeps the existing `REFRESH_ACCESS_TOKEN_ERROR`, which a new round trip to
 * Keycloak may repair.
 */
export const refreshFailureError = (failure: unknown): string =>
  (failure as { error?: unknown } | null)?.error === "invalid_grant"
    ? KEYCLOAK_SESSION_ENDED_ERROR
    : REFRESH_ACCESS_TOKEN_ERROR;

/**
 * Asks Keycloak's `userinfo` endpoint whether the session behind
 * `accessToken` still exists, and still belongs to `sub`.
 *
 * Only a `401` (or a different subject) means "ended". Anything else that is
 * not a success — Keycloak down, a timeout, a `403` for a missing scope — is
 * "unknown", and the caller keeps the session: Keycloak being unreachable must
 * not sign everyone out.
 *
 * `userinfo` rather than a refresh: it is read-only, so two requests checking
 * at once cannot race for one refresh token, and a server component (which
 * cannot write the cookie back) does not rotate anything it would then lose.
 *
 * Wrapped in React's per-request `cache()`: one server render can read the
 * session through `auth()` and the token through `getAccessToken()`, and both
 * should cost one call to Keycloak, not two.
 */
export const probeKeycloakSession = cache(
  async (
    issuer: string,
    accessToken: string,
    sub: string | undefined
  ): Promise<KeycloakSessionVerdict> => {
    try {
      const response = await fetch(
        `${issuer}/protocol/openid-connect/userinfo`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }
      );
      if (response.status === 401) return "ended";
      if (!response.ok) return "unknown";
      const info = (await response.json()) as { sub?: unknown };
      if (sub && typeof info.sub === "string" && info.sub !== sub) {
        return "ended";
      }
      return "active";
    } catch {
      return "unknown";
    }
  }
);

/**
 * Re-confirms a fresh access token's SSO session with Keycloak, at most once
 * per interval, and returns the token to keep:
 *
 * - unchanged while the last confirmation is recent, or when there is nothing
 *   to check (no access token, or a refresh failure already recorded — the
 *   app's refresh owns those);
 * - marked ended when Keycloak says the session is gone;
 * - stamped with `ssoCheckedAt` otherwise, including when Keycloak could not
 *   be asked, so an outage costs one call per interval rather than one per
 *   request.
 *
 * A token with no `ssoCheckedAt` (issued before this check existed) is checked
 * on its first read.
 */
export async function checkKeycloakSession<T extends KeycloakSessionJwt>(
  token: T,
  options: KeycloakSessionCheckOptions
): Promise<T> {
  if (token.error !== undefined || !token.accessToken) return token;

  const now = options.now ?? Date.now();
  const interval = options.intervalMs ?? KEYCLOAK_SESSION_CHECK_INTERVAL_MS;
  const checkedAt = token.ssoCheckedAt;
  if (
    typeof checkedAt === "number" &&
    checkedAt <= now &&
    now - checkedAt < interval
  ) {
    return token;
  }

  const verdict = await probeKeycloakSession(
    options.issuer,
    token.accessToken,
    token.sub
  );
  if (verdict === "ended") return endKeycloakSession(token);
  return { ...token, ssoCheckedAt: now };
}
