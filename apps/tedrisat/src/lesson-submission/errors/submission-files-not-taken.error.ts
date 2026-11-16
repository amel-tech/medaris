import { ConflictError } from "@medaris/common";

/**
 * The celse's homework is recited to the müderris ("Ezberini hocana dinlet",
 * MDRS-248), so no file is handed in on it: the course team marks it on
 * "Değerlendirme" instead.
 */
export class SubmissionFilesNotTakenError extends ConflictError {
  static readonly code = "SUBMISSION_FILES_NOT_TAKEN";

  constructor(lessonId: string) {
    super(
      SubmissionFilesNotTakenError.code,
      "This session's homework is recited to the müderris, not handed in as files",
      { lessonId }
    );
  }
}
