import { authPageUnderCallbackLocale } from "@medaris/utils";
import { type NextRequest, NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import createIntlMiddleware from "next-intl/middleware";
import { authCookies } from "~/lib/auth_cookies";
import { authPages, registerPage } from "~/lib/auth_pages";
import { locales, routing } from "~/lib/i18n/routing";
import { isPublicPath } from "~/lib/public-paths";

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
    // from `authOptions` — import cookies from a Keycloak-free module so
    // Edge middleware never loads openid-client. See auth_cookies.ts.
    cookies: authCookies,
    // Same reason: without `pages` here a signed-out visitor is sent to
    // NextAuth's built-in English chooser, whatever `authOptions` says.
    pages: authPages,
    callbacks: {
      authorized: ({ token }) => {
        // console.log('Auth middleware - authorized callback:', data)
        return token !== null && !token.error;
      },
    },
  }
);

const authPaths: readonly string[] = [
  ...Object.values(authPages),
  registerPage,
];

export default function middleware(req: NextRequest) {
  // `withAuth` sends a signed-out visitor to `/auth/signin`, with no locale;
  // next-intl would make it `/tr/...`. Keep the language of the page they
  // were stopped on, which Keycloak then opens in (MDRS-274).
  const localised = authPageUnderCallbackLocale(req.nextUrl, {
    authPaths,
    locales,
  });
  if (localised) return NextResponse.redirect(new URL(localised, req.url));

  if (isPublicPath(req.nextUrl.pathname)) {
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
