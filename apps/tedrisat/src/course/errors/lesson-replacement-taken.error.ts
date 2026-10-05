import { ConflictError } from "@medaris/common";

/** The session is already the make-up of another cancelled session. */
export class LessonReplacementTakenError extends ConflictError {
  static readonly code = "LESSON_REPLACEMENT_TAKEN";

  constructor(replacementLessonId: string, takenByLessonId: string) {
    super(
      LessonReplacementTakenError.code,
      `Lesson ${replacementLessonId} already makes up for another cancelled session`,
      { replacementLessonId, takenByLessonId }
    );
  }
}
