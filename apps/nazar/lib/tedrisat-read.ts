import { ResponseError } from "@medaris/services/tedrisat";
import { notFound, unstable_rethrow } from "next/navigation";
import { tedrisatApi } from "~/lib/tedrisat-api";

/**
 * A read for a page that can say what went wrong. A 403 is its own answer:
 * the role matrix refuses MEDRESE_NAZIR and DERS_NAZIR on the medrese's
 * management routes, so it is expected and quiet. Anything else is `failed`
 * and logged; a 404 is a medrese that is not there, the portal's 404.
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
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return { status: "forbidden" };
      if (error.response.status === 404) notFound();
    }
    console.error(`Error fetching ${what}:`, error);
    return { status: "failed" };
  }
}
