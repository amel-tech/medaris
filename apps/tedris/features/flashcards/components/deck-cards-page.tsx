import type { FlashcardResponse } from "@medaris/services/tedrisat";
import { DeckCardsTable } from "~/features/flashcards/components/deck-cards-table";

export function DeckCardsPage({
  deckId,
  flashcards,
  isOwner,
}: {
  deckId: string;
  flashcards: FlashcardResponse[];
  isOwner: boolean;
}) {
  return (
    <DeckCardsTable deckId={deckId} flashcards={flashcards} isOwner={isOwner} />
  );
}
