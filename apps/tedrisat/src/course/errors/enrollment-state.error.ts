import { ConflictError, ErrorContext } from "@medaris/common";
import { EnrollmentStatus } from "../domain/enrollment-status.enum";

/**
 * The enrollment exists but is in the wrong state for the action (MDRS-105):
 * removing or completing a request that has not been approved yet (reject or
 * approve it instead), removing or leaving a completed course (reopen it
 * first — a completion is a record, not a seat).
 */
export class EnrollmentStateError extends ConflictError {
  static readonly code = "ENROLLMENT_STATE_CONFLICT";

  constructor(
    courseId: string,
    status: EnrollmentStatus,
    context?: ErrorContext
  ) {
    super(
      EnrollmentStateError.code,
      `The enrollment in course ${courseId} is ${status}; this action does not apply to it`,
      { courseId, status, ...context }
    );
  }
}
