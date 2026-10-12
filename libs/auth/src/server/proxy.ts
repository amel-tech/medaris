import { type NextRequest, NextResponse } from "next/server";
import { AUTH_BASE_PATH, AUTH_ROUTES } from "../shared/routes";
import type { ResolvedAuthConfig } from "./config";
import { type CookieWrite, forwardCookies, writeCookies } from "./cookies";
import type { SessionRenewal } from "./renewal";
import { RETURN_TO_HEADER } from "./return-to";
import {
  hasUsableAccessToken,
  type SessionCookie,
  type StoredSession,
} from "./session-cookie";

/**
 * The auth half of an app's `proxy.ts` (Next 16; Node runtime): the one place
 * a session is refreshed, re-confirmed with the IdP, or ended.
 *
 * For every request it is given it reads the session cookie, lets
 * `SessionRenewal` refresh or check it, and writes the result twice: onto the
 * REQUEST, so the page, action or route handler rendered for it reads the new
 * session, and onto the RESPONSE, so the browser keeps it. Before Next 16 an
 * `auth()` call in a Server Component could refresh but never store the
 * result (C1); nothing downstream refreshes now.
 *
 * Then it gates: a page that is not public, asked for without a usable
 * session, is sent to the app's sign-in page with `callbackUrl` set to where
 * the visitor was. A public page renders for a visitor (MDRS-216). API routes
 * and Server Actions are never redirected: they answer for themselves (401,
 * or `{ kind: "unauthenticated" }`), since a redirect is not something a
 * `fetch` or an action call can follow to a useful place.
 *
 * Next's own advice stands: the proxy is the optimistic check; every Server
 * Function still reads the session itself (`requireSession`,
 * `withAccessToken`).
 */
export interface AuthProxyOptions {
  /**
   * Pages a visitor may open without a session. The app's sign-in page is
   * never redirected to itself, whatever this says.
   */
  isPublicPath?: (pathname: string) => boolean;
  /**
   * What runs for a page request auth lets through, e.g. next-intl's
   * middleware. Never called for `/api/…`. Default: pass the request on.
   */
  next?: (request: NextRequest) => Response | Promise<Response>;
}

export type AuthProxy = (
  request: NextRequest,
  options?: AuthProxyOptions
) => Promise<NextResponse>;

const OVERRIDE_HEADERS = "x-middleware-override-headers";
const REQUEST_HEADER = "x-middleware-request-";

const isApiPath = (pathname: string) =>
  pathname === "/api" || pathname.startsWith("/api/");

const isAuthRoute = (pathname: string) =>
  pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`);

/** A Server Action call: a POST to the page's own path, answered with data. */
const isServerAction = (request: NextRequest) =>
  request.headers.has("next-action");

const asNextResponse = (response: Response): NextResponse =>
  response instanceof NextResponse
    ? response
    : new NextResponse(response.body, response);

/**
 * Makes sure the request the app renders carries the cookie header as it is
 * now, and the return-to header. `NextResponse.next({ request: { headers } })`
 * does this through these same `x-middleware-*` headers; a response that came
 * back from another middleware (next-intl copies the request's headers, so it
 * normally has them already) gets the two values added to its list. A
 * redirect renders nothing and is left alone.
 */
function forwardRequestHeaders(
  response: NextResponse,
  request: NextRequest
): void {
  const { headers } = response;
  if (
    !headers.has("x-middleware-next") &&
    !headers.has("x-middleware-rewrite")
  ) {
    return;
  }
  const listed = headers.get(OVERRIDE_HEADERS);
  const names = new Set(
    (listed ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
  );
  if (listed === null) {
    for (const [name, value] of request.headers) {
      headers.set(`${REQUEST_HEADER}${name}`, value);
      names.add(name);
    }
  }
  for (const name of ["cookie", RETURN_TO_HEADER]) {
    const value = request.headers.get(name);
    if (value === null) continue;
    headers.set(`${REQUEST_HEADER}${name}`, value);
    names.add(name);
  }
  headers.set(OVERRIDE_HEADERS, [...names].join(","));
}

export function createAuthProxy(
  config: ResolvedAuthConfig,
  sessionCookie: SessionCookie,
  renewal: SessionRenewal
): AuthProxy {
  return async (request, options = {}) => {
    const { pathname, search } = request.nextUrl;
    const api = isApiPath(pathname);

    // Starting, finishing and ending a sign-in manage the cookie themselves.
    // The session route is not among them: a tab regaining focus reads it,
    // and that read is where a sign-out in another app is noticed.
    if (isAuthRoute(pathname) && pathname !== AUTH_ROUTES.session) {
      return NextResponse.next();
    }

    const stored = await sessionCookie.read(request.cookies);
    let current: StoredSession | null = stored;
    let writes: CookieWrite[] = [];
    if (stored) {
      const renewed = await renewal.renew(stored);
      if (renewed.kind === "updated") {
        current = renewed.session;
        writes = await sessionCookie.writes(request.cookies, current);
      } else if (renewed.kind === "ended") {
        current = null;
        writes = await sessionCookie.writes(request.cookies, null);
      }
    } else {
      // Cookies that do not open (another secret, a damaged chunk) go.
      writes = await sessionCookie.writes(request.cookies, null);
    }
    const signedIn =
      current !== null && hasUsableAccessToken(current, config.now());

    const returnTo = `${pathname}${search}`;
    if (
      !signedIn &&
      !api &&
      !isServerAction(request) &&
      !options.isPublicPath?.(pathname)
    ) {
      const page = config.signInPage(returnTo);
      if (page !== pathname) {
        const target = new URL(page, config.origin);
        target.searchParams.set("callbackUrl", returnTo);
        const response = NextResponse.redirect(target);
        writeCookies(response.cookies, writes, config.secure);
        return response;
      }
    }

    forwardCookies(request.cookies, writes);
    request.headers.set(RETURN_TO_HEADER, returnTo);
    const passOn = () =>
      NextResponse.next({ request: { headers: request.headers } });
    const response = asNextResponse(
      api || !options.next ? passOn() : await options.next(request)
    );
    forwardRequestHeaders(response, request);
    writeCookies(response.cookies, writes, config.secure);
    return response;
  };
}
