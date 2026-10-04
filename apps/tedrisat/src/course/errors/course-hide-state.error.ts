import { ConflictError, ErrorContext } from "@medaris/common";

/**
 * Hiding a course that is hidden already (MDRS-124): nothing is written, and
 * nothing of the course is echoed back, as for a köşk and a medrese.
 */
export class CourseAlreadyHiddenError extends ConflictError {
  static readonly code = "COURSE_ALREADY_HIDDEN";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      CourseAlreadyHiddenError.code,
      `Course ${courseId} is hidden already`,
      context
    );
  }
}

/** Restoring a course that is not hidden: nothing is written or echoed back. */
export class CourseNotHiddenError extends ConflictError {
  static readonly code = "COURSE_NOT_HIDDEN";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      CourseNotHiddenError.code,
      `Course ${courseId} is not hidden`,
      context
    );
  }
}
