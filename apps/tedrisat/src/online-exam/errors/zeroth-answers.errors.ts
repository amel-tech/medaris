import { NotFoundError } from "@medaris/common";

/** No exam in the span and the place asked that zeroth question (getZerothQuestionExams). */
export class ZerothQuestionNotFoundError extends NotFoundError {
  static readonly code = "ZEROTH_QUESTION_NOT_FOUND";
  // The key the caller sent is not echoed back: the message is fixed.
  constructor() {
    super(
      ZerothQuestionNotFoundError.code,
      "No exam in the span and the place asked that zeroth question"
    );
  }
}
