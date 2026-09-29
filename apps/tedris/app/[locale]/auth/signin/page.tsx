import { setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { AuthEntry } from "~/features/auth/auth-entry";
import { locales } from "~/lib/i18n/routing";
import { signInCallbackUrl } from "~/lib/post-sign-in";

/**
 * `pages.signIn` (MDRS-101): sends the visitor straight to Keycloak instead of
 * NextAuth's English provider chooser, or shows a failed round trip's error.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { callbackUrl, error } = await searchParams;
  setRequestLocale(locale);

  return (
    <AuthEntry
      intent="signin"
      callbackUrl={signInCallbackUrl(callbackUrl, {
        baseUrl: env.NEXTAUTH_URL,
        locales,
        locale,
      })}
      error={error}
    />
  );
}
