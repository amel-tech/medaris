import { ConflictError, ErrorContext } from "@medaris/common";

/**
 * The köşk already belongs to a different medrese (MDRS-106). It has to be
 * detached from that one first; a nazır cannot take another medrese's köşk.
 */
export class KoskAlreadyAffiliatedError extends ConflictError {
  static readonly code = "KOSK_ALREADY_AFFILIATED";

  constructor(koskId: string, context?: ErrorContext) {
    super(
      KoskAlreadyAffiliatedError.code,
      `Köşk ${koskId} already belongs to another medrese`,
      context
    );
  }
}
