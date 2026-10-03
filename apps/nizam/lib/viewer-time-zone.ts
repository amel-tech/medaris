"use server";

import { isValidTimeZone, TIME_ZONE_COOKIE } from "@medaris/utils";
import { cookies } from "next/headers";
import { authenticatedAction } from "~/lib/authenticated-action";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Picks the zone this viewer's dates are rendered in and keeps it in the
 * `TIME_ZONE_COOKIE` cookie, which `lib/i18n/request.ts` hands to next-intl
 * on the server (MDRS-110). The zone saved on the user's profile
 * (`users.time_zone`, MDRS-104) wins; the browser's own zone is the fallback,
 * and the only source for a visitor who is not signed in.
 *
 * Returns whether the cookie changed. Setting a cookie in a Server Action
 * makes Next re-render the current route in the action's response, so the
 * page on screen switches to the new zone without a separate refresh.
 */
export async function syncViewerTimeZone(
  browserTimeZone: string
): Promise<{ changed: boolean }> {
  const me = await authenticatedAction((api) => api.me.getMe());
  const profileTimeZone = me.success ? me.data.timeZone : undefined;
  const timeZone = isValidTimeZone(profileTimeZone)
    ? profileTimeZone
    : isValidTimeZone(browserTimeZone)
      ? browserTimeZone
      : null;
  if (!timeZone) return { changed: false };

  const jar = await cookies();
  if (jar.get(TIME_ZONE_COOKIE)?.value === timeZone) return { changed: false };
  jar.set(TIME_ZONE_COOKIE, timeZone, {
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return { changed: true };
}
