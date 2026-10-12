import { ConflictError } from "@medaris/common";

/** A homework holds at most `maxFiles` files (MDRS-290); remove one to add another. */
export class SubmissionFileLimitError extends ConflictError {
  static readonly code = "SUBMISSION_FILE_LIMIT";

  constructor(maxFiles: number) {
    super(
      SubmissionFileLimitError.code,
      `A homework holds at most ${maxFiles} files: remove one to add another`,
      { maxFiles }
    );
  }
}
