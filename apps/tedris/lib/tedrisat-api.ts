import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { env } from "~/env";
import { requireAccessToken } from "~/lib/auth";

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
