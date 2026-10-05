import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * No note of the caller's with this id on this session. The same answer for a
 * note that does not exist and for one somebody else wrote (MDRS-150): a
 * stranger's note is never confirmed to be there.
 */
export class LessonNoteNotFoundError extends NotFoundError {
  static readonly code = "LESSON_NOTE_NOT_FOUND";

  constructor(noteId: string, context?: ErrorContext) {
    super(
      LessonNoteNotFoundError.code,
      `Note with id ${noteId} not found`,
      context
    );
  }
}
