import { locales } from "./i18n/routing";

/**
 * nizam's own sign-in and sign-out pages, under every locale (MDRS-101).
 * `lib/auth.ts` sends every sign-in to the first; the second is the one
 * confirmation before `signOut()`.
 */
export const authPages = {
  signIn: "/auth/signin",
  signOut: "/auth/signout",
} as const;

/**
 * Pages a signed-out visitor may open (MDRS-101 split this out of the
 * middleware so it can be tested). `proxy.ts` hands it to `@medaris/auth`,
 * which renders these for a visitor and sends every other page to sign-in. The
 * sign-in page would be safe without it, since the package never redirects it
 * to itself; the sign-out page needs it for a session that ended before the
 * click.
 */
export const publicPages = ["/", authPages.signIn, authPages.signOut];

const publicPathnameRegex = new RegExp(
  `^(/(${locales.join("|")}))?(${publicPages.join("|")})?/?$`,
  "i"
);

export const isPublicPath = (pathname: string): boolean =>
  publicPathnameRegex.test(pathname);
