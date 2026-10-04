import { BadRequestError, ErrorContext } from "@medaris/common";

/**
 * The successor named for a köşk nazımı's removal is that same nazım
 * (MDRS-136): removing them and seating them would leave nothing to do, and
 * the köşk would still lose its last nazım.
 */
export class KoskSuccessorInvalidError extends BadRequestError {
  static readonly code = "KOSK_SUCCESSOR_INVALID";

  constructor(userId: string, context?: ErrorContext) {
    super(
      KoskSuccessorInvalidError.code,
      `User ${userId} cannot be their own successor`,
      context
    );
  }
}
