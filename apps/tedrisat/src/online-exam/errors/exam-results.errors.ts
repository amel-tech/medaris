import { ConflictError, NotFoundError } from "@medaris/common";

/**
 * The exam is not open, so it cannot be closed early: it has not opened yet
 * (before that, it is taken back to a draft), it was closed early already,
 * or it has closed for everyone. Its results cannot be released before it
 * opens either: the release ends the exam for everyone (MDRS-299).
 */
export class ExamNotOpenError extends ConflictError {
  static readonly code = "EXAM_NOT_OPEN";
  constructor(examId: string) {
    super(ExamNotOpenError.code, `Exam ${examId} is not open`, { examId });
  }
}

/** The talebe is not seated in the exam's course, or has no attempt of it. */
export class TalebeAttemptNotFoundError extends NotFoundError {
  static readonly code = "ATTEMPT_NOT_FOUND";
  constructor(examId: string, userId: string) {
    super(
      TalebeAttemptNotFoundError.code,
      `User ${userId} has no attempt of exam ${examId}`,
      { examId, userId }
    );
  }
}
