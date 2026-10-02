import { ErrorContext, NotFoundError } from "@medaris/common";

/** Also what another person's notification answers: its existence is theirs. */
export class NotificationNotFoundError extends NotFoundError {
  static readonly code = "NOTIFICATION_NOT_FOUND";

  constructor(notificationId: string, context?: ErrorContext) {
    super(
      NotificationNotFoundError.code,
      `Notification with id ${notificationId} not found`,
      context
    );
  }
}
