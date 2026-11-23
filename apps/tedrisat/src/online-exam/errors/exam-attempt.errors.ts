import { BadRequestError, ConflictError, NotFoundError } from "@medaris/common";

/**
 * The refusals of a talebe's sitting of an online exam (MDRS-299), with the
 * codes `graphs/domain/planned-exams.yaml` proposes. A celse that is not a
 * published online exam, or one the caller holds no seat in, is the
 * preparation's EXAM_NOT_FOUND (`OnlineExamNotFoundError`).
 */

/** Before the earliest start, after the latest start with no attempt in progress, or closed. */
export class ExamNotOpenError extends ConflictError {
  static readonly code = "EXAM_NOT_OPEN";
  constructor(lessonId: string) {
    super(ExamNotOpenError.code, `The exam of lesson ${lessonId} is not open`, {
      lessonId,
    });
  }
}

/** The zeroth question has to be answered before the start. */
export class ZerothUnansweredError extends ConflictError {
  static readonly code = "ZEROTH_UNANSWERED";
  constructor(lessonId: string) {
    super(
      ZerothUnansweredError.code,
      `The zeroth question of lesson ${lessonId} is not answered`,
      { lessonId }
    );
  }
}

/** The option is not one of this exam's zeroth question. */
export class ZerothOptionNotFoundError extends BadRequestError {
  static readonly code = "ZEROTH_OPTION_NOT_FOUND";
  constructor(optionId: string) {
    super(
      ZerothOptionNotFoundError.code,
      `Option ${optionId} is not one of the exam's zeroth question`,
      { optionId }
    );
  }
}

/** The caller finished it already: an exam is taken once. */
export class ExamAlreadyTakenError extends ConflictError {
  static readonly code = "EXAM_ALREADY_TAKEN";
  constructor(lessonId: string) {
    super(
      ExamAlreadyTakenError.code,
      `The exam of lesson ${lessonId} is taken already`,
      { lessonId }
    );
  }
}

/** The caller has no attempt in progress. */
export class AttemptNotFoundError extends NotFoundError {
  static readonly code = "ATTEMPT_NOT_FOUND";
  constructor(lessonId: string) {
    super(
      AttemptNotFoundError.code,
      `No attempt in progress at lesson ${lessonId}`,
      { lessonId }
    );
  }
}

/** Another tab or device has opened the exam since: it holds the attempt now. */
export class AttemptHeldElsewhereError extends ConflictError {
  static readonly code = "ATTEMPT_HELD_ELSEWHERE";
  constructor(lessonId: string) {
    super(
      AttemptHeldElsewhereError.code,
      `The attempt at lesson ${lessonId} is held by another page`,
      { lessonId }
    );
  }
}

/** The time ran out or the team closed the exam: the answers saved before stand. */
export class AttemptEndedError extends ConflictError {
  static readonly code = "ATTEMPT_ENDED";
  constructor(lessonId: string) {
    super(AttemptEndedError.code, `The attempt at lesson ${lessonId} ended`, {
      lessonId,
    });
  }
}

/** An option that is not the question's, one twice, or more than one for a SINGLE question. */
export class AnswerInvalidError extends BadRequestError {
  static readonly code = "ANSWER_INVALID";
  constructor(questionId: string) {
    super(
      AnswerInvalidError.code,
      `The answer does not fit question ${questionId}`,
      { questionId }
    );
  }
}

/** The question is not one of the attempt's. */
export class AttemptQuestionNotFoundError extends NotFoundError {
  static readonly code = "QUESTION_NOT_FOUND";
  constructor(questionId: string) {
    super(
      AttemptQuestionNotFoundError.code,
      `Question ${questionId} is not one of the attempt's`,
      { questionId }
    );
  }
}

/** The attempt has started: the zeroth answer given before it stays. */
export class ZerothAnswerLockedError extends ConflictError {
  static readonly code = "ZEROTH_ANSWER_LOCKED";
  constructor(lessonId: string) {
    super(
      ZerothAnswerLockedError.code,
      `The attempt at lesson ${lessonId} has started; its zeroth answer stays`,
      { lessonId }
    );
  }
}
