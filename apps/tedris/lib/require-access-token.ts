import { redirect } from "next/navigation";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Returns the access token, or sends the visitor to sign in if there is none.
 *
 * `getAccessToken()` resolves to `undefined` once a refresh has failed — the
 * common case being a refresh token that outlived its own deadline while the
 * NextAuth session cookie was still valid. The middleware lets such a request
 * through (it only sees `token.error`, which the `jwt` callback has not set
 * yet), so a server component that passed the `undefined` straight to the API
 * got a 401 and rendered the framework's raw error overlay — a ResponseError
 * from the generated client — instead of a sign-in prompt.
 *
 * `callbackUrl` is the path to come back to once the sign-in completes. Pass
 * it: without one NextAuth falls back to `baseUrl`, so a visitor whose refresh
 * token died while reading `/tr/decks/<id>/cards` re-authenticates and lands
 * on `/` — locale and destination both gone. It must be same-origin and start
 * with `/`; `authOptions.callbacks.redirect` rejects anything else.
 *
 * Call this BEFORE any `try`: `redirect()` signals by throwing, so a
 * surrounding catch would swallow it and fall back to empty data.
 */
export async function requireAccessToken(
  callbackUrl?: string
): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    redirect(
      callbackUrl
        ? `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
        : "/api/auth/signin"
    );
  }
  return accessToken;
}
