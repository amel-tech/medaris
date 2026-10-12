import { createAuth } from "@medaris/auth/server";
import { env } from "~/env";
import { authPages, homePath } from "~/lib/auth_pages";
import { locales, routing } from "~/lib/i18n/routing";

/**
 * The locale of a return path (`/en/courses/1` → `en`), or the default one
 * when it names none. The sign-in page opens in it, and Keycloak with it
 * (MDRS-274): a visitor stopped on an English page signs in in English.
 */
const localeOf = (path: string | null): string =>
  locales.find((locale) => path?.split("/")[1] === locale) ??
  routing.defaultLocale;

/**
 * tedris's session: one `@medaris/auth` instance built from this app's own
 * environment (`TEDRIS__*` in the root `.env`). The variables, the redirect
 * URI (`<NEXTAUTH_URL>/api/auth/callback/keycloak`) and the post-logout
 * redirect URI (`NEXTAUTH_URL`) are the ones the Keycloak client has held since
 * NextAuth, so nothing changes at the IdP.
 *
 * Only `proxy.ts` refreshes or ends a session. Everything below it reads:
 *
 * - `auth()`: the session, or `null` for a visitor. Read once per request,
 *   however many components ask (D1), and `null` for a session without a
 *   usable access token, so a public page renders the visitor's view of an
 *   expired session (MDRS-216).
 * - `requireAccessToken()`: the token for a member read, or a redirect to the
 *   sign-in page that comes back to the page being served (A16).
 * - `withAccessToken()`: the same for a Server Action, answering
 *   `{ kind: "unauthenticated" }` instead of redirecting
 *   (`lib/authenticated-action.ts`).
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
  cookiePrefix: "tedris",
  pages: {
    signIn: (returnTo) => `/${localeOf(returnTo)}${authPages.signIn}`,
    // A sign-in that names no page ("Giriş yap" in the header, "Kayıt ol")
    // ends on Ana sayfa: `/<locale>` sends a signed-in caller on to /home.
    // There is no first-login step any more.
    afterSignIn: (locale) => homePath(locale ?? routing.defaultLocale),
  },
  locales,
  kcLocale: true,
});
