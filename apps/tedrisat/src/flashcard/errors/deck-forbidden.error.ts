import { ErrorContext, ForbiddenError } from "@medaris/common";

export class DeckForbiddenError extends ForbiddenError {
  static readonly code = "DECK_FORBIDDEN";

  constructor(
    message = "You are not the owner of this deck",
    context?: ErrorContext
  ) {
    super(DeckForbiddenError.code, message, context);
  }
}
