import { BadRequestError, ErrorContext } from "@medaris/common";

/** A course deck names a week that is not one of its course's shown weeks. */
export class CourseWeekNotInCourseError extends BadRequestError {
  static readonly code = "COURSE_WEEK_NOT_IN_COURSE";

  constructor(weekId: string, context?: ErrorContext) {
    super(
      CourseWeekNotInCourseError.code,
      `Week ${weekId} is not a week of this course`,
      context
    );
  }
}
