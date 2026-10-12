import "server-only";
import { isUnauthorizedError } from "@medaris/auth/server";
import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { unstable_rethrow } from "next/navigation";
import { env } from "~/env";
import { redirectToSignIn, requireAccessToken } from "~/lib/auth";

export type TedrisatApi = Awaited<ReturnType<typeof createServerTedrisatAPIs>>;

/**
 * The tedrisat client for a server read on a page that needs a session;
 * server components and layouts only.
 *
 * Every nizam read used to build its client from `await getAccessToken()`,
 * which could be `undefined` while the cookie still read as signed in: the
 * call went out with no token, tedrisat answered 401, and the page drew "no
 * köşks", "could not be read · retry" (a retry that never cleared) or "Bu
 * bölüm için izniniz yok" (A16, B4). No token is now the sign-in page, with
 * `callbackUrl` set to the page being served, so the round trip comes back to
 * it. Call it outside any `try`, or start the `catch` with `passOnSignIn`.
 */
export const tedrisatApi = async (): Promise<TedrisatApi> =>
  createServerTedrisatAPIs(
    await requireAccessToken(),
    env.TEDRISAT_API_BASE_URL
  );

/**
 * What a read does when tedrisat refuses the token itself (401): `sign-in`
 * sends the visitor to sign in again, like no token at all; `fail` leaves the
 * error to the read's own answer. Only the shell says `fail`: it also wraps the
 * sign-in page, where a redirect to sign-in would only lead back to itself.
 */
export type OnRefused = "sign-in" | "fail";

/**
 * The first line of a read's `catch`. Passes on `tedrisatApi`'s way to
 * sign-in (and Next's other control-flow errors, `unstable_rethrow`), and
 * turns a refused token into the same redirect, so a session tedrisat no
 * longer accepts is never drawn as an empty list, "izniniz yok" or "not
 * found". Returns for every other error, for the read to answer as before.
 */
export async function passOnSignIn(
  error: unknown,
  onRefused: OnRefused = "sign-in"
): Promise<void> {
  unstable_rethrow(error);
  if (onRefused === "sign-in" && isUnauthorizedError(error)) {
    await redirectToSignIn();
  }
}
