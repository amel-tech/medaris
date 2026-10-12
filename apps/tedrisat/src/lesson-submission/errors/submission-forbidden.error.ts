import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * Homework on a celse (MDRS-290) is handed in, changed and removed by a talebe
 * enrolled in the course (ENROLLED or COMPLETED, not barred) while its content
 * is open, and each file is read only by the talebe who handed it in and by
 * whoever holds `submission.read`. Another talebe's file, or one asked for by
 * staff without the permission on the talebe's own route, is refused here.
 * The message names no course.
 */
export class SubmissionForbiddenError extends ForbiddenError {
  static readonly code = "SUBMISSION_FORBIDDEN";

  constructor(context?: ErrorContext) {
    super(
      SubmissionForbiddenError.code,
      "Homework on a session is handed in and read by the talebe enrolled in the course who wrote it",
      context
    );
  }
}
