import { NotFoundError } from "@medaris/common";

/** No such homework file on this celse, or in this course (MDRS-290), or the store no longer has it. */
export class SubmissionFileNotFoundError extends NotFoundError {
  static readonly code = "SUBMISSION_FILE_NOT_FOUND";

  constructor(fileId: string) {
    super(
      SubmissionFileNotFoundError.code,
      `Homework file ${fileId} not found`,
      { fileId }
    );
  }
}
