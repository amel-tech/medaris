import { signOut } from "next-auth/react";
import { env } from "~/env";

/**
 * Ends both sessions: NextAuth's cookie and Keycloak's SSO session.
 *
 * `signOut()` on its own only clears this app's cookie — Keycloak keeps the
 * user signed in, so the next "Sign in with Keycloak" click logs the same
 * account straight back in without a password prompt. Handing the end-session
 * URL to `callbackUrl` makes NextAuth perform the navigation itself, in one
 * step: a separate `window.location.href` after `signOut({ redirect: false })`
 * loses the race against the `withAuth` middleware, which redirects to the
 * sign-in page the moment the cookie disappears.
 */
export const keycloakSignOut = async (idToken?: string): Promise<void> => {
  const params = new URLSearchParams({
    client_id: env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "",
    post_logout_redirect_uri: env.NEXT_PUBLIC_NEXTAUTH_URL ?? "",
    id_token_hint: idToken ?? "",
  });

  await signOut({
    callbackUrl: `${env.NEXT_PUBLIC_KEYCLOAK_ISSUER}/protocol/openid-connect/logout?${params.toString()}`,
  });
};
