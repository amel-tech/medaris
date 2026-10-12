import { createAuth } from "@medaris/auth/server";
import { env } from "~/env";
import { localeOfPath, locales, routing } from "~/lib/i18n/routing";
import { authPages } from "~/lib/public-paths";

/**
 * nizam's session (auth Phase 1): one `@medaris/auth` instance built from the
 * app's own environment, in place of NextAuth's `auth_options.ts`,
 * `auth_cookies.ts` and `auth_pages.ts`. Nothing reaches Keycloak until a
 * request needs it.
 *
 * - The Keycloak client is unchanged: the redirect URI stays
 *   `<NEXTAUTH_URL>/api/auth/callback/keycloak` and the post-logout redirect
 *   URI stays `NEXTAUTH_URL`, the package's defaults. A sign-out with no ID
 *   token to hint with ends here only and lands on `/`, as Keycloak's
 *   redirect does.
 * - The sign-in page is the one under the locale of the page the visitor was
 *   on, and Keycloak opens in that language (`ui_locales` and `kc_locale`,
 *   MDRS-274); a sign-in that names no page ends on that locale's home.
 * - The cookies are `nizam.*` (`__Host-nizam.*` over https), apart from
 *   tedris's and nazar's on one localhost (MDRS-24).
 *
 * `auth()` and `getAccessToken()` read the cookie once per request and never
 * refresh: `proxy.ts` has renewed the session before the page renders.
 */
export const {
  auth,
  getAccessToken,
  requireSession,
  requireAccessToken,
  withAccessToken,
  redirectToSignIn,
  signInUrl,
  handlers,
  proxy,
} = createAuth({
  issuer: env.KEYCLOAK_ISSUER,
  clientId: env.KEYCLOAK_CLIENT_ID,
  clientSecret: env.KEYCLOAK_CLIENT_SECRET,
  baseUrl: env.NEXTAUTH_URL,
  secret: env.NEXTAUTH_SECRET,
  cookiePrefix: "nizam",
  pages: {
    signIn: (returnTo) =>
      `/${localeOfPath(returnTo) ?? routing.defaultLocale}${authPages.signIn}`,
    afterSignIn: (locale) => `/${locale ?? routing.defaultLocale}`,
  },
  locales,
  kcLocale: true,
});
