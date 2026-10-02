"use server";

import {
  CreateFlashcardDtoTypeEnum,
  type CreateFlashcardProgressDto,
  type FlashcardDeckResponse,
  type FlashcardType,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import { authenticatedAction } from "~/lib/authenticated-action";

/**
 * The deck screens' writes (design tedris/25-33, MDRS-164). Each one is an HTTP
 * endpoint like any other: the page hides what the caller may not do, and
 * tedrisat is what refuses it.
 */

/** Every list and page that shows a deck. The routes are locale-prefixed, so the pattern, not a URL. */
const revalidateDecks = () => {
  revalidatePath("/[locale]/decks", "page");
  revalidatePath("/[locale]/decks/explore", "page");
  revalidatePath("/[locale]/decks/[id]", "page");
  revalidatePath("/[locale]/decks/[id]/cards", "page");
};

export interface NewDeck {
  title: string;
  description?: string;
  cardType: FlashcardType;
  tags?: string[];
}

/** A deck is born private; the form sends no visibility. */
export const createDeck = async (deck: NewDeck) =>
  authenticatedAction(async ({ decks }) => {
    const created = await decks.createFlashcardDeck({
      createFlashcardDeckDto: {
        title: deck.title.trim(),
        description: deck.description?.trim() || undefined,
        cardType: deck.cardType,
        tags: deck.tags,
      },
    });
    revalidateDecks();
    return created;
  });

export const updateDeck = async (
  deckId: string,
  changes: { title: string; description: string }
) =>
  authenticatedAction(async ({ decks }) => {
    const updated = await decks.updateFlashcardDeck({
      id: deckId,
      updateFlashcardDeckDto: {
        title: changes.title.trim(),
        // An emptied box clears the description rather than keeping the old one.
        description: changes.description.trim(),
      },
    });
    revalidateDecks();
    return updated;
  });

export const deleteDeck = async (deckId: string) =>
  authenticatedAction(async ({ decks }) => {
    await decks.deleteFlashcardDeck({ id: deckId });
    revalidateDecks();
    return true;
  });

export const requestDeckPublication = async (
  deckId: string
): ReturnType<typeof publicationAction> => publicationAction(deckId, "request");

export const withdrawDeckPublication = async (
  deckId: string
): ReturnType<typeof publicationAction> =>
  publicationAction(deckId, "withdraw");

const publicationAction = (deckId: string, kind: "request" | "withdraw") =>
  authenticatedAction(async ({ decks }): Promise<FlashcardDeckResponse> => {
    const deck =
      kind === "request"
        ? await decks.requestFlashcardDeckPublication({ id: deckId })
        : await decks.withdrawFlashcardDeckPublication({ id: deckId });
    revalidateDecks();
    return deck;
  });

export const addDeckToCollection = async (deckId: string) =>
  authenticatedAction(async ({ decks }) => {
    await decks.createFlashcardDeckUser({ id: deckId });
    revalidateDecks();
    return true;
  });

export const removeDeckFromCollection = async (deckId: string) =>
  authenticatedAction(async ({ decks }) => {
    await decks.deleteFlashcardDeckUser({ id: deckId });
    revalidateDecks();
    return true;
  });

export interface CardFields {
  contentFront: string;
  contentBack: string;
}

export const createCard = async (
  deckId: string,
  kind: FlashcardType,
  card: CardFields
) =>
  authenticatedAction(async ({ cards }) => {
    const [created] = await cards.createFlashcards({
      deckId,
      createFlashcardDto: [
        {
          type:
            kind === "HADEETH"
              ? CreateFlashcardDtoTypeEnum.Hadeeth
              : CreateFlashcardDtoTypeEnum.Vocabulary,
          contentFront: card.contentFront.trim(),
          contentBack: card.contentBack.trim(),
        },
      ],
    });
    revalidateDecks();
    return created;
  });

/** A card of somebody else's deck, copied as it is into one of the caller's own decks. */
export const copyCard = async (
  targetDeckId: string,
  card: {
    type: CreateFlashcardDtoTypeEnum;
    contentFront: string;
    contentBack: string;
    contentMeta?: object;
  }
) =>
  authenticatedAction(async ({ cards }) => {
    const [created] = await cards.createFlashcards({
      deckId: targetDeckId,
      createFlashcardDto: [card],
    });
    revalidateDecks();
    return created;
  });

export const updateCard = async (cardId: string, card: CardFields) =>
  authenticatedAction(async ({ cards }) => {
    const updated = await cards.updateFlashcard({
      id: cardId,
      updateFlashcardDto: {
        contentFront: card.contentFront.trim(),
        contentBack: card.contentBack.trim(),
      },
    });
    revalidateDecks();
    return updated;
  });

export const deleteCard = async (cardId: string) =>
  authenticatedAction(async ({ cards }) => {
    await cards.deleteFlashcardRaw({ id: cardId });
    revalidateDecks();
    return true;
  });

export const updateFlashcardProgress = async (
  progressUpdates: CreateFlashcardProgressDto[]
) =>
  authenticatedAction(async ({ cards }) => {
    return cards.replaceManyFlashcardProgress({
      createFlashcardProgressDto: progressUpdates,
    });
  });
