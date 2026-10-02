import {
  createServerTedrisatAPIs,
  type InactiveScopeResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side first read of Pasif kapsamlar (nizam 14, MDRS-172). Not a
 * `"use server"` module: only the page calls it. A failed read is `null` so
 * the page can show its error state; a 403 is told apart so the page shows
 * "Bu bölüm için izniniz yok" (nizam/06).
 */
export type InactiveRead = InactiveScopeResponse[] | "forbidden" | null;

export const getInactiveScopes = async (): Promise<InactiveRead> => {
  try {
    const api = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
    return await api.nizam.getInactiveScopes({});
  } catch (error) {
    if (error instanceof ResponseError && error.response.status === 403) {
      return "forbidden";
    }
    console.error("Error fetching the passive scopes:", error);
    return null;
  }
};
