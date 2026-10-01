import type { AuthOptions } from "next-auth";

/**
 * Where NextAuth sends the browser instead of its own built-in pages
 * (MDRS-101). Without these, a signed-out visitor who opened a protected page
 * — and anyone whose sign-in or sign-out went wrong — landed on NextAuth's
 * English `/api/auth/*` screens. Each path below is an app page under
 * `[locale]`; next-intl's middleware adds the locale prefix on the way in.
 *
 * A Keycloak-free module, like `auth_cookies.ts`, because the Edge middleware
 * needs the same paths: `withAuth` reads `pages` from its own options, not
 * from `authOptions`, and the two must not drift.
 */
export const authPages = {
  signIn: "/auth/signin",
  signOut: "/auth/signout",
  error: "/auth/error",
} as const satisfies AuthOptions["pages"];

/** The page that starts Keycloak's registration form (`prompt=create`). */
export const registerPage = "/auth/register";

/**
 * Where a sign-in that names no destination ends up: it decides between the
 * first-login screen and `/learning`. See `lib/post-sign-in.ts`.
 */
export const postSignInPage = "/start";
