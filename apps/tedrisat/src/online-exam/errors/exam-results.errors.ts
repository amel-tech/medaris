import { ConflictError } from "@medaris/common";

/**
 * The exam is not open, so it cannot be closed early: it has not opened yet
 * (before that, it is taken back to a draft), it was closed early already,
 * or it has closed for everyone.
 */
export class ExamNotOpenError extends ConflictError {
  static readonly code = "EXAM_NOT_OPEN";
  constructor(examId: string) {
    super(ExamNotOpenError.code, `Exam ${examId} is not open`, { examId });
  }
}
