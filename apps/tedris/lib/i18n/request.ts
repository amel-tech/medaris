import { resources } from "@medaris/i18n";
import { resolveTimeZone, TIME_ZONE_COOKIE } from "@medaris/utils";
import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

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

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages = await resolveMessagesForLang(
    locale,
    // Load only app-specific namespaces. This prevents using cross-app locale strings.
    ["common", "tedris", "tedrisLearn"]
  );

  // Without a zone next-intl formats server-rendered dates in the server's
  // own zone, and the browser then disagrees while hydrating (MDRS-110). The
  // viewer's zone arrives in a cookie that `TimeZoneSync` keeps; until it
  // exists, server and browser both use the default.
  const timeZone = resolveTimeZone(
    (await cookies()).get(TIME_ZONE_COOKIE)?.value
  );

  return {
    locale,
    messages,
    timeZone,
  };
});
