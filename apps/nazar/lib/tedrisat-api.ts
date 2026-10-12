import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { env } from "~/env";
import { requireAccessToken } from "~/lib/auth";

/**
 * The tedrisat client for the signed-in caller; server components and layouts
 * only.
 *
 * No token means the session is over. A call without one is a 401 every time,
 * and a page that drew it as "could not be read" offered a retry that never
 * cleared ("Görevleriniz okunamadı" on `/`, #270, A16). So the answer is the
 * sign-in page, and the round trip there renews the session or asks for the
 * password. It keeps the page the person was on: `requireAccessToken` sends
 * `callbackUrl`, which the proxy hands the render (#270 lost it, D4).
 * `requireAccessToken` and `auth()` read the one cookie the same way, so a
 * person the layout drew as signed in has a token here. Callers that catch
 * everything pass the redirect on (`unstable_rethrow`).
 */
export const tedrisatApi = async () =>
  createServerTedrisatAPIs(
    await requireAccessToken(),
    env.TEDRISAT_API_BASE_URL
  );
