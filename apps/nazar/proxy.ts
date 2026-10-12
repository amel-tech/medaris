import type { NextRequest } from "next/server";
import { proxy as authProxy } from "~/lib/auth";

/**
 * Next 16's `proxy.ts` (Node runtime), in place of next-auth's Edge
 * `middleware.ts`. The one place nazar's session changes: it refreshes the
 * access token before it runs out, asks Keycloak once a minute whether the
 * session still exists (a sign-out in another Medaris app, MDRS-210), and
 * hands the page the session as it is now. Every page it runs on is behind the
 * session: nazar has no public page, so a signed-out request goes to
 * `/auth/signin?callbackUrl=<where it was going>`. Server Actions and
 * `/api/auth/session` are refreshed but never redirected; they answer for
 * themselves. Nazar has no locale routing, so nothing runs after it.
 */
export default function proxy(request: NextRequest) {
  return authProxy(request);
}

export const config = {
  // Every pathname except
  // - `/_next/…`, the build output
  // - `/auth/…`, the sign-in and sign-out pages: they must open without a
  //   session, and the sign-in page would otherwise send itself to itself
  // - `/api/auth/signin`, `/signout` and `/callback/…`, which manage the
  //   cookie themselves (`/api/auth/session` stays in: a tab regaining focus
  //   reads it, and that read is where a sign-out elsewhere is noticed)
  // - static files, by extension (`favicon.ico`, `uthman/uthman.ttf`): a page
  //   whose path holds a dot is still behind the session
  // Each exclusion ends at a slash or the end, so `/authors` and `/_nextx` are
  // pages like any other (B11). Written out in full: Next reads the matcher
  // statically. proxy.spec.ts holds the cases.
  matcher: [
    "/((?!_next/|auth/|api/auth/(?:signin|signout|callback)(?:/|$)|.*\\.(?:ico|png|jpe?g|gif|svg|webp|txt|xml|webmanifest|woff2?|ttf|otf|map)$).*)",
  ],
};
