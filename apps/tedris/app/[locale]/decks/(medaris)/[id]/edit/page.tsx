import { ForbiddenState } from "~/features/errors/system-page";
import { DeckDetailPage } from "~/features/flashcards/components/deck-detail-page";
import { DeckUnavailable } from "~/features/flashcards/components/deck-unavailable";
import { loadDeckPage } from "~/features/flashcards/deck-page-data";

export const dynamic = "force-dynamic";

/**
 * Editing a deck (design tedris/33, 39): the author sees the deck's page with
 * the edit dialog open over it, so the address says what is on screen; anyone
 * else who can read the deck gets the "you cannot view this page" state, naming
 * the deck and the rule. A deck the caller may not read at all is
 * `DeckUnavailable`, the same copy as a missing one, so a private deck's
 * existence is not leaked (MDRS-43, AC-4).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const data = await loadDeckPage(locale, id, `/decks/${id}/edit`);
  if (data.kind === "unavailable") return <DeckUnavailable />;
  if (!data.isOwner) {
    return <ForbiddenState deck={{ id, name: data.deck.title }} />;
  }
  return (
    <DeckDetailPage
      deck={data.deck}
      cards={data.cards}
      isOwner
      inCollection={false}
      ownDecks={[]}
      editing
    />
  );
}
