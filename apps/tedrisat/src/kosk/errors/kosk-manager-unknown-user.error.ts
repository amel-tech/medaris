import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * The user to be made a köşk manager has no `users` row — they have never
 * signed in (MDRS-104, MDRS-126). Refused, so that a mistyped id cannot
 * become the second manager that lets the last real one leave.
 */
export class KoskManagerUnknownUserError extends NotFoundError {
  static readonly code = "KOSK_MANAGER_UNKNOWN_USER";

  constructor(userId: string, context?: ErrorContext) {
    super(
      KoskManagerUnknownUserError.code,
      `User ${userId} has never signed in and cannot be made a köşk manager`,
      context
    );
  }
}
