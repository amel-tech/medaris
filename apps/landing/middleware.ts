import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./lib/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export default intlMiddleware;

export const config = {
  // giris, kayit and tedris are redirect routes outside [locale] (MDRS-151).
  matcher: ["/((?!api|_next|_vercel|giris|kayit|tedris|.*\\..*).*)"],
};
