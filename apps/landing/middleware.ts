import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./lib/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export default intlMiddleware;

// `aydinlatma-metni` (MDRS-102) is Turkish at one fixed address, outside
// [locale]; next-intl must not redirect it to /en/aydinlatma-metni. Anchored
// to the segment's end, so a longer path still gets a locale.
export const config = {
  matcher: [
    "/((?!api|_next|_vercel|images|uthman|icons|aydinlatma-metni(?:/|$)|.*\\..*).*)",
  ],
};
