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

/** The API clamps `limit` to this; the options are read a page at a time. */
export const MADRASAH_OPTIONS_PAGE_SIZE = 50;

/**
 * The medreses "Barındırma hakkı ver" can pick from: the whole open list,
 * hidden ones left out by the API. Every page is read, so the köşks that
 * already hold the right cannot push a medrese out of the picker or turn it
 * into the "none left" sentence. Null if any page fails.
 */
export const getMadrasahOptions = async (): Promise<
  MadrasahResponse[] | null
> => {
  try {
    const { madrasahs } = await api();
    const options: MadrasahResponse[] = [];
    for (let page = 1; ; page += 1) {
      const read = await madrasahs.getAllMadrasahs({
        page,
        limit: MADRASAH_OPTIONS_PAGE_SIZE,
      });
      options.push(...read.items);
      // An empty page ends it too, so a total that never fills cannot loop.
      if (read.items.length === 0 || options.length >= read.total) {
        return options;
      }
    }
  } catch (error) {
    console.error("Error fetching the medreses:", error);
    return null;
  }
};
