import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * The account is not on the course's müderris list, so it carries no unvan
 * there to set: only a hoca of the course has one.
 */
export class CourseMuderrisNotFoundError extends NotFoundError {
  static readonly code = "COURSE_MUDERRIS_NOT_FOUND";

  constructor(courseId: string, userId: string, context?: ErrorContext) {
    super(
      CourseMuderrisNotFoundError.code,
      `Account ${userId} is not a müderris of course ${courseId}`,
      context
    );
  }
}
