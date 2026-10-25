import { resources } from "@medaris/i18n";
import { LOCALE_COOKIE } from "@medaris/ui/lib/locale-preference";
import { resolveTimeZone, TIME_ZONE_COOKIE } from "@medaris/utils";
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { localeOf } from "./routing";

const resolveMessagesForLang = async (
  locale: keyof typeof resources,
  ns: string[] = ["common"]
) => {
  const messages = resources[locale];

  if (ns) {
    return Object.fromEntries(
      Object.entries(messages).filter(([key]) => ns.includes(key))
    );
  }

  return messages;
};

// The language is the viewer's choice, not the address (MDRS-248).
export default getRequestConfig(async () => {
  const jar = await cookies();
  const locale = localeOf(jar.get(LOCALE_COOKIE)?.value);

  const messages = await resolveMessagesForLang(
    locale,
    // Load only app-specific namespaces. This prevents using cross-app locale strings.
    ["common", "nizam"]
  );

  // Without a zone next-intl formats server-rendered dates in the server's
  // own zone, and the browser then disagrees while hydrating (MDRS-110). The
  // viewer's zone arrives in a cookie that `TimeZoneSync` keeps; until it
  // exists, server and browser both use the default.
  const timeZone = resolveTimeZone(jar.get(TIME_ZONE_COOKIE)?.value);

  return {
    locale,
    messages,
    timeZone,
  };
});
