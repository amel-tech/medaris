import { BadRequestError, ErrorContext } from "@medaris/common";

/**
 * The imam named for a course is not one of its müderrisler (nazir/08, and the
 * köşk's course form since MDRS-136): the imam is always one of the accounts
 * the course lists.
 */
export class CourseImamNotListedError extends BadRequestError {
  static readonly code = "COURSE_IMAM_NOT_LISTED";

  constructor(userId: string, context?: ErrorContext) {
    super(
      CourseImamNotListedError.code,
      `User ${userId} is named the imam but is not among the müderrisler`,
      context
    );
  }
}
