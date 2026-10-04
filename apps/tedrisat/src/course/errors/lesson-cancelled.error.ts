import { ConflictError } from "@medaris/common";

/**
 * The session is cancelled (MDRS-176), so nothing about its broadcast changes
 * any more: its stream link is never shown (MDRS-228).
 */
export class LessonCancelledError extends ConflictError {
  static readonly code = "LESSON_CANCELLED";

  constructor(lessonId: string) {
    super(
      LessonCancelledError.code,
      `Lesson ${lessonId} is cancelled; a cancelled session takes no live stream link`,
      { lessonId }
    );
  }
}
