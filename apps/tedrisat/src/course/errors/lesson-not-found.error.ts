import { ErrorContext, NotFoundError } from "@medaris/common";

export class LessonNotFoundError extends NotFoundError {
  static readonly code = "LESSON_NOT_FOUND";

  constructor(lessonId: string, context?: ErrorContext) {
    super(
      LessonNotFoundError.code,
      `Lesson with id ${lessonId} not found`,
      context
    );
  }
}
