import { getTranslations } from "next-intl/server";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { env } from "~/env";
import { AuthEntry } from "~/features/auth/auth-entry";
import { signInLimit } from "~/lib/auth";
import { signInCallbackUrl } from "~/lib/post-sign-in";

/**
 * `pages.signIn` (MDRS-101): sends the visitor straight to Keycloak, or shows
 * a failed round trip's error. `?reauth=1` comes from a page whose token
 * tedrisat refused: the round trip fetches new tokens.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    reauth?: string;
  }>;
}) {
  const { callbackUrl, error, reauth } = await searchParams;
  const t = await getTranslations("tedris.Auth");

  return (
    <>
      <PhoneChrome section={null} title={t("signIn")} />
      <AuthEntry
        intent="signin"
        callbackUrl={signInCallbackUrl(callbackUrl, {
          baseUrl: env.NEXTAUTH_URL,
        })}
        error={error}
        reauth={reauth === "1"}
        limit={signInLimit}
      />
    </>
  );
}
