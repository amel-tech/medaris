import { destinationFromCallback } from "@medaris/utils";
import { setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { AuthEntry } from "~/features/auth/auth-entry";
import { locales } from "~/lib/i18n/routing";

/**
 * The sign-in page (MDRS-101; `pages.signIn` in `lib/auth.ts`): sends the
 * visitor on to Keycloak, or shows a failed round trip's error. `?reauth=1`
 * comes from a page whose token tedrisat refused: it asks for new tokens.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    reauth?: string;
  }>;
}) {
  const { locale } = await params;
  const { callbackUrl, error, reauth } = await searchParams;
  setRequestLocale(locale);

  return (
    <AuthEntry
      callbackUrl={
        destinationFromCallback(callbackUrl, {
          baseUrl: env.NEXTAUTH_URL,
          locales,
        }) ?? `/${locale}`
      }
      error={error}
      reauth={reauth === "1"}
    />
  );
}
