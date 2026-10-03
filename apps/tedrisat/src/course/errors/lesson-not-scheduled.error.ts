import { ConflictError } from "@medaris/common";

/**
 * The session has no start time, so there is nothing to put in a calendar
 * (MDRS-117). Only LIVE sessions carry `scheduledAt`.
 */
export class LessonNotScheduledError extends ConflictError {
  static readonly code = "LESSON_NOT_SCHEDULED";

  constructor(lessonId: string) {
    super(
      LessonNotScheduledError.code,
      `Lesson ${lessonId} has no scheduled time`,
      { lessonId }
    );
  }
}
