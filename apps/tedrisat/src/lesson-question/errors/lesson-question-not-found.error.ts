import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * No question this caller may answer with this id (MDRS-150). The same answer
 * for a question that does not exist and for one in a course where the caller
 * does not hold `question.answer`: a stranger is never told it is there.
 */
export class LessonQuestionNotFoundError extends NotFoundError {
  static readonly code = "LESSON_QUESTION_NOT_FOUND";

  constructor(questionId: string, context?: ErrorContext) {
    super(
      LessonQuestionNotFoundError.code,
      `Question with id ${questionId} not found`,
      context
    );
  }
}
