import { ConflictError } from "@medaris/common";

/**
 * Only a live session (`type` LIVE) takes a live stream link (MDRS-228); a
 * video, document or quiz lesson has no broadcast to point at.
 */
export class LessonNotLiveError extends ConflictError {
  static readonly code = "LESSON_NOT_LIVE";

  constructor(lessonId: string) {
    super(LessonNotLiveError.code, `Lesson ${lessonId} is not a live session`, {
      lessonId,
    });
  }
}
