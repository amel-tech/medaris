import {
  type KoskGrantsResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * Server-side first read of the köşk's İzinler page (nizam 38, MDRS-172). Not
 * a `"use server"` module: only the page calls it. A failed read is `null` so
 * the page can show its error state; 403 and 404 are told apart so the page
 * shows "Bu bölüm için izniniz yok" (nizam/06) for both.
 */
export type GrantsRead = KoskGrantsResponse | "forbidden" | "not-found" | null;

export const getKoskGrants = async (koskId: string): Promise<GrantsRead> => {
  try {
    const api = await tedrisatApi();
    return await api.kosks.getKoskGrants({ id: koskId });
  } catch (error) {
    await passOnSignIn(error);
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error("Error fetching the köşk's ders nazırları:", error);
    return null;
  }
};
