"use server";

import { isUnauthenticated, type Unauthenticated } from "@medaris/auth/server";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";
import type { CardType } from "./decks";
import { type ImportRowProblem, importRowProblems } from "./decks";

/**
 * Ders desteleri: each write is one call of tedrisat's course-deck or card
 * endpoints, made with the caller's token. A refusal is its code; the page
 * words it, and the server's message never reaches the browser. The API
 * decides every write (`deck.manage_course` for decks and their cards).
 */

export type DeckOutcome = ActionOutcome<{ id: string }> | Unauthenticated;

export type ImportOutcome =
  | { success: true; data: { count: number } }
  | { success: false; code: string; rows: ImportRowProblem[] }
  | Unauthenticated;

export interface DeckBody {
  title: string;
  description?: string;
  cardType: CardType;
  weekId?: string;
  draft: boolean;
}

export interface DeckPatchBody {
  title?: string;
  description?: string | null;
  weekId?: string | null;
  draft?: boolean;
}

export interface CardBody {
  type: CardType;
  contentFront: string;
  contentBack: string;
}

/** "Deste aç" (`POST /courses/:id/decks`). */
export async function createDeck(
  courseId: string,
  body: DeckBody
): Promise<DeckOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.courses.createCourseDeck({
      id: courseId,
      createCourseDeckDto: body,
    });
    return { id };
  });
  if (!result.success) console.error("Error creating a deck:", result.error);
  return outcomeOf(result);
}

/**
 * "Kaydet" on a deck's settings (`PATCH /courses/:id/decks/:deckId`): only the
 * keys sent change. The description and the week may be sent as null, which
 * clears them; the generated type calls them `object`, the API takes null.
 */
export async function updateDeck(
  courseId: string,
  deckId: string,
  body: DeckPatchBody
): Promise<DeckOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.courses.updateCourseDeck({
      id: courseId,
      deckId,
      updateCourseDeckDto: body as unknown as Parameters<
        typeof api.courses.updateCourseDeck
      >[0]["updateCourseDeckDto"],
    });
    return { id };
  });
  if (!result.success) console.error("Error changing a deck:", result.error);
  return outcomeOf(result);
}

/** "Desteyi sil" (`DELETE /courses/:id/decks/:deckId`): a draft only. */
export async function deleteDeck(
  courseId: string,
  deckId: string
): Promise<DeckOutcome> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.deleteCourseDeck({ id: courseId, deckId });
    return { id: deckId };
  });
  if (!result.success) console.error("Error deleting a deck:", result.error);
  return outcomeOf(result);
}

/** "Kart ekle" (`POST /flashcard/decks/:deckId/cards`): one card. */
export async function createCard(
  deckId: string,
  body: CardBody
): Promise<DeckOutcome> {
  const result = await authenticatedAction(async (api) => {
    const created = await api.cards.createFlashcards({
      deckId,
      createFlashcardDto: [body],
    });
    return { id: created[0]?.id ?? "" };
  });
  if (!result.success) console.error("Error adding a card:", result.error);
  return outcomeOf(result);
}

/** "Kaydet" on a card (`PATCH /flashcard/cards/:id`). */
export async function updateCard(
  cardId: string,
  body: CardBody
): Promise<DeckOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.cards.updateFlashcard({
      id: cardId,
      updateFlashcardDto: body,
    });
    return { id };
  });
  if (!result.success) console.error("Error changing a card:", result.error);
  return outcomeOf(result);
}

/** "Sil" on a card (`DELETE /flashcard/cards/:id`). */
export async function deleteCard(cardId: string): Promise<DeckOutcome> {
  const result = await authenticatedAction(async (api) => {
    await api.cards.deleteFlashcard({ id: cardId });
    return { id: cardId };
  });
  if (!result.success) console.error("Error deleting a card:", result.error);
  return outcomeOf(result);
}

/**
 * "Excel'den aktar" (`POST /flashcard/decks/:deckId/cards/bulk/import`): the
 * file is sent on to tedrisat as it is. A file with bad rows adds nothing, and
 * the rows come back worded for the dialog.
 */
export async function importCards(
  deckId: string,
  formData: FormData
): Promise<ImportOutcome> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, code: "NO_FILE", rows: [] };
  }
  const result = await authenticatedAction(async (api) => {
    const { count } = await api.cards.importsCard({ deckId, file });
    return { count };
  });
  if (result.success) return { success: true, data: result.data };
  const outcome = outcomeOf(result);
  if (isUnauthenticated(outcome)) return outcome;
  console.error("Error importing cards:", result.error);
  return {
    success: false,
    code: outcome.success ? "" : outcome.code,
    rows: isUnauthenticated(result) ? [] : importRowProblems(result.errorBody),
  };
}
