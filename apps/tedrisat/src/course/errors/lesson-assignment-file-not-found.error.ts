import { NotFoundError } from "@medaris/common";

/** No such file on the celse's homework, or a file the store no longer has. */
export class LessonAssignmentFileNotFoundError extends NotFoundError {
  static readonly code = "LESSON_ASSIGNMENT_FILE_NOT_FOUND";

  constructor(fileId: string) {
    super(
      LessonAssignmentFileNotFoundError.code,
      `Homework file ${fileId} not found on this session`,
      { fileId }
    );
  }
}
