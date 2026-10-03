import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * A müderris row linked to an id that names no account: neither a `users` row
 * (MDRS-104) nor a realm account (MDRS-218), so a mistyped id (MDRS-105).
 * Refused like `KOSK_MANAGER_UNKNOWN_USER`: a link to nobody would grant
 * MUDERRIS to whoever later signs in under that id.
 */
export class MuderrisUnknownUserError extends NotFoundError {
  static readonly code = "MUDERRIS_UNKNOWN_USER";

  constructor(userId: string, context?: ErrorContext) {
    super(
      MuderrisUnknownUserError.code,
      `No account ${userId} in the app or the realm; it cannot be made a müderris`,
      context
    );
  }
}
