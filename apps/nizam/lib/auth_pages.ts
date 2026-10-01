import type { AuthOptions } from "next-auth";

/**
 * Where NextAuth sends the browser instead of its own built-in English pages
 * (MDRS-101). Keycloak-free, like `auth_cookies.ts`, because the Edge
 * middleware passes the same object to `withAuth`, which does not read
 * `authOptions`. See apps/tedris/lib/auth_pages.ts, its twin.
 */
export const authPages = {
  signIn: "/auth/signin",
  signOut: "/auth/signout",
  error: "/auth/error",
} as const satisfies AuthOptions["pages"];
