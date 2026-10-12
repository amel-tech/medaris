import { destinationFromCallback } from "@medaris/utils";
import { env } from "~/env";
import { AuthEntry } from "~/features/auth/auth-entry";

/**
 * The sign-in page (`pages.signIn` in lib/auth.ts, MDRS-101): where the proxy
 * and a page whose session is over send the visitor, with `callbackUrl`, and
 * where a failed round trip comes back with `?error=`. It sends the visitor
 * on to Keycloak, or shows the error. There is no locale segment, so no locale
 * root needs reducing to "no destination"; the app's own root (`/`) already
 * does.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <AuthEntry
      callbackUrl={
        destinationFromCallback(callbackUrl, {
          baseUrl: env.NEXTAUTH_URL,
          locales: [],
        }) ?? "/"
      }
      error={error}
    />
  );
}
