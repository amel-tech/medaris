import {
  BadRequestError,
  ConflictError,
  ErrorContext,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";

/** No such course in this medrese: missing, another medrese's, or hidden. */
export class MadrasahCourseNotFoundError extends NotFoundError {
  static readonly code = "MADRASAH_COURSE_NOT_FOUND";

  constructor(madrasahId: string, courseId: string, context?: ErrorContext) {
    super(
      MadrasahCourseNotFoundError.code,
      `Medrese ${madrasahId} has no course ${courseId}`,
      context
    );
  }
}

export class MadrasahCourseAlreadyHiddenError extends ConflictError {
  static readonly code = "MADRASAH_COURSE_ALREADY_HIDDEN";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      MadrasahCourseAlreadyHiddenError.code,
      `Course ${courseId} is already hidden`,
      context
    );
  }
}

/**
 * The köşk has given the medrese no hosting right (or has withdrawn it, or is
 * hidden): the medrese may not open a course there (MDRS-137).
 */
export class HostingRightRequiredError extends ForbiddenError {
  static readonly code = "HOSTING_RIGHT_REQUIRED";

  constructor(madrasahId: string, koskId: string, context?: ErrorContext) {
    super(
      HostingRightRequiredError.code,
      `Medrese ${madrasahId} holds no hosting right in köşk ${koskId}`,
      context
    );
  }
}

/** Several müderrisler and none chosen as the imam. */
export class CourseImamRequiredError extends BadRequestError {
  static readonly code = "COURSE_IMAM_REQUIRED";

  constructor(context?: ErrorContext) {
    super(
      CourseImamRequiredError.code,
      "With more than one müderris, the imam must be named",
      context
    );
  }
}

export { CourseImamNotListedError } from "../../course/errors/course-imam-not-listed.error";
