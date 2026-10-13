import { NotFoundError } from "@medaris/common";

/**
 * The celse has no homework: none was set, or it was taken off. A file is
 * added to homework that is there, so "Bu celsenin ödevi var" comes first.
 */
export class LessonAssignmentNotFoundError extends NotFoundError {
  static readonly code = "LESSON_ASSIGNMENT_NOT_FOUND";

  constructor(lessonId: string) {
    super(
      LessonAssignmentNotFoundError.code,
      `Session ${lessonId} has no homework`,
      { lessonId }
    );
  }
}
