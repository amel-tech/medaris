import {
  createServerTedrisatAPIs,
  type DeckPublishRequestListResponse,
  type KoskResponse,
  type ManagedKoskDecksResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side first reads of the deck screens (MDRS-180). Not a `"use server"`
 * module: only server components call them. A failed read is `null` so the
 * page can show its error state instead of a crash; a refusal is told apart
 * so the page can show the "Bu bölüm için izniniz yok" screen.
 */
const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

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
    return await (await api()).nizam.listDeckPublishRequests({
      status: "PENDING",
    });
  } catch (error) {
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
    return await (await api()).kosks.getManagedKoskDecks({ id: koskId });
  } catch (error) {
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
    return await (await api()).kosks.getKoskById({ id: koskId });
  } catch (error) {
    const refused = refusal(error);
    if (refused) return refused;
    console.error("Error fetching the köşk:", error);
    return null;
  }
};
