import { ErrorContext, NotFoundError } from "@medaris/common";

export class FlashcardLabelNotFoundError extends NotFoundError {
  static readonly code = "FLASHCARD_LABEL_NOT_FOUND";

  constructor(labelId: string, context?: ErrorContext) {
    super(
      FlashcardLabelNotFoundError.code,
      `Flashcard label with id ${labelId} not found`,
      context
    );
  }
}
