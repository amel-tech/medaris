import { ConflictError, ErrorContext } from "@medaris/common";

/**
 * The user is the köşk's only manager (MDRS-126). A köşk always keeps one:
 * add the next manager first, then remove this one.
 */
export class KoskLastManagerError extends ConflictError {
  static readonly code = "KOSK_LAST_MANAGER";

  constructor(koskId: string, userId: string, context?: ErrorContext) {
    super(
      KoskLastManagerError.code,
      `User ${userId} is the last manager of köşk ${koskId} and cannot be removed`,
      context
    );
  }
}
