import { ConflictError, ErrorContext } from "@medaris/common";

/** A published course deck cannot be deleted: its draft must be set first. */
export class CourseDeckNotDraftError extends ConflictError {
  static readonly code = "COURSE_DECK_NOT_DRAFT";

  constructor(deckId: string, context?: ErrorContext) {
    super(
      CourseDeckNotDraftError.code,
      `Deck ${deckId} is published; set draft to true before deleting it`,
      context
    );
  }
}
