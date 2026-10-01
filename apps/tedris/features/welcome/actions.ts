"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getAccessToken } from "~/lib/auth_options";
import { routing } from "~/lib/i18n/routing";
import {
  learningPath,
  WELCOMED_COOKIE,
  WELCOMED_COOKIE_MAX_AGE,
  withWelcomed,
} from "~/lib/post-sign-in";
import { subjectOf } from "~/lib/token-subject";

/** B1's button: remember this user's visit, then go to `/learning` (MDRS-101). */
export async function completeWelcome(locale: string) {
  const sub = subjectOf(await getAccessToken());
  if (sub) {
    const jar = await cookies();
    jar.set(
      WELCOMED_COOKIE,
      withWelcomed(jar.get(WELCOMED_COOKIE)?.value, sub),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
        maxAge: WELCOMED_COOKIE_MAX_AGE,
      }
    );
  }

  redirect(
    learningPath(
      hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
    )
  );
}
