import type { NextRequest } from "next/server";
import { withAuth } from "next-auth/middleware";
import createIntlMiddleware from "next-intl/middleware";
import authOptions from "~/lib/auth_options";
import { routing } from "~/lib/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const authMiddleware = withAuth(
  // Note that this callback is only invoked if
  // the `authorized` callback has returned `true`
  // and not for pages listed in `pages`.
  function onSuccess(req) {
    return intlMiddleware(req);
  },
  {
    // `withAuth` reads the session cookie name from its own options, not
    // from `authOptions` — reuse the app-specific cookie config here too,
    // otherwise the middleware falls back to the shared `next-auth.*`
    // default and the MDRS-24 fix only half-applies. See auth_options.ts.
    cookies: authOptions.cookies,
    callbacks: {
      authorized: ({ token }) => {
        // console.log('Auth middleware - authorized callback:', data)
        return token !== null && !token.error;
      },
    },
  }
);

export default function middleware(req: NextRequest) {
  const publicPages = ["/", "/api/auth/signin"];
  const locales = routing.locales;

  const publicPathnameRegex = new RegExp(
    `^(/(${locales.join("|")}))?(${publicPages.join("|")})?$`,
    "i"
  );
  const isPublicPage = publicPathnameRegex.test(req.nextUrl.pathname);

  if (isPublicPage) {
    return intlMiddleware(req as any);
  } else {
    return (authMiddleware as any)(req);
  }
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/trpc`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
