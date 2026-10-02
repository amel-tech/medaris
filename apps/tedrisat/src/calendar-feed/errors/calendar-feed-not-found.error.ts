import { NotFoundError } from "@medaris/common";

/**
 * No feed answers to this URL (MDRS-120): the token was never issued, was
 * replaced by "Bağlantıyı yenile", or the name is not `<token>.ics` at all.
 * One answer for all three, so the route does not say which.
 */
export class CalendarFeedNotFoundError extends NotFoundError {
  static readonly code = "CALENDAR_FEED_NOT_FOUND";

  constructor() {
    super(CalendarFeedNotFoundError.code, "Calendar feed not found");
  }
}
