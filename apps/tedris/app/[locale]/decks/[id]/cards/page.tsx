import {
  createServerTedrisatAPIs,
  type FlashcardDeckResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { DeckCardsPage } from "~/features/flashcards/components/deck-cards-page";
import { getAccessToken } from "~/lib/auth_options";
import { subjectOf } from "~/lib/token-subject";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const token = await getAccessToken();
  const API = await createServerTedrisatAPIs(token, env.TEDRISAT_API_BASE_URL);

  // The deck is fetched for one field, `authorId`: this route is reachable for
  // any public deck, and every write control on the page (add a card, edit a
  // cell, delete a row) answers 403 for anyone but the author now that
  // MDRS-63's assertions cover the card routes. Rendering an affordance that
  // can only ever fail is worse than not rendering it.
  const [cards, deck] = await Promise.all([
    API.cards.getFlashcardByDeckId({ deckId: id }),
    API.decks
      .getFlashcardDeckById({ id })
      .catch((): FlashcardDeckResponse | null => null),
  ]);

  const currentUserId = subjectOf(token);
  const isOwner = !!currentUserId && deck?.authorId === currentUserId;

  return (
    <DeckCardsPage deckId={id} flashcards={cards || []} isOwner={isOwner} />
  );
}
