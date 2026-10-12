import { isUnauthorizedError } from "@medaris/auth/server";
import { ResponseError } from "@medaris/services/tedrisat";
import { notFound, unstable_rethrow } from "next/navigation";
import { redirectToSignIn } from "~/lib/auth";
import { tedrisatApi } from "~/lib/tedrisat-api";

/**
 * A read for a page that can say what went wrong. A 403 is its own answer:
 * the role matrix refuses MEDRESE_NAZIR and DERS_NAZIR on the medrese's
 * management routes, so it is expected and quiet. Anything else is `failed`
 * and logged; a 404 is a medrese that is not there, the portal's 404.
 *
 * A 401 is none of these. The read went out with the session's token (no
 * token is `tedrisatApi`'s redirect), so tedrisat refused a token Keycloak
 * issued: a wrong audience, clock skew, a session ended at Keycloak within
 * the last minute. Every nazar page is behind the session, so the answer is
 * the sign-in page with `reauth`, which fetches new tokens instead of sending
 * the still signed-in browser straight back to the same refusal, and ends on
 * the "too many attempts" box if tedrisat never takes them.
 */
export type Read<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

type Api = Awaited<ReturnType<typeof tedrisatApi>>;

export async function readOnce<T>(
  what: string,
  call: (api: Api) => Promise<T>
): Promise<Read<T>> {
  try {
    return { status: "ok", data: await call(await tedrisatApi()) };
  } catch (error) {
    // `tedrisatApi`'s way to sign-in when the session is over.
    unstable_rethrow(error);
    if (!isUnauthorizedError(error)) return failedRead(what, error);
  }
  // Outside the `try`: the redirect is thrown, and a catch would swallow it.
  return redirectToSignIn({ reauth: true });
}

function failedRead(what: string, error: unknown): Read<never> {
  if (error instanceof ResponseError) {
    if (error.response.status === 403) return { status: "forbidden" };
    if (error.response.status === 404) notFound();
  }
  console.error(`Error fetching ${what}:`, error);
  return { status: "failed" };
}
