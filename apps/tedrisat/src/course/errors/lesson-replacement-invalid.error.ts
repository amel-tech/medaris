import { BadRequestError } from "@medaris/common";

/**
 * The session named as a cancelled session's make-up cannot be one: it is not
 * a live session of the same course, it is the cancelled session itself, or it
 * is cancelled too.
 */
export class LessonReplacementInvalidError extends BadRequestError {
  static readonly code = "LESSON_REPLACEMENT_INVALID";

  constructor(lessonId: string, replacementLessonId: string, reason: string) {
    super(LessonReplacementInvalidError.code, reason, {
      lessonId,
      replacementLessonId,
    });
  }
}
