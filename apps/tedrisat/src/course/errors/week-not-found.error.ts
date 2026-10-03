import { ErrorContext, NotFoundError } from "@medaris/common";

/** The week is missing, archived, or belongs to a different course. */
export class WeekNotFoundError extends NotFoundError {
  static readonly code = "WEEK_NOT_FOUND";

  constructor(weekId: string, courseId: string, context?: ErrorContext) {
    super(
      WeekNotFoundError.code,
      `Week with id ${weekId} not found in course ${courseId}`,
      context
    );
  }
}
