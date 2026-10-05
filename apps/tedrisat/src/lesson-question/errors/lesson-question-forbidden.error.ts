import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * Asking takes an active enrollment in the course (MDRS-150): not a pending or
 * revoked one, not a barred talebe, and not the course team as such. A course
 * whose content a passive scope has closed refuses the author's routes too.
 * The message names no course: a lesson route would otherwise tell a stranger
 * which course the session belongs to.
 */
export class LessonQuestionForbiddenError extends ForbiddenError {
  static readonly code = "LESSON_QUESTION_FORBIDDEN";

  constructor(context?: ErrorContext) {
    super(
      LessonQuestionForbiddenError.code,
      "Questions on a session are for a talebe enrolled in the course, while its content is open",
      context
    );
  }
}
