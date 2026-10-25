import { authPages, registerPage } from "./auth_pages";

/**
 * Where a signed-out visitor's "giriş yap" and "kayıt ol" go (MDRS-160): the
 * app's own sign-in and registration pages, which send the visitor on to
 * Keycloak. Sign-in names the page to come back to, `callbackPath`.
 * Registration ends on Ana sayfa (see `registerPage`).
 */
export const inviteHrefs = (callbackPath: string) => ({
  signIn: `${authPages.signIn}?callbackUrl=${encodeURIComponent(callbackPath)}`,
  register: registerPage,
});
