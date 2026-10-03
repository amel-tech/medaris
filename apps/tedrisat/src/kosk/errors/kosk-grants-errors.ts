import {
  BadRequestError,
  ConflictError,
  type ErrorContext,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";

/** Giving a permission the giver does not hold (nizam/38, criterion 2). */
export class GrantExceedsGiverError extends ForbiddenError {
  static readonly code = "GRANT_EXCEEDS_GIVER";

  constructor(codes: string[], context?: ErrorContext) {
    super(GrantExceedsGiverError.code, `You do not hold: ${codes.join(", ")}`, {
      codes,
      ...context,
    });
  }
}

/** The course is not one of this köşk's, or it belongs to a medrese. */
export class GrantCourseInvalidError extends BadRequestError {
  static readonly code = "GRANT_COURSE_INVALID";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      GrantCourseInvalidError.code,
      `Course ${courseId} is not a medrese-free course of this köşk`,
      context
    );
  }
}

/** The person is the ders nazırı of that course already. */
export class CourseNazirExistsError extends ConflictError {
  static readonly code = "COURSE_NAZIR_EXISTS";

  constructor(userId: string, courseId: string, context?: ErrorContext) {
    super(
      CourseNazirExistsError.code,
      `User ${userId} is a ders nazırı of course ${courseId} already`,
      context
    );
  }
}

/** No held ders nazırı post with that id in this köşk. */
export class CourseNazirNotFoundError extends NotFoundError {
  static readonly code = "COURSE_NAZIR_NOT_FOUND";

  constructor(grantId: string, context?: ErrorContext) {
    super(
      CourseNazirNotFoundError.code,
      `No ders nazırı post ${grantId} in this köşk`,
      context
    );
  }
}
