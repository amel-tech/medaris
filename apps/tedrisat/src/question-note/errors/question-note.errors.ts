import { ConflictError, ForbiddenError, NotFoundError } from "@medaris/common";

/**
 * The refusals of soru notları (MDRS-248). A question the caller never got
 * in an attempt of their own is not found, as one that is not there; so is
 * a note of anyone else's, and, for the hoca, a note its talebe kept to
 * themselves.
 */

/** No question by that id that the caller solved or sat. */
export class NoteQuestionNotFoundError extends NotFoundError {
  static readonly code = "NOTE_QUESTION_NOT_FOUND";
  constructor(questionId: string) {
    super(
      NoteQuestionNotFoundError.code,
      `No question ${questionId} the caller solved or sat`,
      { questionId }
    );
  }
}

/** No note by that id (or on that question) the caller may reach. */
export class QuestionNoteNotFoundError extends NotFoundError {
  static readonly code = "QUESTION_NOTE_NOT_FOUND";
  constructor(id: string) {
    super(QuestionNoteNotFoundError.code, `No question note ${id}`, { id });
  }
}

/** The team turned the question's notes off: what is written stays readable. */
export class NotesDisabledError extends ConflictError {
  static readonly code = "NOTES_DISABLED";
  constructor(questionId: string) {
    super(NotesDisabledError.code, "Notes are off for this question", {
      questionId,
    });
  }
}

/** An exam's note goes to the hoca only once the exam is over for everyone or its results are open. */
export class NotesShareLockedError extends ConflictError {
  static readonly code = "NOTES_SHARE_LOCKED";
  constructor(questionId: string) {
    super(
      NotesShareLockedError.code,
      "A note on an exam's question is sent to the hoca once the exam is over for everyone or its results are open",
      { questionId }
    );
  }
}

/** The caller is no talebe of the course who may write on it. */
export class QuestionNotesForbiddenError extends ForbiddenError {
  static readonly code = "QUESTION_NOTES_FORBIDDEN";
  constructor(courseId: string) {
    super(
      QuestionNotesForbiddenError.code,
      "Question notes are written by a talebe enrolled in the course, while its content is open",
      { courseId }
    );
  }
}
