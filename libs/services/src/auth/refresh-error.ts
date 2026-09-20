/**
 * The sentinel an app's `refreshAccessToken` writes onto the session when a
 * refresh has failed.
 *
 * Declared once because it is the one value that must agree across three
 * places: each app's `refreshAccessToken` produces it, `createAccessTokenReader`
 * fails closed on it, and `RefreshErrorRedirect` compares against it to send
 * the visitor back to Keycloak. As four copied string literals, a change to one
 * left the others silently doing nothing.
 *
 * Its own module rather than a line in the `./auth` barrel: the client-side
 * `RefreshErrorRedirect` imports it directly, and the barrel reaches
 * `next/headers` through `get-access-token`, which would throw in a client
 * bundle.
 */
export const REFRESH_ACCESS_TOKEN_ERROR = "RefreshAccessTokenError";
