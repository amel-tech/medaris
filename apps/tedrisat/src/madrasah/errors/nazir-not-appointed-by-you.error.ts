import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * A nazır who holds "Medrese nazırı ata" dismisses only the nazırs they
 * appointed themselves (owner, d-1004-28 "kendi atadıklarını"); the medrese's
 * başmüderris and the platform dismiss any.
 */
export class NazirNotAppointedByYouError extends ForbiddenError {
  static readonly code = "NAZIR_NOT_APPOINTED_BY_YOU";

  constructor(context?: ErrorContext) {
    super(
      NazirNotAppointedByYouError.code,
      "You may dismiss only the nazırs you appointed",
      context
    );
  }
}
