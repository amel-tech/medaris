import { withoutLocaleSegment } from "@medaris/ui/lib/locale-preference";
import { type NextRequest, NextResponse } from "next/server";
import { proxy as authProxy } from "~/lib/auth";
import { locales } from "~/lib/i18n/routing";
import { isPublicPath } from "~/lib/public-paths";

/**
 * Next 16's proxy (Node runtime), in place of `middleware.ts`: the one place
 * the session is refreshed, re-checked with Keycloak once a minute (a sign-out
 * in another Medaris app, MDRS-210; with a session store, Keycloak's
 * back-channel logout does that instead) or ended. A page that is not public,
 * asked for without a session, goes to the sign-in page with `callbackUrl`.
 * `/api/…` is refreshed but never redirected.
 *
 * Before that, an address from before MDRS-248 (`/en/kosks`) moves to the
 * same page without the language: the language is the `medaris-locale`
 * cookie's.
 */
export default function proxy(request: NextRequest) {
  const bare = withoutLocaleSegment(request.nextUrl, locales);
  if (bare) return NextResponse.redirect(new URL(bare, request.url), 308);

  return authProxy(request, { isPublicPath });
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
