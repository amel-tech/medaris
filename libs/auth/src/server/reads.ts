import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Session } from "../shared/session";
import {
  isUnauthorizedError,
  type Unauthenticated,
  unauthenticated,
} from "../shared/unauthenticated";
import type { ResolvedAuthConfig } from "./config";
import { RETURN_TO_HEADER, safeReturnTo } from "./return-to";
import {
  hasUsableAccessToken,
  publicSession,
  type SessionCookie,
  type StoredSession,
} from "./session-cookie";

/**
 * The reads for Server Components, Server Actions and route handlers. None of
 * them refreshes and none writes a cookie (Server Components cannot): by the
 * time they run, `proxy.ts` has already renewed the session for this request.
 *
 * `auth()` and `getAccessToken()` agree by construction. Both read the same
 * cookie once per request (React `cache()`), and a session whose access token
 * is gone is no session to either of them. That ends the split behind A16 and
 * #270, where the cookie read as signed in while no token could be had, and a
 * page drew "could not be read" with a retry that never worked. It also keeps
 * MDRS-216: a public page with an ended session renders the visitor's view.
 */
export interface RequireOptions {
  /**
   * Where to come back to after signing in. Defaults to the page being served
   * (the proxy passes it on), so a caller rarely needs to say.
   */
  callbackUrl?: string;
}

export interface ServerReads {
  /** The signed-in session, or `null` for a visitor. Never a token. */
  auth(): Promise<Session | null>;
  /** The access token for an API call, or `undefined`. Server-only. */
  getAccessToken(): Promise<string | undefined>;
  /** The session, or a redirect to sign-in keeping where the visitor was. */
  requireSession(options?: RequireOptions): Promise<Session>;
  /** The access token, or a redirect to sign-in keeping where the visitor was. */
  requireAccessToken(options?: RequireOptions): Promise<string>;
  /**
   * Runs `call` with the access token, for a Server Action or a route handler.
   * No token, or an API that answered 401, is `{ kind: "unauthenticated" }`;
   * the client hands that to `handleUnauthenticated`. Any other failure is
   * thrown as it was.
   */
  withAccessToken<T>(
    call: (accessToken: string) => Promise<T>
  ): Promise<T | Unauthenticated>;
  /** Redirects to the app's sign-in page. Call outside any `try`. */
  redirectToSignIn(options?: RequireOptions): Promise<never>;
  /** The app's sign-in page for `returnTo`, with `callbackUrl` set. */
  signInUrl(returnTo?: string | null): string;
}

export function createServerReads(
  config: ResolvedAuthConfig,
  sessionCookie: SessionCookie
): ServerReads {
  const current = cache(async (): Promise<StoredSession | null> => {
    const stored = await sessionCookie.read(await cookies());
    return stored && hasUsableAccessToken(stored, config.now()) ? stored : null;
  });

  const auth = cache(async (): Promise<Session | null> => {
    const stored = await current();
    return stored ? publicSession(stored) : null;
  });

  const getAccessToken = cache(
    async (): Promise<string | undefined> => (await current())?.accessToken
  );

  const signInUrl = (returnTo?: string | null) => {
    const safe = safeReturnTo(returnTo, config.origin);
    const page = config.signInPage(safe);
    return safe ? `${page}?callbackUrl=${encodeURIComponent(safe)}` : page;
  };

  const redirectToSignIn = async (options?: RequireOptions): Promise<never> => {
    const returnTo =
      options?.callbackUrl ?? (await headers()).get(RETURN_TO_HEADER);
    redirect(signInUrl(returnTo));
  };

  return {
    auth,
    getAccessToken,
    signInUrl,
    redirectToSignIn,
    async requireSession(options) {
      const session = await auth();
      return session ?? redirectToSignIn(options);
    },
    async requireAccessToken(options) {
      const token = await getAccessToken();
      return token ?? redirectToSignIn(options);
    },
    async withAccessToken(call) {
      const token = await getAccessToken();
      if (!token) return unauthenticated();
      try {
        return await call(token);
      } catch (error) {
        if (isUnauthorizedError(error)) return unauthenticated();
        throw error;
      }
    },
  };
}
