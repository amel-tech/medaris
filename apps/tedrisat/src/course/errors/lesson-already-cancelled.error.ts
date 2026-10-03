import { ConflictError, ErrorContext } from "@medaris/common";

/** The session is cancelled already (MDRS-176). */
export class LessonAlreadyCancelledError extends ConflictError {
  static readonly code = "LESSON_ALREADY_CANCELLED";

  constructor(lessonId: string, context?: ErrorContext) {
    super(
      LessonAlreadyCancelledError.code,
      `Lesson ${lessonId} is already cancelled`,
      context
    );
  }
}
