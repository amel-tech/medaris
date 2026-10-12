import {
  type DeckPublishRequestListResponse,
  type KoskResponse,
  type ManagedKoskDecksResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";
import { DECK_PAGE_SIZE } from "./present";

/**
 * Server-side first reads of the deck screens (MDRS-180). Not a `"use server"`
 * module: only server components call them. A failed read is `null` so the
 * page can show its error state instead of a crash; a refusal is told apart
 * so the page can show the "Bu bölüm için izniniz yok" screen.
 */
export type DeckRead<T> = T | "forbidden" | "not-found" | null;

const refusal = (error: unknown): "forbidden" | "not-found" | null => {
  if (!(error instanceof ResponseError)) return null;
  if (error.response.status === 403) return "forbidden";
  if (error.response.status === 404) return "not-found";
  return null;
};

export const getPendingDeckRequests = async (): Promise<
  DeckRead<DeckPublishRequestListResponse>
> => {
  try {
    return await (await tedrisatApi()).nizam.listDeckPublishRequests({
      status: "PENDING",
      page: 1,
      limit: DECK_PAGE_SIZE,
    });
  } catch (error) {
    await passOnSignIn(error);
    const refused = refusal(error);
    if (refused) return refused;
    console.error("Error fetching the deck publish requests:", error);
    return null;
  }
};

export const getManagedKoskDecks = async (
  koskId: string
): Promise<DeckRead<ManagedKoskDecksResponse>> => {
  try {
    return await (await tedrisatApi()).kosks.getManagedKoskDecks({
      id: koskId,
      page: 1,
      limit: DECK_PAGE_SIZE,
    });
  } catch (error) {
    await passOnSignIn(error);
    const refused = refusal(error);
    if (refused) return refused;
    console.error("Error fetching the köşk decks:", error);
    return null;
  }
};

/**
 * The köşk a deck screen is about. Told apart like the deck reads: a refusal
 * and a missing köşk are answers, a failed read is `null` and the page shows
 * its error state instead of the not-found screen.
 */
export const getKoskForDecks = async (
  koskId: string
): Promise<DeckRead<KoskResponse>> => {
  try {
    return await (await tedrisatApi()).kosks.getKoskById({ id: koskId });
  } catch (error) {
    await passOnSignIn(error);
    const refused = refusal(error);
    if (refused) return refused;
    console.error("Error fetching the köşk:", error);
    return null;
  }
};
