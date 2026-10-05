import { destinationFromCallback } from "@medaris/utils";
import { env } from "~/env";
import { AuthEntry } from "~/features/auth/auth-entry";

/**
 * `pages.signIn` (MDRS-101): sends the visitor straight to Keycloak instead of
 * NextAuth's English provider chooser, or shows a failed round trip's error.
 * There is no locale segment, so no locale root needs reducing to "no
 * destination"; the app's own root (`/`) already does.
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
