import {
  type MadrasahDirectoryResponse,
  type MadrasahStatusFilter,
  ResponseError,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * Server-side first read of Medreseler (MDRS-170). Not a `"use server"`
 * module: only the page calls it. A failed read is `null` so the page can show
 * its error state instead of a crash; a 403 is told apart so the page shows
 * "Bu bölüm için izniniz yok" (nizam/06).
 */
export const DIRECTORY_PAGE_SIZE = 50;

export type DirectoryRead = MadrasahDirectoryResponse | "forbidden" | null;

export const getMadrasahDirectory = async (query: {
  status: MadrasahStatusFilter;
  q?: string;
}): Promise<DirectoryRead> => {
  try {
    const { madrasahs } = await tedrisatApi();
    return await madrasahs.getMadrasahDirectory({
      status: query.status,
      q: query.q || undefined,
      limit: DIRECTORY_PAGE_SIZE,
    });
  } catch (error) {
    await passOnSignIn(error);
    if (error instanceof ResponseError && error.response.status === 403) {
      return "forbidden";
    }
    console.error("Error fetching the medrese directory:", error);
    return null;
  }
};
