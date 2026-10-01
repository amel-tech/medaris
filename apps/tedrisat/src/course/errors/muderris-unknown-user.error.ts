import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * A müderris row linked to an account that has no `users` row — the person
 * has never signed in (MDRS-104), or the id is mistyped (MDRS-105). Refused
 * like `KOSK_MANAGER_UNKNOWN_USER`: a link to nobody would grant MUDERRIS to
 * whoever later signs in under that id.
 */
export class MuderrisUnknownUserError extends NotFoundError {
  static readonly code = "MUDERRIS_UNKNOWN_USER";

  constructor(userId: string, context?: ErrorContext) {
    super(
      MuderrisUnknownUserError.code,
      `User ${userId} has never signed in and cannot be made a müderris`,
      context
    );
  }
}
