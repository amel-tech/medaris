/**
 * Where the app's own auth pages live (MDRS-101); each is a page under
 * `[locale]`, and next-intl adds the locale prefix on the way in. The sign-in
 * page is where every "you need to sign in" ends (the parallel-tab guard and
 * the error box, `features/auth/auth-entry.tsx`); the sign-out page is the
 * confirmation the account menu links to.
 *
 * A module with no auth code in it, so `proxy.ts`, `lib/auth.ts`, the public
 * paths and the links all name the same paths.
 */
export const authPages = {
  signIn: "/auth/signin",
  signOut: "/auth/signout",
} as const;

/** The page that starts Keycloak's registration form (`prompt=create`). */
export const registerPage = "/auth/register";

/**
 * Where a sign-in that names no destination ends up: it decides between the
 * first-login screen and `/learning`. See `lib/post-sign-in.ts`.
 */
export const postSignInPage = "/start";
