import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { cache } from "react";

/**
 * The fields of the NextAuth session JWT this helper reads. Each app augments
 * `next-auth/jwt`'s `JWT` with exactly these (plus its refresh-token fields) in
 * its own `next-auth.d.ts`; this library sees only the un-augmented type, so it
 * names the structural minimum instead of importing an app's declaration.
 */
export interface AccessTokenJwt {
  accessToken?: string;
  /** Epoch milliseconds after which `accessToken` must be refreshed. */
  accessTokenExpired?: number;
  /** Set by the app's refresh function when a refresh has failed. */
  error?: string;
}

export interface AccessTokenReaderOptions<T extends AccessTokenJwt> {
  /** `NEXTAUTH_SECRET` — the key the session cookie is encrypted with. */
  secret: string;
  /**
   * The session cookie's name. The apps set custom cookie names (MDRS-24), and
   * `getToken` cannot find the cookie without being told.
   */
  cookieName?: string;
  /**
   * The app's own `refreshAccessToken`, the function its `jwt` callback runs
   * when the access token has expired. Passed in rather than reimplemented so
   * the two apps' refresh logic stays theirs — they differ in how an expired
   * refresh token is reported.
   */
  refresh: (token: T) => Promise<T>;
}

/**
 * Builds a server-only reader for the Keycloak access token (MDRS-28).
 *
 * Both web apps used to copy `token.accessToken` onto the client-visible
 * `Session`, which NextAuth serves from `GET /api/auth/session` to any script
 * on the page. The token now stays inside the encrypted session cookie and
 * server code reads it through the function this returns.
 *
 * Why not `getToken()` alone: `auth()` (`getServerSession`) runs the `jwt`
 * callback, which is where the expiry check and the refresh live, so callers
 * used to receive a refreshed token. `getToken()` only decrypts the cookie and
 * runs no callbacks. This reader restores that behaviour — it checks
 * `accessTokenExpired` and calls the app's `refresh` when the token is stale —
 * and it fails closed: a token whose refresh has already failed (`error` set)
 * yields `undefined` rather than a dead bearer token that `authenticatedAction`
 * would otherwise forward.
 *
 * A refreshed token cannot be written back to the cookie from a server
 * component; that was equally true of the `auth()` path, so within one request
 * the refresh happens once and is reused (below), and the client
 * `SessionProvider`'s next `/api/auth/session` call persists it.
 *
 * Wrapped in React's per-request `cache()`: `getToken()` derives the encryption
 * key with HKDF and decrypts a JWE on every call, and several pages call this
 * three times in one render. `cache()` is scoped to a single server request,
 * so two users can never share an entry.
 */
export function createAccessTokenReader<T extends AccessTokenJwt>(
  options: AccessTokenReaderOptions<T>
): () => Promise<string | undefined> {
  return cache(async (): Promise<string | undefined> => {
    // `getToken` is typed against next-auth's un-augmented `JWT`; the app's
    // declaration merging is what makes the cast to `T` sound.
    const token = (await getToken({
      req: {
        cookies: await cookies(),
        headers: await headers(),
      } as unknown as NextRequest,
      secret: options.secret,
      cookieName: options.cookieName,
    })) as unknown as T | null;

    if (!token || token.error) {
      return undefined;
    }

    if (
      token.accessTokenExpired === undefined ||
      Date.now() < token.accessTokenExpired
    ) {
      return token.accessToken;
    }

    const refreshed = await options.refresh(token);
    return refreshed.error ? undefined : refreshed.accessToken;
  });
}
