import { BadRequestError, ErrorContext } from "@medaris/common";

export class InvalidQuestionCursorError extends BadRequestError {
  static readonly code = "INVALID_QUESTION_CURSOR";

  constructor(context?: ErrorContext) {
    super(
      InvalidQuestionCursorError.code,
      "The cursor is not one this server issued",
      context
    );
  }
}
