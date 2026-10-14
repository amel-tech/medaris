import {
  type PartnerAdminListResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * The first read of "Ortak uygulamalar". Not a `"use server"` module: only
 * the page calls it. A failed read is `null`, for the page's error state; a
 * 403 is told apart, for "Bu bölüm için izniniz yok" (nizam/06).
 */
export const getPartners = async (): Promise<
  PartnerAdminListResponse | "forbidden" | null
> => {
  try {
    return await (await tedrisatApi()).nizam.listPartnerApplications();
  } catch (error) {
    await passOnSignIn(error);
    if (error instanceof ResponseError && error.response.status === 403) {
      return "forbidden";
    }
    console.error("Error fetching the partner applications:", error);
    return null;
  }
};
