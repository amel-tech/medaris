import { NotFoundError } from "@medaris/common";

/** No exam in the span and the place asked that zeroth question (getZerothQuestionExams). */
export class ZerothQuestionNotFoundError extends NotFoundError {
  static readonly code = "ZEROTH_QUESTION_NOT_FOUND";
  constructor(questionKey: string) {
    super(
      ZerothQuestionNotFoundError.code,
      `No exam in the span and the place asked zeroth question ${questionKey}`,
      { questionKey }
    );
  }
}
