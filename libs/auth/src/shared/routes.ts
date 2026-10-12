/**
 * Where the five auth routes live in every app. The callback path is the
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
  /**
   * POST, from the IdP and never from a browser: OIDC Back-Channel Logout
   * 1.0. Ends this app's sessions of an IdP session that ended (auth Phase 2).
   */
  backchannelLogout: `${AUTH_BASE_PATH}/backchannel-logout`,
} as const;

/**
 * `?reauth=1` on the app's sign-in page and on the start route: the API
 * refused the token this browser's session holds, so "already signed in, go
 * on" would only send it back to the same refusal. With it the sign-in page
 * waits for a newer session than the one it was sent with, and the start
 * route goes through the IdP for new tokens instead of straight back; both
 * still count against the sign-in caps.
 */
export const REAUTH_PARAM = "reauth";
