import {
  type ArchiveScopesResponse,
  createServerTedrisatAPIs,
  type PaginatedArchiveResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side first reads of the archive screens (MDRS-173). Not a
 * `"use server"` module: only server components call them. A failed read is
 * `null` so the page can show its error state instead of a crash.
 */
const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

/** A read that tedrisat refused (403) or could not find (404), apart from one that failed. */
export type ArchiveRead<T> = T | "forbidden" | "not-found" | null;

const refusal = (error: unknown): "forbidden" | "not-found" | null => {
  if (!(error instanceof ResponseError)) return null;
  if (error.response.status === 403) return "forbidden";
  if (error.response.status === 404) return "not-found";
  return null;
};

export const ARCHIVE_PAGE_SIZE = 10;
export const KOSK_ARCHIVE_PAGE_SIZE = 50;

export const getKoskArchive = async (
  koskId: string
): Promise<ArchiveRead<PaginatedArchiveResponse>> => {
  try {
    return await (await api()).archive.listKoskArchive({
      id: koskId,
      limit: KOSK_ARCHIVE_PAGE_SIZE,
    });
  } catch (error) {
    const refused = refusal(error);
    if (refused) return refused;
    console.error("Error fetching the köşk archive:", error);
    return null;
  }
};

export const getPlatformArchive = async (): Promise<
  ArchiveRead<PaginatedArchiveResponse>
> => {
  try {
    return await (await api()).archive.listArchive({
      limit: ARCHIVE_PAGE_SIZE,
    });
  } catch (error) {
    const refused = refusal(error);
    if (refused) return refused;
    console.error("Error fetching the platform archive:", error);
    return null;
  }
};

export const getArchiveScopes =
  async (): Promise<ArchiveScopesResponse | null> => {
    try {
      return await (await api()).archive.getArchiveScopes();
    } catch (error) {
      console.error("Error fetching the archive scopes:", error);
      return null;
    }
  };
