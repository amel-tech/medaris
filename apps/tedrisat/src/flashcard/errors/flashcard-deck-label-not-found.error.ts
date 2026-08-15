import { ErrorContext, NotFoundError } from "@medaris/common";

export class FlashcardDeckLabelNotFoundError extends NotFoundError {
  static readonly code = "FLASHCARD_DECK_LABEL_NOT_FOUND";

  constructor(labelId: string, context?: ErrorContext) {
    super(
      FlashcardDeckLabelNotFoundError.code,
      `Deck label with id ${labelId} not found`,
      context
    );
  }
}
