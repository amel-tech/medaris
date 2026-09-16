import {
  createServerTedrisatAPIs,
  type FlashcardDeckResponse,
  type FlashcardResponse,
} from "@medaris/services/tedrisat";
import { notFound } from "next/navigation";
import { env } from "~/env";
import { DeckCardsPage } from "~/features/flashcards/components/deck-cards-page";
import { requireAccessToken } from "~/lib/require-access-token";
import { subjectOf } from "~/lib/token-subject";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const token = await requireAccessToken();
  const API = await createServerTedrisatAPIs(token, env.TEDRISAT_API_BASE_URL);

  // The deck is fetched for one field, `authorId`: this route is reachable for
  // any public deck, and every write control on the page (add a card, edit a
  // cell, delete a row) answers 403 for anyone but the author now that
  // MDRS-63's assertions cover the card routes. Rendering an affordance that
  // can only ever fail is worse than not rendering it.
  // Both calls catch. MDRS-63 put `assertReadable` on `GET /flashcard/cards`
  // as well, so a private deck belonging to someone else now throws here too —
  // and an uncaught rejection inside `Promise.all` takes the whole page to the
  // error boundary, which would also make the sibling's `.catch` protect
  // nothing. A visitor who may not read this deck gets the not-found page,
  // which is the shape `[id]/page.tsx` already uses for the same pair.
  const [cards, deck] = await Promise.all([
    API.cards
      .getFlashcardByDeckId({ deckId: id })
      .catch((): FlashcardResponse[] | null => null),
    API.decks
      .getFlashcardDeckById({ id })
      .catch((): FlashcardDeckResponse | null => null),
  ]);

  if (!deck) {
    notFound();
  }

  const currentUserId = subjectOf(token);
  const isOwner = !!currentUserId && deck.authorId === currentUserId;

  return (
    <DeckCardsPage deckId={id} flashcards={cards || []} isOwner={isOwner} />
  );
}
