import {
  createServerTedrisatAPIs,
  type FlashcardDeckExploreResponse,
  type FlashcardDeckResponse,
  type FlashcardDeckSummaryResponse,
  type FlashcardResponse,
  type FlashcardStudyRoundResponse,
  type FlashcardType,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads for the deck screens (MDRS-164). Not a `"use server"`
 * module on purpose: only server components call these, and a browser must not
 * be able to post to them. A read that fails answers `null`, so a page can say
 * so and offer a retry rather than fall to the framework's error page.
 */

const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

export const getDeckSummaries = async (): Promise<
  FlashcardDeckSummaryResponse[] | null
> => {
  try {
    return await (await api()).decks.getFlashcardDeckSummaries();
  } catch (error) {
    console.error("Error fetching the caller's decks:", error);
    return null;
  }
};

export const getDeckExplore = async (
  cardType?: FlashcardType
): Promise<FlashcardDeckExploreResponse | null> => {
  try {
    return await (await api()).decks.exploreFlashcardDecks({ cardType });
  } catch (error) {
    console.error("Error fetching the deck explorer:", error);
    return null;
  }
};

export type DeckRead =
  | { status: "ok"; deck: FlashcardDeckResponse; cards: FlashcardResponse[] }
  | { status: "missing" }
  | { status: "forbidden" };

/**
 * One deck with its cards and the caller's progress through them. The API
 * answers a missing deck and another user's private one the same way (404);
 * a 403 is kept apart anyway, because a page that cannot tell them still has
 * to be told what the API said. Anything else is the server's fault and is
 * thrown to the route's error page.
 */
export const readDeck = async (id: string): Promise<DeckRead> => {
  const { decks, cards } = await api();
  try {
    const [deck, rows] = await Promise.all([
      decks.getFlashcardDeckById({ id }),
      cards.getFlashcardByDeckId({ deckId: id, include: ["progress"] }),
    ]);
    return { status: "ok", deck, cards: rows };
  } catch (error) {
    if (error instanceof ResponseError) {
      // A 400 is an id that is no UUID: no such deck, as far as the page goes.
      if (error.response.status === 404 || error.response.status === 400) {
        return { status: "missing" };
      }
      if (error.response.status === 403) return { status: "forbidden" };
    }
    throw error;
  }
};

/** The caller's own decks, for the card-copy picker; empty when they cannot be read. */
export const getOwnDecks = async (): Promise<FlashcardDeckSummaryResponse[]> =>
  (await getDeckSummaries())?.filter((d) => d.isMine) ?? [];

export type StudyRead =
  | {
      status: "ok";
      deck: FlashcardDeckResponse;
      round: FlashcardStudyRoundResponse;
    }
  | { status: "missing" }
  | { status: "forbidden" };

/**
 * One deck with today's study round for the caller (MDRS-165): the cards that
 * wait for a repeat, then a few they have not started. Missing and forbidden
 * as `readDeck` reads them.
 */
export const readStudyRound = async (id: string): Promise<StudyRead> => {
  const { decks, cards } = await api();
  try {
    const [deck, round] = await Promise.all([
      decks.getFlashcardDeckById({ id }),
      cards.getFlashcardStudyRound({ id }),
    ]);
    return { status: "ok", deck, round };
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 404 || error.response.status === 400) {
        return { status: "missing" };
      }
      if (error.response.status === 403) return { status: "forbidden" };
    }
    throw error;
  }
};
