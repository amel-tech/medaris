import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * A whole-course save that changes the müderris list from a caller without
 * `course.open_standalone` (or, in a medrese's course, `madrasah.muderris_manage`)
 * (MDRS-105). A müderris holds `course.edit` and may save the course's content
 * and sessions, but choosing who teaches it is the köşk nazımı's (or the
 * medrese's): the save is refused whole, so nothing else in it lands either.
 */
export class MuderrisAssignmentForbiddenError extends ForbiddenError {
  static readonly code = "MUDERRIS_ASSIGNMENT_FORBIDDEN";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      MuderrisAssignmentForbiddenError.code,
      `Only the köşk manager may change who teaches course ${courseId}`,
      context
    );
  }
}
