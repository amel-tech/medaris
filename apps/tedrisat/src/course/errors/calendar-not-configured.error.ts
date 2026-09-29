import { MedarisError } from "@medaris/common";

/**
 * `TEDRIS_WEB_URL` is unset, so a calendar entry has no session page to
 * point at (MDRS-117). A deployment gap, not a client fault: 503, and the
 * message names the key to set.
 */
export class CalendarNotConfiguredError extends MedarisError {
  static readonly code = "CALENDAR_NOT_CONFIGURED";

  constructor() {
    super(
      CalendarNotConfiguredError.code,
      503,
      "Calendar files are not available: TEDRIS_WEB_URL is not set on this server"
    );
  }
}
