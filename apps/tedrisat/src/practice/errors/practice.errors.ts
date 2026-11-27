import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";

/**
 * The refusals of a talebe's çalışma soruları (MDRS-248). A set that is a
 * draft, an exam rather than a set, or of a course the caller is no talebe
 * of is not found; so is an attempt of anyone else's.
 */

/** The caller is no talebe of the course who may solve its sets: not enrolled, barred, or its content closed. */
export class PracticeForbiddenError extends ForbiddenError {
  static readonly code = "PRACTICE_FORBIDDEN";
  constructor(courseId: string) {
    super(
      PracticeForbiddenError.code,
      "Çalışma setleri are solved by a talebe enrolled in the course, while its content is open",
      { courseId }
    );
  }
}

/** No published çalışma seti by that id that the caller may solve. */
export class PracticeSetNotFoundError extends NotFoundError {
  static readonly code = "PRACTICE_SET_NOT_FOUND";
  constructor(setId: string) {
    super(PracticeSetNotFoundError.code, `No çalışma seti ${setId}`, {
      setId,
    });
  }
}

/** No attempt by that id of the caller's own. */
export class PracticeAttemptNotFoundError extends NotFoundError {
  static readonly code = "PRACTICE_ATTEMPT_NOT_FOUND";
  constructor(attemptId: string) {
    super(
      PracticeAttemptNotFoundError.code,
      `No practice attempt ${attemptId}`,
      { attemptId }
    );
  }
}

/** The attempt is finished: its answers stay as they were. */
export class PracticeAttemptFinishedError extends ConflictError {
  static readonly code = "PRACTICE_ATTEMPT_FINISHED";
  constructor(attemptId: string) {
    super(
      PracticeAttemptFinishedError.code,
      `Practice attempt ${attemptId} is finished`,
      { attemptId }
    );
  }
}

/** The question is not one of the attempt's. */
export class PracticeQuestionNotFoundError extends NotFoundError {
  static readonly code = "PRACTICE_QUESTION_NOT_FOUND";
  constructor(attemptId: string, questionId: string) {
    super(
      PracticeQuestionNotFoundError.code,
      `Question ${questionId} is not one of practice attempt ${attemptId}`,
      { attemptId, questionId }
    );
  }
}

/** Options of another question, one twice, or more than one on a radio question. */
export class PracticeAnswerInvalidError extends BadRequestError {
  static readonly code = "PRACTICE_ANSWER_INVALID";
  constructor(questionId: string) {
    super(
      PracticeAnswerInvalidError.code,
      `The options do not fit question ${questionId}`,
      { questionId }
    );
  }
}
