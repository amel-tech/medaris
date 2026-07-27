import { DeckCardsTable } from '~/features/flashcards/components/deck-cards-table'
import type { FlashcardResponse } from '@medaris/services/tedrisat'

export function DeckCardsPage({
  deckId,
  flashcards,
}: {
  deckId: string
  flashcards: FlashcardResponse[]
}) {
  return <DeckCardsTable deckId={deckId} flashcards={flashcards} />
}
