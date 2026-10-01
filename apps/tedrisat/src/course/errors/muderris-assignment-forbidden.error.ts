import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * A whole-course save that changes the müderris list from a caller without
 * `ASSIGN_MUDERRIS` (MDRS-105). A müderris holds `EDIT` and may save the
 * course's content and sessions, but choosing who teaches it is the köşk
 * manager's: the save is refused whole, so nothing else in it lands either.
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
