import {
  ConflictError,
  ErrorContext,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";

/** The caller may not review publish requests or run this köşk's decks (MDRS-180). */
export class DeckReviewForbiddenError extends ForbiddenError {
  static readonly code = "DECK_REVIEW_FORBIDDEN";

  constructor(
    message = "You may not review decks here",
    context?: ErrorContext
  ) {
    super(DeckReviewForbiddenError.code, message, context);
  }
}

/** No deck has (or had) a publish request under that id. */
export class DeckRequestNotFoundError extends NotFoundError {
  static readonly code = "DECK_REQUEST_NOT_FOUND";

  constructor(deckId: string, context?: ErrorContext) {
    super(
      DeckRequestNotFoundError.code,
      `No publish request for deck ${deckId}`,
      context
    );
  }
}

/** The request was answered, or withdrawn, while the page was open. */
export class DeckRequestNotPendingError extends ConflictError {
  static readonly code = "DECK_REQUEST_NOT_PENDING";

  constructor(deckId: string, context?: ErrorContext) {
    super(
      DeckRequestNotPendingError.code,
      `The publish request for deck ${deckId} is no longer waiting`,
      context
    );
  }
}

export class DeckProposalNotFoundError extends NotFoundError {
  static readonly code = "DECK_PROPOSAL_NOT_FOUND";

  constructor(proposalId: string, context?: ErrorContext) {
    super(
      DeckProposalNotFoundError.code,
      `Deck proposal ${proposalId} not found in this köşk`,
      context
    );
  }
}

/** The proposal was answered while the page was open. */
export class DeckProposalNotPendingError extends ConflictError {
  static readonly code = "DECK_PROPOSAL_NOT_PENDING";

  constructor(proposalId: string, context?: ErrorContext) {
    super(
      DeckProposalNotPendingError.code,
      `Deck proposal ${proposalId} has been answered already`,
      context
    );
  }
}

/** The deck is not a shown köşk deck: missing, already hidden, or nobody's köşk. */
export class KoskDeckNotFoundError extends NotFoundError {
  static readonly code = "KOSK_DECK_NOT_FOUND";

  constructor(deckId: string, context?: ErrorContext) {
    super(KoskDeckNotFoundError.code, `No köşk deck ${deckId}`, context);
  }
}
