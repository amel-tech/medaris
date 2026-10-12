import { createAuth } from "@medaris/auth/server";
import { env } from "~/env";
import { LOCALE } from "~/lib/i18n/locale";

/**
 * Nazar's sign-in, session and sign-out, on the one implementation the web
 * apps share (`@medaris/auth`, auth Phase 1). It replaces this app's copy of
 * next-auth 4 (`auth_options.ts`, `auth_cookies.ts`, `auth_pages.ts`, the
 * Edge `middleware.ts`), where a refresh in a server render could never be
 * stored (B1) and a session with a failed refresh still read as signed in
 * (#270).
 *
 * The values are the ones the Keycloak client already has: the redirect URI
 * stays `<NEXTAUTH_URL>/api/auth/callback/keycloak`, and a sign-out comes back
 * to `NEXTAUTH_URL` (`postLogoutRedirectUri`'s default), which is `/`, behind
 * the session, so it ends on Keycloak's form as before. A sign-in that names
 * no page ends on `/` too, which sends the person on to their scope.
 *
 * Nazar has no locale routing: the sign-in page is always `/auth/signin`, and
 * Keycloak's pages open in Turkish (`ui_locales` and `kc_locale`, MDRS-274).
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
  cookiePrefix: "nazar",
  pages: { signIn: "/auth/signin" },
  locales: [LOCALE],
  kcLocale: true,
});
