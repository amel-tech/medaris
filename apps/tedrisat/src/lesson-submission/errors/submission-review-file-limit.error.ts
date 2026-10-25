import { ConflictError } from "@medaris/common";

/** A review carries at most `maxFiles` files; remove one to add another. */
export class SubmissionReviewFileLimitError extends ConflictError {
  static readonly code = "SUBMISSION_REVIEW_FILE_LIMIT";

  constructor(maxFiles: number) {
    super(
      SubmissionReviewFileLimitError.code,
      `A review carries at most ${maxFiles} files: remove one to add another`,
      { maxFiles }
    );
  }
}
