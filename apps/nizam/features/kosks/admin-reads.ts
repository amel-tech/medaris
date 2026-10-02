import {
  createServerTedrisatAPIs,
  type KoskDirectoryResponse,
  type KoskNazimResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";
import { type DirectoryFilters, directoryQuery } from "./admin-present";

/**
 * Server-side first reads of Köşkler and Köşk nazımları (MDRS-174). Not a
 * `"use server"` module: only the pages call them. A failed read is `null` so
 * the page can show its error state; a 403 and a 404 are told apart so the
 * page shows "Bu bölüm için izniniz yok" (nizam/06) instead.
 */
const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

export type AdminRead<T> = T | "forbidden" | "not-found" | null;

export const getKoskDirectory = async (
  filters: DirectoryFilters
): Promise<AdminRead<KoskDirectoryResponse>> => {
  try {
    return await (await api()).kosks.getKoskDirectory(directoryQuery(filters));
  } catch (error) {
    if (error instanceof ResponseError && error.response.status === 403) {
      return "forbidden";
    }
    console.error("Error fetching the köşk directory:", error);
    return null;
  }
};

export const getKoskNazims = async (
  koskId: string
): Promise<AdminRead<KoskNazimResponse[]>> => {
  try {
    return await (await api()).kosks.getKoskNazims({ id: koskId });
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error("Error fetching the köşk nazımları:", error);
    return null;
  }
};
