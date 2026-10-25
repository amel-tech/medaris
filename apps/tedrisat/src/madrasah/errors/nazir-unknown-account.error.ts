import { ErrorContext, NotFoundError } from "@medaris/common";

/** No account with this id, in the app or the realm: nobody to appoint. */
export class NazirUnknownAccountError extends NotFoundError {
  static readonly code = "MADRASAH_NAZIR_UNKNOWN_ACCOUNT";

  constructor(userId: string, context?: ErrorContext) {
    super(
      NazirUnknownAccountError.code,
      `No account ${userId} in the app or the realm; it cannot be made a medrese nazırı`,
      context
    );
  }
}
