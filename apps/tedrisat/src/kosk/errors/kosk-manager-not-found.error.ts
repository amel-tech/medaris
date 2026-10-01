import { ErrorContext, NotFoundError } from "@medaris/common";

/** The user being removed is not a manager of this köşk (MDRS-126). */
export class KoskManagerNotFoundError extends NotFoundError {
  static readonly code = "KOSK_MANAGER_NOT_FOUND";

  constructor(koskId: string, userId: string, context?: ErrorContext) {
    super(
      KoskManagerNotFoundError.code,
      `User ${userId} is not a manager of köşk ${koskId}`,
      context
    );
  }
}
