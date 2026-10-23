import { resources } from "@medaris/i18n";
import { LOCALE_COOKIE } from "@medaris/ui/lib/locale-preference";
import { DEFAULT_TIME_ZONE } from "@medaris/utils";
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { localeOf } from "./locale";

/**
 * No locale segment and no negotiation: the language is the viewer's choice
 * from Tedris or Nizam (the `medaris-locale` cookie, MDRS-248), Turkish when
 * there is none. Only the app's own namespaces are loaded, which keeps another
 * app's strings from being used by accident.
 *
 * No viewer time zone is read here. Pages that print a date take the zone
 * from `GET /me` (falling back to `DEFAULT_TIME_ZONE`) and pass it to the
 * formatter themselves; the default below only keeps the server render and
 * the browser from disagreeing about a date that names no zone (MDRS-110).
 */
export default getRequestConfig(async () => {
  const locale = localeOf((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    messages: {
      common: resources[locale].common,
      nazar: resources[locale].nazar,
    },
    timeZone: DEFAULT_TIME_ZONE,
  };
});
