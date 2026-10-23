import { withoutLocaleSegment } from "@medaris/ui/lib/locale-preference";
import { type NextRequest, NextResponse } from "next/server";
import { proxy as authProxy } from "~/lib/auth";
import { locales } from "~/lib/i18n/routing";
import { isPublicPath } from "~/lib/public-paths";

/**
 * Every request tedris serves, before it renders (Next 16, Node runtime). The
 * only place a session is refreshed, re-confirmed with Keycloak (a sign-out in
 * another Medaris app, MDRS-210) or ended: see `@medaris/auth`'s proxy.
 *
 * In order:
 *
 * 1. An address from before MDRS-248 (`/en/courses/1`) moves to the same page
 *    without the language: the language is the `medaris-locale` cookie's.
 * 2. The auth step: the session is renewed for this request and the response;
 *    a page that is not in `public-paths.ts`, asked for without a session,
 *    goes to `/auth/signin?callbackUrl=<where they were>`. A public page
 *    renders for the visitor (MDRS-216); `/api/…` and Server Actions are
 *    never redirected, they answer for themselves.
 */
export default function proxy(request: NextRequest) {
  const bare = withoutLocaleSegment(request.nextUrl, locales);
  if (bare) return NextResponse.redirect(new URL(bare, request.url), 308);

  return authProxy(request, { isPublicPath });
}

export const config = {
  // Everything but Next's own files, the three auth routes that manage the
  // cookie themselves, the IdP's back-channel logout (auth Phase 2: a
  // server-to-server POST with no cookie), the public calendar feed (`/calendar/<token>.ics`: a
  // calendar app has no session, and the token in the URL is the credential,
  // MDRS-120) and static files by extension. Each exclusion is anchored with a
  // slash or `$` (B11), and a dot alone no longer skips the gate: a protected
  // page with one in its path is gated and refreshed like any other.
  // `/api/auth/session` and the app's own `/api/…` routes stay in: a tab
  // regaining focus reads the session through here (MDRS-210), and a route
  // handler reads a token this step has just renewed.
  matcher: [
    "/((?!_next/|api/auth/(?:signin|signout|callback|backchannel-logout)(?:/|$)|calendar/|.*\\.(?:ico|png|jpe?g|gif|svg|webp|txt|xml|json|webmanifest|woff2?|ttf|otf|map)$).*)",
  ],
};
