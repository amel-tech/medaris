import { isUnauthorizedError } from "@medaris/auth/server";
import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { env } from "~/env";
import { redirectToSignIn, requireAccessToken } from "~/lib/auth";

export type TedrisatClient = Awaited<
  ReturnType<typeof createServerTedrisatAPIs>
>;

/**
 * The tedrisat client for a member read: the caller's own token, or a
 * redirect to the sign-in page that comes back to the page being served.
 *
 * Never a request without a token. That was A16: an ended session's reads
 * went out anonymous, tedrisat answered 401, and the page drew "could not be
 * read" (or an empty list) with a retry that could never work. A page a
 * visitor may read too (a köşk, a course, Keşfet) reads with
 * `getAccessToken()` instead and treats no session as a visitor (MDRS-216).
 *
 * Call it outside any `try`: the redirect is thrown, and a catch would turn
 * it back into the failed read.
 */
export const memberApi = async (): Promise<TedrisatClient> =>
  createServerTedrisatAPIs(
    await requireAccessToken(),
    env.TEDRISAT_API_BASE_URL
  );

/**
 * The first line of a member read's `catch`: a 401 there is no failed read.
 * The read went out with the session's token (no token is `memberApi`'s
 * redirect), so tedrisat refused a token Keycloak issued: a wrong audience,
 * clock skew, a session ended at Keycloak within the last minute. Drawn as
 * "could not be read", its retry could never work; a plain redirect to
 * sign-in would find the browser signed in and send it straight back. So the
 * page goes to sign in for new tokens (`reauth`), and a token tedrisat never
 * takes ends on the "too many attempts" box instead of a loop. Returns for
 * every other error, for the read to answer as before.
 *
 * Only for reads of pages behind the session. A public page reads as a
 * visitor where it has no session (MDRS-216), and a side read every page
 * draws (the header's bell) draws without its data instead.
 */
export async function reauthIfRefused(error: unknown): Promise<void> {
  if (isUnauthorizedError(error)) await redirectToSignIn({ reauth: true });
}
