import { authPages, registerPage } from "./auth_pages";

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Pages a signed-out visitor may open (MDRS-101 split this out of the
 * middleware so it can be tested); `proxy.ts` hands it to the auth gate. The
 * auth pages are here so a visitor reaches them without a session; the
 * sign-out confirmation too, which a session that ended under it still shows.
 */
export const publicPages = [
  "/",
  "/home",
  "/discover",
  authPages.signIn,
  authPages.signOut,
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
  `^(${[...publicPages, ...publicPagePatterns].join("|")})/?$`,
  "i"
);

export const isPublicPath = (pathname: string): boolean =>
  publicPathnameRegex.test(pathname);
