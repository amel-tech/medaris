import {
  createServerTedrisatAPIs,
  type FlashcardDeckResponse,
  type FlashcardResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { DeckDetailPage } from "~/features/flashcards/components/deck-detail-page";
import { DeckUnavailable } from "~/features/flashcards/components/deck-unavailable";
import { getAccessToken } from "~/lib/auth_options";
import { requireAccessToken } from "~/lib/require-access-token";
import { subjectOf } from "~/lib/token-subject";

/**
 * `null` when the API refused (403) or could not find (404) the deck — both
 * expected outcomes of MDRS-43's authz, so neither is logged as an error.
 */
async function getDeck(deckId: string): Promise<FlashcardDeckResponse | null> {
  try {
    const token = await getAccessToken();
    const { decks } = await createServerTedrisatAPIs(
      token,
      env.TEDRISAT_API_BASE_URL
    );
    const deck = await decks.getFlashcardDeckById({ id: deckId });
    return deck || null;
  } catch (error) {
    if (
      error instanceof ResponseError &&
      (error.response.status === 403 || error.response.status === 404)
    ) {
      return null;
    }
    console.error("Error fetching deck:", error);
    return null;
  }
}

async function getDeckCards(deckId: string): Promise<FlashcardResponse[]> {
  try {
    const token = await getAccessToken();
    const API = await createServerTedrisatAPIs(
      token,
      env.TEDRISAT_API_BASE_URL
    );
    const cards = await API.cards.getFlashcardByDeckId({
      deckId,
      include: ["progress"],
    });

    return cards || [];
  } catch (error) {
    console.error("Error fetching deck cards:", error);
    return [];
  }
}

async function isDeckInCollection(deckId: string): Promise<boolean> {
  try {
    const token = await getAccessToken();
    if (!token) return false;
    const API = await createServerTedrisatAPIs(
      token,
      env.TEDRISAT_API_BASE_URL
    );
    const userDecks = await API.decks.getAllFlashcardDecksByUser();
    return userDecks.some((deck) => deck.id === deckId);
  } catch (error) {
    console.error("Error checking if deck is in collection:", error);
    return false;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const accessToken = await requireAccessToken();
  const deck = await getDeck(id);

  if (!deck) {
    return <DeckUnavailable />;
  }

  const [cards, isInCollection] = await Promise.all([
    getDeckCards(id),
    isDeckInCollection(id),
  ]);

  const currentUserId = subjectOf(accessToken);

  return (
    <DeckDetailPage
      deck={deck}
      cards={cards}
      isInCollection={isInCollection}
      isOwner={!!currentUserId && deck.authorId === currentUserId}
    />
  );
}
