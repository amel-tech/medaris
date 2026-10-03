import { authPages, registerPage } from "./auth_pages";
import { locales } from "./i18n/routing";

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Pages a signed-out visitor may open (MDRS-101 split this out of
 * `middleware.ts` so it can be tested). The auth pages have to be here: behind
 * `withAuth`, the sign-in page would redirect to itself, and NextAuth refuses
 * an error page that requires authentication.
 */
export const publicPages = [
  "/",
  "/home",
  "/discover",
  authPages.signIn,
  authPages.signOut,
  authPages.error,
  registerPage,
];

/**
 * The intro pages a visitor reads before deciding to sign in (MDRS-122): a
 * köşk, a medrese, a course. One path segment after the prefix, and nothing
 * below it — `/courses/<id>/lessons/<id>` stays behind the middleware, which
 * sends a signed-out visitor to sign in. Whether the page has anything to show
 * is the API's decision, not this list's: an unlisted köşk, a draft or a
 * hidden course answers 404 to a caller with no token.
 */
export const publicPagePatterns = [
  "/kosks/[^/]+",
  "/madrasahs/[^/]+",
  "/courses/[^/]+",
  // A deck and its study page (MDRS-165, design tedris/32): only by id, so
  // `/decks/create` and `/decks/explore` stay behind the middleware. Whether
  // the deck may be seen is the API's call: a private one answers 404.
  `/decks/${uuidPattern}`,
  `/decks/study/${uuidPattern}`,
];

const publicPathnameRegex = new RegExp(
  `^(/(${locales.join("|")}))?(${[...publicPages, ...publicPagePatterns].join("|")})?/?$`,
  "i"
);

export const isPublicPath = (pathname: string): boolean =>
  publicPathnameRegex.test(pathname);
