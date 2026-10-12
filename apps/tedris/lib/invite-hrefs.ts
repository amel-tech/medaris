import { authPages, registerPage } from "./auth_pages";

/**
 * Where a signed-out visitor's "giriş yap" and "kayıt ol" go (MDRS-160): the
 * app's own sign-in and registration pages, which send the visitor on to
 * Keycloak. Sign-in names the page to come back to, `callbackPath` (written
 * without the locale) under the visitor's locale: a path without one would
 * land on Turkish after the round trip. Registration always ends on `/start`
 * (see `registerPage`).
 */
export const inviteHrefs = (locale: string, callbackPath: string) => ({
  signIn: `/${locale}${authPages.signIn}?callbackUrl=${encodeURIComponent(
    `/${locale}${callbackPath}`
  )}`,
  register: `/${locale}${registerPage}`,
});
