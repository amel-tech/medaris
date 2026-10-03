import { ConflictError, ErrorContext } from "@medaris/common";
import { DeckPublishStatus } from "../domain/deck-publish-status.enum";

/**
 * The deck is in the wrong publishing state for the action (MDRS-164):
 * asking again while a request waits or after the deck went public, or
 * withdrawing a request that was never made.
 */
export class DeckPublishStateError extends ConflictError {
  static readonly code = "DECK_PUBLISH_STATE_CONFLICT";

  constructor(
    deckId: string,
    status: DeckPublishStatus,
    context?: ErrorContext
  ) {
    super(
      DeckPublishStateError.code,
      `Deck ${deckId} is ${status}; this action does not apply to it`,
      { deckId, status, ...context }
    );
  }
}
