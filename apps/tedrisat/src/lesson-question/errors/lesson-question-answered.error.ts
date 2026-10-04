import { ConflictError, ErrorContext } from "@medaris/common";

/**
 * An answered question is no longer edited (MDRS-150): the answer belongs to
 * the question as it was asked. The author may still delete it, which removes
 * the answer with it.
 */
export class LessonQuestionAnsweredError extends ConflictError {
  static readonly code = "LESSON_QUESTION_ANSWERED";

  constructor(questionId: string, context?: ErrorContext) {
    super(
      LessonQuestionAnsweredError.code,
      `Question ${questionId} is answered and can no longer be edited`,
      context
    );
  }
}
