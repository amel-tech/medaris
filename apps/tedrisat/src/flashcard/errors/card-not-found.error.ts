import { ErrorContext, NotFoundError } from "@medaris/common";

export class CardNotFoundError extends NotFoundError {
  static readonly code = "CARD_NOT_FOUND";

  constructor(cardId: string, context?: ErrorContext) {
    super(CardNotFoundError.code, `Card with id ${cardId} not found`, context);
  }
}
