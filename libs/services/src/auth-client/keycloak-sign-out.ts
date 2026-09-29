import { signOut } from "next-auth/react";

export interface KeycloakSignOutConfig {
  /** `KEYCLOAK_CLIENT_ID`, read on the server and handed over at call time. */
  clientId: string;
  /** `KEYCLOAK_ISSUER` — the realm URL, without a trailing slash. */
  issuer: string;
  /** Where Keycloak sends the browser afterwards; the app's own origin. */
  postLogoutRedirectUri: string;
}

/**
 * Builds the sign-out that ends BOTH sessions: NextAuth's cookie and
 * Keycloak's SSO session.
 *
 * `signOut()` on its own only clears the calling app's cookie — Keycloak keeps
 * the user signed in, so the next "Sign in with Keycloak" click logs the same
 * account straight back in without a password prompt. Handing the end-session
 * URL to `callbackUrl` makes NextAuth perform the navigation itself, in one
 * step: a separate `window.location.href` after `signOut({ redirect: false })`
 * loses the race against the `withAuth` middleware, which redirects to the
 * sign-in page the moment the cookie disappears.
 *
 * A factory rather than a function so this file reads no `~/env`: the three
 * values are the only thing that differed between the two byte-identical
 * copies this replaces, and the race above is exactly the kind of detail that
 * gets fixed in one copy and not the other. Since MDRS-86 each app obtains
 * them from a server action at call time, not from `NEXT_PUBLIC_*` keys, so
 * the browser bundle carries no environment-specific value.
 *
 * Client-only, hence the `auth-client` subpath: `next-auth/react` belongs to
 * the browser bundle, while `@medaris/services/auth` reaches `next/headers`
 * and would throw if it were pulled into a client component.
 */
export const createKeycloakSignOut =
  (config: KeycloakSignOutConfig) =>
  async (idToken?: string): Promise<void> => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      post_logout_redirect_uri: config.postLogoutRedirectUri,
      id_token_hint: idToken ?? "",
    });

    await signOut({
      callbackUrl: `${config.issuer}/protocol/openid-connect/logout?${params.toString()}`,
    });
  };
