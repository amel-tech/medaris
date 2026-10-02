import {
  createServerTedrisatAPIs,
  type HostingRightResponse,
  type MadrasahResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side first reads of Barındırma hakları (MDRS-170). Not a
 * `"use server"` module: only the page calls them. A failed read is `null` so
 * the page can show its error state; a 403 and a 404 are told apart so the
 * page shows "Bu bölüm için izniniz yok" (nizam/03, 06) instead.
 */
const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

export type HostingRead<T> = T | "forbidden" | "not-found" | null;

export const getHostingRights = async (
  koskId: string
): Promise<HostingRead<HostingRightResponse[]>> => {
  try {
    return await (await api()).kosks.getKoskHostingRights({ id: koskId });
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error("Error fetching the hosting rights:", error);
    return null;
  }
};

/** The medreses "Barındırma hakkı ver" can pick from: the open list, hidden ones left out by the API. */
export const MADRASAH_OPTIONS_LIMIT = 50;

export const getMadrasahOptions = async (): Promise<
  MadrasahResponse[] | null
> => {
  try {
    const page = await (await api()).madrasahs.getAllMadrasahs({
      limit: MADRASAH_OPTIONS_LIMIT,
    });
    return page.items;
  } catch (error) {
    console.error("Error fetching the medreses:", error);
    return null;
  }
};
