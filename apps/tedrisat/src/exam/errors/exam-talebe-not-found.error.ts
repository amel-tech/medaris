import { NotFoundError } from "@medaris/common";

/** The talebe to grade is not seated in the exam's course (MDRS-248). */
export class ExamTalebeNotFoundError extends NotFoundError {
  static readonly code = "EXAM_TALEBE_NOT_FOUND";

  constructor(userId: string) {
    super(
      ExamTalebeNotFoundError.code,
      "The talebe is not seated in this course",
      { userId }
    );
  }
}
