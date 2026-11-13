import { NotFoundError } from "@medaris/common";

/**
 * Only a talebe seated in the course (ENROLLED or COMPLETED) is marked on its
 * memorisation homework (MDRS-248). Anyone else, a talebe of another course
 * included, is not found: the answer names no course.
 */
export class EvaluationTalebeNotFoundError extends NotFoundError {
  static readonly code = "EVALUATION_TALEBE_NOT_FOUND";

  constructor(userId: string) {
    super(
      EvaluationTalebeNotFoundError.code,
      `No talebe ${userId} is seated in this session's course`,
      { userId }
    );
  }
}
