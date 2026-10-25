import { NotFoundError } from "@medaris/common";

/** No homework with this id on a live celse of this course. */
export class SubmissionNotFoundError extends NotFoundError {
  static readonly code = "SUBMISSION_NOT_FOUND";

  constructor(submissionId: string) {
    super(SubmissionNotFoundError.code, `Homework ${submissionId} not found`, {
      submissionId,
    });
  }
}
