import { BadRequestError } from "@medaris/common";

/** A score above the exam's "tam puan", below 0, or with "Girmedi" (MDRS-248). */
export class ExamScoreOutOfRangeError extends BadRequestError {
  static readonly code = "EXAM_SCORE_OUT_OF_RANGE";

  constructor(maxScore: number) {
    super(
      ExamScoreOutOfRangeError.code,
      `A score is a whole number from 0 to ${maxScore}, or none for an absent talebe`,
      { maxScore }
    );
  }
}
