import { BadRequestError } from "@medaris/common";

/** A review is sent with a note or at least one file; an empty one says nothing. */
export class SubmissionReviewEmptyError extends BadRequestError {
  static readonly code = "SUBMISSION_REVIEW_EMPTY";

  constructor() {
    super(
      SubmissionReviewEmptyError.code,
      "A review needs a note or at least one file"
    );
  }
}
