import type { FlashcardResponse } from "@medaris/services/tedrisat";
import FlashCardList from "~/features/flashcards/components/flashcard-list";

export function StudyPage({ cards }: { cards: FlashcardResponse[] }) {
  return (
    <div className="h-full">
      <FlashCardList cards={cards} />
    </div>
  );
}
