import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * Only a talebe enrolled in the course keeps a watch record (MDRS-248): not a
 * pending or revoked one, not a barred talebe, and not the course team as
 * such; a course whose content a passive scope closed refuses it too. The
 * message names no course, as for a note (LESSON_NOTE_FORBIDDEN).
 */
export class LessonViewForbiddenError extends ForbiddenError {
  static readonly code = "LESSON_VIEW_FORBIDDEN";

  constructor(context?: ErrorContext) {
    super(
      LessonViewForbiddenError.code,
      "A watch record is kept for a talebe enrolled in the course, while its content is open",
      context
    );
  }
}
