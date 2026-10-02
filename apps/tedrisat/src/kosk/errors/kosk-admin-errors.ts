import { ConflictError, ErrorContext, NotFoundError } from "@medaris/common";

/** Hiding a köşk that is hidden already (MDRS-174). */
export class KoskAlreadyHiddenError extends ConflictError {
  static readonly code = "KOSK_ALREADY_HIDDEN";

  constructor(koskId: string, context?: ErrorContext) {
    super(
      KoskAlreadyHiddenError.code,
      `Köşk ${koskId} is hidden already`,
      context
    );
  }
}

/** Restoring a köşk that is not hidden (MDRS-174). */
export class KoskNotHiddenError extends ConflictError {
  static readonly code = "KOSK_NOT_HIDDEN";

  constructor(koskId: string, context?: ErrorContext) {
    super(KoskNotHiddenError.code, `Köşk ${koskId} is not hidden`, context);
  }
}

/** Adding someone who already is a köşk nazımı there (nizam/21). */
export class KoskNazimExistsError extends ConflictError {
  static readonly code = "KOSK_NAZIM_EXISTS";

  constructor(koskId: string, userIds: string[], context?: ErrorContext) {
    super(
      KoskNazimExistsError.code,
      `Already a nazım of köşk ${koskId}: ${userIds.join(", ")}`,
      context
    );
  }
}

/** A nazım the realm has no account for (nizam/10, nizam/21). */
export class KoskNazimUnknownAccountError extends NotFoundError {
  static readonly code = "KOSK_NAZIM_UNKNOWN_ACCOUNT";

  constructor(userId: string, context?: ErrorContext) {
    super(
      KoskNazimUnknownAccountError.code,
      `The user directory has no account ${userId}`,
      context
    );
  }
}
