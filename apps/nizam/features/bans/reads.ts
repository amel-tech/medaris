import {
  type BanListResponse,
  createServerTedrisatAPIs,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side first read of the ban list (nizam 42, MDRS-177). Not a
 * `"use server"` module: only the server component calls it. A failed read
 * is `null` so the page can show its error state instead of a crash.
 */
export type BansRead = BanListResponse | "forbidden" | "not-found" | null;

export const getKoskBans = async (koskId: string): Promise<BansRead> => {
  try {
    const api = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
    return await api.bans.listKoskBans({ koskId, status: "ACTIVE" });
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error("Error fetching the köşk bans:", error);
    return null;
  }
};
