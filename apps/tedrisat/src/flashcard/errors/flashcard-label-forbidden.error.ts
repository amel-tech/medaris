import { ErrorContext, ForbiddenError } from "@medaris/common";

export class FlashcardLabelForbiddenError extends ForbiddenError {
  static readonly code = "FLASHCARD_LABEL_FORBIDDEN";

  constructor(
    message = "You are not the owner of this flashcard label",
    context?: ErrorContext
  ) {
    super(FlashcardLabelForbiddenError.code, message, context);
  }
}
