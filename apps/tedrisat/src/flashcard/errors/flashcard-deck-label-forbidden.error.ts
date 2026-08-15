import { ErrorContext, ForbiddenError } from "@medaris/common";

export class FlashcardDeckLabelForbiddenError extends ForbiddenError {
  static readonly code = "FLASHCARD_DECK_LABEL_FORBIDDEN";

  constructor(
    message = "You are not the owner of this deck label",
    context?: ErrorContext
  ) {
    super(FlashcardDeckLabelForbiddenError.code, message, context);
  }
}
