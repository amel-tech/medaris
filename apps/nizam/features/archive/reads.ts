import {
  type ArchiveScopesResponse,
  type PaginatedArchiveResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * Server-side first reads of the archive screens (MDRS-173). Not a
 * `"use server"` module: only server components call them. A failed read is
 * `null` so the page can show its error state instead of a crash.
 */
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
    return await (await tedrisatApi()).archive.listKoskArchive({
      id: koskId,
      limit: KOSK_ARCHIVE_PAGE_SIZE,
    });
  } catch (error) {
    await passOnSignIn(error);
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
    return await (await tedrisatApi()).archive.listArchive({
      limit: ARCHIVE_PAGE_SIZE,
    });
  } catch (error) {
    await passOnSignIn(error);
    const refused = refusal(error);
    if (refused) return refused;
    console.error("Error fetching the platform archive:", error);
    return null;
  }
};

export const getArchiveScopes =
  async (): Promise<ArchiveScopesResponse | null> => {
    try {
      return await (await tedrisatApi()).archive.getArchiveScopes();
    } catch (error) {
      await passOnSignIn(error);
      console.error("Error fetching the archive scopes:", error);
      return null;
    }
  };
