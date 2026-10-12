/**
 * Where the four auth routes live in every app. The callback path is the
 * redirect URI the Keycloak clients have registered since NextAuth
 * (`<NEXTAUTH_URL>/api/auth/callback/keycloak`); keeping it means no client
 * changes at the IdP when an app moves to this package.
 */
export const AUTH_BASE_PATH = "/api/auth";

export const AUTH_ROUTES = {
  /** GET: starts a sign-in round trip. */
  signIn: `${AUTH_BASE_PATH}/signin`,
  /** GET: where the IdP sends the browser back. */
  callback: `${AUTH_BASE_PATH}/callback/keycloak`,
  /** POST: ends the session here and at the IdP. */
  signOut: `${AUTH_BASE_PATH}/signout`,
  /** GET: the client-safe session, or `null`. */
  session: `${AUTH_BASE_PATH}/session`,
} as const;
