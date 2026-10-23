import { destinationFromCallback } from "@medaris/utils";
import { env } from "~/env";
import { AuthEntry } from "~/features/auth/auth-entry";

/**
 * The sign-in page (MDRS-101; `pages.signIn` in `lib/auth.ts`): sends the
 * visitor on to Keycloak, or shows a failed round trip's error. `?reauth=1`
 * comes from a page whose token tedrisat refused: it asks for new tokens.
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

  return (
    <AuthEntry
      callbackUrl={
        destinationFromCallback(callbackUrl, {
          baseUrl: env.NEXTAUTH_URL,
        }) ?? "/"
      }
      error={error}
      reauth={reauth === "1"}
    />
  );
}
