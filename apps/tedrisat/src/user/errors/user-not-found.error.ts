import { ErrorContext, NotFoundError } from "@medaris/common";

export class UserNotFoundError extends NotFoundError {
  static readonly code = "USER_NOT_FOUND";

  constructor(
    message = "The user record could not be read",
    context?: ErrorContext
  ) {
    super(UserNotFoundError.code, message, context);
  }
}
