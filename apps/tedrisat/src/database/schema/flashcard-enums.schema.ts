import { pgEnum } from "drizzle-orm/pg-core";
import { FlashcardProgressStatus } from "../../flashcard/domain/flashcard-progress-status.enum";
import { FlashcardType } from "../../flashcard/domain/flashcard-type.enum";

// Their own file (MDRS-164): `decks` now carries a `flashcard_type` column and
// `flashcards` already references `decks`, so declaring the enums in either
// table's file would make the two import each other at module evaluation.
export const flashcardType = pgEnum("flashcard_type", FlashcardType);
export const flashcardProgressStatus = pgEnum(
  "flashcard_user_status",
  FlashcardProgressStatus
);
