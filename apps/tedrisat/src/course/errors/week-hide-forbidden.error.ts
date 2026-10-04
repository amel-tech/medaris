import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * A whole-course save would hide a week or a session, and the saver does not
 * hold `week.hide` on the course (MDRS-136, owner decision d-1004-14). Nothing
 * was written.
 */
export class WeekHideForbiddenError extends ForbiddenError {
  static readonly code = "WEEK_HIDE_FORBIDDEN";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      WeekHideForbiddenError.code,
      `Saving course ${courseId} would hide a week or a session, which needs the permission week.hide`,
      context
    );
  }
}
