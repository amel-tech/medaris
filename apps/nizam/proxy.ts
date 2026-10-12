import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { proxy as authProxy } from "~/lib/auth";
import { routing } from "~/lib/i18n/routing";
import { isPublicPath } from "~/lib/public-paths";

const intl = createIntlMiddleware(routing);

/**
 * Next 16's proxy (Node runtime), in place of `middleware.ts`: the one place
 * the session is refreshed, re-checked with Keycloak once a minute (a sign-out
 * in another Medaris app, MDRS-210; with a session store, Keycloak's
 * back-channel logout does that instead) or ended. A page that is not public,
 * asked for without a session, goes to the sign-in page under its own locale
 * with `callbackUrl` (MDRS-274); every page `@medaris/auth` lets through goes
 * on to next-intl. `/api/…` is refreshed but never redirected, and never
 * reaches next-intl.
 */
export default function proxy(request: NextRequest) {
  return authProxy(request, { isPublicPath, next: intl });
}

export const config = {
  // Every exclusion is anchored with a slash or `$`: the old
  // `(?!api|trpc|_next|_vercel|.*\\..*)` also skipped `/apiary`, and any path
  // with a dot in it went without the gate and the refresh (B11). Static files
  // are left out by extension, and so are the sign-in round trip's own routes
  // and the IdP's back-channel logout (auth Phase 2: a server-to-server POST
  // with no cookie). The app's own `/api/…` routes and
  // `/api/auth/session` stay in, since a tab regaining focus reads the session
  // there and that read is where a sign-out elsewhere is noticed.
  matcher: [
    "/((?!_next/|_vercel/|api/auth/(?:signin|signout|callback|backchannel-logout)(?:/|$)|.*\\.(?:ico|png|jpe?g|gif|svg|webp|txt|xml|json|webmanifest|woff2?|ttf|otf|map)$).*)",
  ],
};
