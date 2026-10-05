import { withAuth } from "next-auth/middleware";
import { authCookies } from "~/lib/auth_cookies";
import { authPages } from "~/lib/auth_pages";

/**
 * Everything the matcher below lets through is behind the Keycloak session.
 * Nazır has no locale routing, so unlike nizam there is no intl middleware to
 * hand a signed-in request on to: `withAuth` lets it through as it is.
 */
export default withAuth({
  // `withAuth` reads the session cookie name from its own options, not
  // from `authOptions` — import cookies from a Keycloak-free module so
  // Edge middleware never loads openid-client. See auth_cookies.ts.
  cookies: authCookies,
  // Same reason: without `pages` here a signed-out visitor is sent to
  // NextAuth's built-in English chooser, whatever `authOptions` says.
  pages: authPages,
  callbacks: {
    authorized: ({ token }) => token !== null && !token.error,
  },
});

export const config = {
  // Match every pathname except
  // - `/api/…` (NextAuth's own handler lives there) and `/_next/…`
  // - `/auth/…`, the sign-in, sign-out and error pages (`authPages`): behind
  //   `withAuth` the sign-in page would redirect to itself, and NextAuth
  //   refuses an error page that requires authentication
  // - anything containing a dot (`favicon.ico`)
  // Written out in full: Next reads the matcher statically, so it cannot be
  // built from `authPages`; auth-pages.spec.ts holds the two together.
  matcher: ["/((?!(?:api|_next|auth)(?:/|$)|.*\\..*).*)"],
};
