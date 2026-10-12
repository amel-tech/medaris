import {
  type AllBansListResponse,
  type BanListResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * Server-side first read of the ban list (nizam 42, MDRS-177). Not a
 * `"use server"` module: only the server component calls it. A failed read
 * is `null` so the page can show its error state instead of a crash.
 */
export type AllBansRead = AllBansListResponse | "forbidden" | null;

/** First page of the Medaris-wide ban list (nizam 48): open bans, newest first. */
export const getAllBans = async (): Promise<AllBansRead> => {
  try {
    const api = await tedrisatApi();
    return await api.bans.listAllBans({ status: "ACTIVE", limit: 20 });
  } catch (error) {
    await passOnSignIn(error);
    if (error instanceof ResponseError && error.response.status === 403) {
      return "forbidden";
    }
    console.error("Error fetching all bans:", error);
    return null;
  }
};

export type BansRead = BanListResponse | "forbidden" | "not-found" | null;

export const getKoskBans = async (koskId: string): Promise<BansRead> => {
  try {
    const api = await tedrisatApi();
    return await api.bans.listKoskBans({ koskId, status: "ACTIVE" });
  } catch (error) {
    await passOnSignIn(error);
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error("Error fetching the köşk bans:", error);
    return null;
  }
};
