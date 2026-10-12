import { decodeJwt } from "jose";
import type { Session, SessionUser } from "../shared/session";
import type { ResolvedCookieConfig } from "./config";
import {
  type CookieSource,
  type CookieWrite,
  chunkedWrites,
  readChunked,
} from "./cookies";
import { deriveKey, seal, unseal } from "./seal";

/**
 * What the session cookie holds, and nothing more (B6): the access token and
 * when it expires, the refresh token and its deadline, the ID token for the
 * sign-out's `id_token_hint`, the account's identity claims, and when the IdP
 * last confirmed the SSO session. No second copy of the profile, no error
 * flag: a session that failed is removed, not marked.
 */
export interface StoredSession {
  v: 1;
  user: SessionUser;
  accessToken: string;
  /** Epoch ms, measured on this server's clock from `expires_in`. */
  accessTokenExpiresAt: number;
  refreshToken?: string;
  /** Epoch ms; absent when the IdP set no deadline (Keycloak `refresh_expires_in: 0`). */
  refreshTokenExpiresAt?: number;
  idToken?: string;
  /**
   * The IdP's session id, the ID token's `sid` claim: what a back-channel
   * logout names (auth Phase 2). Kept across a refresh whose ID token does
   * not repeat it.
   */
  sid?: string;
  /** Epoch ms when the IdP last confirmed the SSO session (MDRS-210). */
  checkedAt: number;
}

/** The parts of a token endpoint answer a session is built from. */
export interface TokenSet {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  /** Keycloak's own field: seconds the refresh token lives; 0 or absent is "no deadline". */
  refresh_expires_in?: unknown;
  claims(): Record<string, unknown> | undefined;
}

/**
 * How long the access token lives, in ms. `expires_in` when the IdP sends it;
 * otherwise the token's own `exp` read against our clock; otherwise one
 * minute, so an IdP that says nothing is asked again soon rather than trusted.
 */
const accessTokenLifetime = (tokens: TokenSet, now: number): number => {
  if (typeof tokens.expires_in === "number") return tokens.expires_in * 1000;
  try {
    const { exp } = decodeJwt(tokens.access_token);
    if (typeof exp === "number") return Math.max(0, exp * 1000 - now);
  } catch {
    // not a JWT: fall through
  }
  return 60_000;
};

const text = (claims: Record<string, unknown>, key: string) => {
  const value = claims[key];
  return typeof value === "string" && value ? value : undefined;
};

/** The identity claims kept, from an ID token's claims. `null` without a subject. */
export function userFromClaims(
  claims: Record<string, unknown> | undefined
): SessionUser | null {
  if (!claims) return null;
  const sub = text(claims, "sub");
  if (!sub) return null;
  const user: SessionUser = { sub };
  const fields = [
    ["name", "name"],
    ["email", "email"],
    ["username", "preferred_username"],
    ["locale", "locale"],
    ["image", "picture"],
  ] as const;
  for (const [field, claim] of fields) {
    const value = text(claims, claim);
    if (value) user[field] = value;
  }
  return user;
}

/**
 * A session from a token endpoint answer: a sign-in's (no `previous`) or a
 * refresh's. A refresh that brings no ID token or no new refresh token keeps
 * the previous ones; one that brings an ID token also renews the profile
 * (B12: a name changed at the IdP no longer waits for the next sign-in).
 * Returns `null` when no account can be named.
 */
export function sessionFromTokens(
  tokens: TokenSet,
  now: number,
  previous?: StoredSession
): StoredSession | null {
  const claims = tokens.claims();
  const user = userFromClaims(claims) ?? previous?.user ?? null;
  if (!user) return null;
  const refreshIn = tokens.refresh_expires_in;
  const hasNewRefreshToken = typeof tokens.refresh_token === "string";
  const session: StoredSession = {
    v: 1,
    user,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: now + accessTokenLifetime(tokens, now),
    checkedAt: now,
  };
  const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
  if (refreshToken) session.refreshToken = refreshToken;
  if (typeof refreshIn === "number" && refreshIn > 0) {
    session.refreshTokenExpiresAt = now + refreshIn * 1000;
  } else if (!hasNewRefreshToken && previous?.refreshTokenExpiresAt) {
    session.refreshTokenExpiresAt = previous.refreshTokenExpiresAt;
  }
  const idToken = tokens.id_token ?? previous?.idToken;
  if (idToken) session.idToken = idToken;
  const sid =
    (claims && text(claims, "sid")) ??
    (previous ? idpSessionOf(previous) : undefined);
  if (sid) session.sid = sid;
  return session;
}

/** A token with less than this left is not handed to an API call. */
const USABLE_MARGIN_MS = 5_000;

/** Whether the session still holds an access token an API will take. */
export const hasUsableAccessToken = (session: StoredSession, now: number) =>
  session.accessTokenExpiresAt - USABLE_MARGIN_MS > now;

/** The client-safe view: no token leaves the server. */
export const publicSession = (session: StoredSession): Session => ({
  user: session.user,
  expiresAt: session.accessTokenExpiresAt,
});

/**
 * Seconds the cookie may live: until the refresh token's deadline when there
 * is one, the configured maximum when it has none, and the access token's
 * lifetime when there is no refresh token at all.
 */
export function cookieLifetime(
  session: StoredSession,
  now: number,
  sessionMaxAge: number
): number {
  const until = session.refreshToken
    ? (session.refreshTokenExpiresAt ?? now + sessionMaxAge * 1000)
    : session.accessTokenExpiresAt;
  return Math.max(1, Math.floor((until - now) / 1000));
}

const isStoredSession = (value: unknown): value is StoredSession => {
  const candidate = value as Partial<StoredSession> | null;
  return (
    candidate?.v === 1 &&
    typeof candidate.accessToken === "string" &&
    typeof candidate.accessTokenExpiresAt === "number" &&
    typeof candidate.checkedAt === "number" &&
    typeof candidate.user?.sub === "string"
  );
};

/**
 * The session in an opened seal, or `null` when it is not one. The JWT claims
 * (`iat`, `exp`) stay behind; only the session's own fields come out. Shared
 * by the cookie and the Valkey store, which seal the same object.
 */
export function storedSessionFrom(opened: unknown): StoredSession | null {
  if (!isStoredSession(opened)) return null;
  const {
    v,
    user,
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt,
    idToken,
    sid,
    checkedAt,
  } = opened;
  return {
    v,
    user,
    accessToken,
    accessTokenExpiresAt,
    checkedAt,
    ...(refreshToken ? { refreshToken } : {}),
    ...(refreshTokenExpiresAt ? { refreshTokenExpiresAt } : {}),
    ...(idToken ? { idToken } : {}),
    ...(typeof sid === "string" && sid ? { sid } : {}),
  };
}

/**
 * The IdP's session id (`sid`) behind a session: what a back-channel logout
 * names (auth Phase 2). A session sealed by Phase 1 has no `sid` field; its
 * ID token has the claim. That token was checked by openid-client when it
 * arrived and has been sealed since, so it is decoded here, not verified
 * again. `undefined` without one.
 */
export function idpSessionOf(session: StoredSession): string | undefined {
  if (session.sid) return session.sid;
  if (!session.idToken) return undefined;
  try {
    const { sid } = decodeJwt(session.idToken);
    return typeof sid === "string" && sid ? sid : undefined;
  } catch {
    return undefined;
  }
}

/** Reads and writes the session cookie for one app. */
export interface SessionCookie {
  read(source: CookieSource): Promise<StoredSession | null>;
  /** The writes that store `session`, or remove it for `null`. */
  writes(
    source: CookieSource,
    session: StoredSession | null
  ): Promise<CookieWrite[]>;
}

export function createSessionCookie(
  config: Pick<
    ResolvedCookieConfig,
    "secret" | "cookiePrefix" | "cookies" | "sessionMaxAge" | "now"
  >
): SessionCookie {
  let key: Promise<Uint8Array> | undefined;
  const keyOf = () => {
    key ??= deriveKey(config.secret, config.cookiePrefix, "session");
    return key;
  };
  const name = config.cookies.session;

  return {
    async read(source) {
      const sealed = readChunked(source, name);
      if (!sealed) return null;
      return storedSessionFrom(
        await unseal<unknown>(sealed, await keyOf(), config.now())
      );
    },
    async writes(source, session) {
      if (!session) return chunkedWrites(source, name, null, 0);
      const now = config.now();
      const maxAge = cookieLifetime(session, now, config.sessionMaxAge);
      const sealed = await seal(
        session as unknown as Record<string, unknown>,
        await keyOf(),
        { now, expiresAt: now + maxAge * 1000 }
      );
      return chunkedWrites(source, name, sealed, maxAge);
    },
  };
}
