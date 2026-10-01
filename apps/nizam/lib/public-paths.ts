import { authPages } from "./auth_pages";
import { locales } from "./i18n/routing";

/**
 * Pages a signed-out visitor may open (MDRS-101 split this out of
 * `middleware.ts` so it can be tested). The auth pages have to be here: behind
 * `withAuth`, the sign-in page would redirect to itself, and NextAuth refuses
 * an error page that requires authentication.
 */
export const publicPages = [
  "/",
  authPages.signIn,
  authPages.signOut,
  authPages.error,
];

const publicPathnameRegex = new RegExp(
  `^(/(${locales.join("|")}))?(${publicPages.join("|")})?/?$`,
  "i"
);

export const isPublicPath = (pathname: string): boolean =>
  publicPathnameRegex.test(pathname);
