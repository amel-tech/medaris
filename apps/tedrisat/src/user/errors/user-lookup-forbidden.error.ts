import { ErrorContext, ForbiddenError } from "@medaris/common";

export class UserLookupForbiddenError extends ForbiddenError {
  static readonly code = "USER_LOOKUP_FORBIDDEN";

  constructor(
    message = "Only platform admins, nazırs and köşk managers may look users up",
    context?: ErrorContext
  ) {
    super(UserLookupForbiddenError.code, message, context);
  }
}
