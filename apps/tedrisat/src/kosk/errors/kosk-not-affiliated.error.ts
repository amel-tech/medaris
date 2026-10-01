import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * The köşk is not affiliated with the medrese it is being detached from — or,
 * with no `madrasahId`, with any medrese.
 */
export class KoskNotAffiliatedError extends NotFoundError {
  static readonly code = "KOSK_NOT_AFFILIATED";

  constructor(koskId: string, madrasahId?: string, context?: ErrorContext) {
    super(
      KoskNotAffiliatedError.code,
      madrasahId
        ? `Köşk ${koskId} is not affiliated with medrese ${madrasahId}`
        : `Köşk ${koskId} is not affiliated with any medrese`,
      context
    );
  }
}
