import { ConflictError, ErrorContext } from "@medaris/common";

/**
 * The caller's token carries a gender, so the account (Keycloak) holds it and
 * tedrisat only mirrors it (#317). A profile write that would change it is
 * refused as a whole; the account's own "update profile" page changes it.
 */
export class GenderManagedByAccountError extends ConflictError {
  static readonly code = "GENDER_MANAGED_BY_ACCOUNT";

  constructor(
    message = "The gender is kept in the account; change it there",
    context?: ErrorContext
  ) {
    super(GenderManagedByAccountError.code, message, context);
  }
}
