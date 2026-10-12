import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { REAUTH_PARAM } from "../shared/routes";
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

export interface SignInRedirectOptions extends RequireOptions {
  /**
   * The API answered 401 to a token this session holds. The sign-in page then
   * gets `?reauth=1` and fetches new tokens from the IdP instead of sending
   * the still "signed-in" browser straight back to the same refusal; the
   * round trips that takes count against the sign-in caps, so a token the
   * API will never take ends on the `SignInLimit` box rather than in a loop.
   */
  reauth?: boolean;
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
  /**
   * Redirects to the app's sign-in page. Call outside any `try`. Throws
   * (rather than redirecting the page to itself, a loop) when called while
   * the sign-in page itself renders.
   */
  redirectToSignIn(options?: SignInRedirectOptions): Promise<never>;
  /**
   * The app's sign-in page for `returnTo`, with `callbackUrl` set (and
   * `reauth=1` when asked). A `returnTo` that is the sign-in page itself is
   * replaced by its own `callbackUrl`, never nested.
   */
  signInUrl(
    returnTo?: string | null,
    options?: Pick<SignInRedirectOptions, "reauth">
  ): string;
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

  /** Whether `path`, a validated return path, is the app's sign-in page itself. */
  const isSignInPage = (path: string) =>
    new URL(path, config.origin).pathname ===
    new URL(config.signInPage(path), config.origin).pathname;

  /**
   * Where a sign-in should come back to. A return path that is the sign-in
   * page carries the real destination in its own `callbackUrl`: that one is
   * used, once, so the address does not grow a level per hop.
   */
  const destinationOf = (returnTo: string | null | undefined) => {
    const safe = safeReturnTo(returnTo, config.origin);
    if (!safe || !isSignInPage(safe)) return safe;
    const inner = safeReturnTo(
      new URL(safe, config.origin).searchParams.get("callbackUrl"),
      config.origin
    );
    return inner && !isSignInPage(inner) ? inner : null;
  };

  const signInUrl: ServerReads["signInUrl"] = (returnTo, options = {}) => {
    const safe = destinationOf(returnTo);
    const page = config.signInPage(safe);
    const query = [
      safe ? `callbackUrl=${encodeURIComponent(safe)}` : null,
      options.reauth ? `${REAUTH_PARAM}=1` : null,
    ]
      .filter(Boolean)
      .join("&");
    return query ? `${page}?${query}` : page;
  };

  /** The page being served, as the proxy passed it on; `null` outside a request. */
  const servedPage = async () => {
    try {
      return safeReturnTo(
        (await headers()).get(RETURN_TO_HEADER),
        config.origin
      );
    } catch {
      return null;
    }
  };

  const redirectToSignIn = async (
    options: SignInRedirectOptions = {}
  ): Promise<never> => {
    const here = await servedPage();
    // The sign-in page asking for a session (its layout calls
    // requireSession, say) would redirect to itself, a level deeper each
    // time, until the browser gives up. That is a bug in the page: say so.
    if (here && isSignInPage(here)) {
      throw new Error(
        `@medaris/auth: redirectToSignIn() while rendering the sign-in page (${here}) would redirect it to itself; the sign-in page must not require a session`
      );
    }
    redirect(signInUrl(options.callbackUrl ?? here, options));
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
        // A token went out and was refused: the client must not go straight
        // back with this session (`reauth`).
        if (isUnauthorizedError(error))
          return unauthenticated({ reauth: true });
        throw error;
      }
    },
  };
}
