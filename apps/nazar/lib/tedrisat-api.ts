import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { redirect } from "next/navigation";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";
import { authPages } from "~/lib/auth_pages";

/**
 * The tedrisat client for the signed-in caller; server components and layouts
 * only.
 *
 * No token means the session is over for the server: its refresh failed, or
 * Keycloak said it ended, though the cookie still reads as signed in to the
 * middleware and to `auth()`. A call without one is a 401 every time, and a
 * page that drew it as "could not be read" offered a retry that never cleared
 * ("Görevleriniz okunamadı" on `/`); `KeycloakSessionWatch` reloads only a page
 * whose session ends while it is open. So the sign-in page is the answer, and
 * the round trip there renews the session or asks for the password. Callers
 * that catch everything pass this redirect on (`unstable_rethrow`).
 */
export const tedrisatApi = async () => {
  const token = await getAccessToken();
  if (!token) redirect(authPages.signIn);
  return createServerTedrisatAPIs(token, env.TEDRISAT_API_BASE_URL);
};
