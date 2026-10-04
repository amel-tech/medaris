import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * A whole-course save that drops a week or a session from a caller without
 * `week.hide` (MDRS-143). A week or a session missing from the payload is
 * hidden, and hiding is its own permission: `course.edit` alone would
 * otherwise be a way round it. Like the müderris-list refusal, the save is
 * refused whole, so nothing else in it lands either.
 */
export class CourseHideForbiddenError extends ForbiddenError {
  static readonly code = "COURSE_HIDE_FORBIDDEN";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      CourseHideForbiddenError.code,
      `Dropping a week or a session from course ${courseId} hides it, which needs the permission week.hide`,
      { courseId, permission: "week.hide", ...context }
    );
  }
}
