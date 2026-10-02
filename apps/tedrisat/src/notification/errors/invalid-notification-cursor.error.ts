import { BadRequestError, ErrorContext } from "@medaris/common";

export class InvalidNotificationCursorError extends BadRequestError {
  static readonly code = "INVALID_NOTIFICATION_CURSOR";

  constructor(context?: ErrorContext) {
    super(
      InvalidNotificationCursorError.code,
      "The cursor is not one this server issued",
      context
    );
  }
}
