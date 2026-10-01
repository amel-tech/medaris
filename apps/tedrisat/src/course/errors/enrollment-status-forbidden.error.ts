import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * A talebe tried to set their own enrollment's status through
 * `PUT /courses/:id/progress` (MDRS-105). Completion is the course team's
 * call — `PATCH /courses/:id/enrollments/:userId` — not the talebe's.
 */
export class EnrollmentStatusForbiddenError extends ForbiddenError {
  static readonly code = "ENROLLMENT_STATUS_FORBIDDEN";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      EnrollmentStatusForbiddenError.code,
      `Only the course team sets the status of an enrollment in course ${courseId}`,
      context
    );
  }
}
