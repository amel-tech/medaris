/**
 * `@medaris/auth/testing`: the session cookie exactly as this package writes
 * and reads it, for an app's Vitest specs and its Playwright helpers, so
 * neither copies the format (the JWE header, the HKDF salt and label, the
 * 3800-character chunks) and drifts from it.
 *
 * Not `server-only`, so a Vitest spec under jsdom and a Playwright helper can
 * import it; and not exported by `./server` or `./client`, so nothing an app
 * ships reaches it. Import it from specs and `e2e/` only: it seals a session
 * for anyone holding the secret, which is what a test wants and an app never
 * should.
 *
 * ```ts
 * import { sealSessionCookies, sessionFromTokenResponse } from "@medaris/auth/testing";
 *
 * const { cookies, maxAge, secure } = await sealSessionCookies(
 *   { baseUrl, secret: NEXTAUTH_SECRET, cookiePrefix: "tedris" },
 *   sessionFromTokenResponse(await directGrant(who))
 * );
 * ```
 */
import { decodeJwt } from "jose";
import { type CookieConfig, resolveCookieConfig } from "../server/config";
import type { CookieSource } from "../server/cookies";
import {
  createSessionCookie,
  type StoredSession,
  sessionFromTokens,
} from "../server/session-cookie";
import { forgetAllFlights } from "../server/single-flight";

export { RETURN_TO_HEADER } from "../server/return-to";
export { REAUTH_PARAM } from "../shared/routes";
export type { CookieConfig, StoredSession };

/** One cookie, as a browser holds it. */
export interface NamedCookie {
  name: string;
  value: string;
}

/** What `sealSessionCookies` gives back. */
export interface SealedSessionCookies {
  /** `<prefix>.session`, or its numbered chunks `.0`, `.1`, … in order. */
  cookies: NamedCookie[];
  /** Seconds the app would let them live (`Max-Age`). */
  maxAge: number;
  /**
   * Whether the app sets them `Secure`: an https `baseUrl`, where the names
   * also carry `__Host-` (so Path=/ and no Domain).
   */
  secure: boolean;
  /** `name=value; …`, as a browser sends them in a `cookie` header. */
  header: string;
}

/** `name=value; …`, as a browser sends cookies. */
export const cookieHeader = (cookies: Iterable<NamedCookie>): string =>
  [...cookies].map(({ name, value }) => `${name}=${value}`).join("; ");

const NO_COOKIES: CookieSource = { get: () => undefined, getAll: () => [] };

/**
 * The cookie(s) the app would set for `session`. `config` is the app's own
 * `createAuth` input or just these fields of it; `config.now` (default
 * `Date.now`) is the moment of sealing.
 */
export async function sealSessionCookies(
  config: CookieConfig,
  session: StoredSession
): Promise<SealedSessionCookies> {
  const resolved = resolveCookieConfig(config);
  const writes = await createSessionCookie(resolved).writes(
    NO_COOKIES,
    session
  );
  const cookies = writes.map(({ name, value }) => ({ name, value }));
  return {
    cookies,
    maxAge: writes[0]?.maxAge ?? 0,
    secure: resolved.secure,
    header: cookieHeader(cookies),
  };
}

const sourceOf = (cookies: string | Iterable<NamedCookie>): CookieSource => {
  const jar = new Map<string, string>();
  if (typeof cookies === "string") {
    for (const pair of cookies.split(";")) {
      const index = pair.indexOf("=");
      if (index > 0)
        jar.set(pair.slice(0, index).trim(), pair.slice(index + 1));
    }
  } else {
    for (const { name, value } of cookies) jar.set(name, value);
  }
  return {
    get: (name) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { value };
    },
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  };
};

/**
 * The inverse: the session the app stored in `cookies` (a `cookie` header,
 * or a list such as Playwright's `context.cookies()`), or `null` when there
 * is none, it does not open under this secret and prefix, or it has expired.
 * Other cookies in the list are ignored.
 */
export async function openSessionCookies(
  config: CookieConfig,
  cookies: string | Iterable<NamedCookie>
): Promise<StoredSession | null> {
  return createSessionCookie(resolveCookieConfig(config)).read(
    sourceOf(cookies)
  );
}

/** The name the session cookie has under `config` (before any chunking). */
export const sessionCookieName = (config: CookieConfig): string =>
  resolveCookieConfig(config).cookies.session;

/** A token endpoint's JSON answer, e.g. Keycloak's to a direct grant. */
export interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  /** Keycloak's: seconds the refresh token lives; 0 or absent is "no deadline". */
  refresh_expires_in?: number;
  id_token?: string;
}

/**
 * The session the sign-in callback would store for `response` at `now`: the
 * same deadlines and the same identity claims, read from the ID token. The
 * ID token is decoded, not verified (a test's own tokens are not signed).
 * Throws when the ID token names no subject.
 */
export function sessionFromTokenResponse(
  response: TokenResponse,
  now: number = Date.now()
): StoredSession {
  const claims = response.id_token ? decodeJwt(response.id_token) : undefined;
  const session = sessionFromTokens({ ...response, claims: () => claims }, now);
  if (!session) {
    throw new Error("@medaris/auth/testing: the ID token names no subject");
  }
  return session;
}

/**
 * Forgets what every auth instance in this process keeps for a few seconds
 * per token: a refresh's result (30 s), a `userinfo` verdict (10 s) and, with
 * a session store, the new id a Phase 1 cookie was moved to (30 s). An
 * app builds its auth once per module, so a spec that asks the proxy about
 * the same access token as the spec before it would otherwise get the
 * earlier answer without the IdP stand-in being asked. Call it in
 * `beforeEach`. (After `vi.resetModules()` the app's instance is new and
 * starts empty anyway.)
 */
export const resetRenewalCache = (): void => forgetAllFlights();
