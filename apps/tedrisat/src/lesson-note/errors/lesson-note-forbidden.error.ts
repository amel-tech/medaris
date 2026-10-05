import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * Writing a note takes an active enrollment in the course (MDRS-150): not a
 * pending or revoked one, not a barred talebe, and not the course team as
 * such. A course whose content a passive scope has closed refuses every note
 * route, a talebe's own included. The message names no course: a lesson route
 * would otherwise tell a stranger which course the session belongs to.
 */
export class LessonNoteForbiddenError extends ForbiddenError {
  static readonly code = "LESSON_NOTE_FORBIDDEN";

  constructor(context?: ErrorContext) {
    super(
      LessonNoteForbiddenError.code,
      "Notes on a session are for a talebe enrolled in the course, while its content is open",
      context
    );
  }
}
