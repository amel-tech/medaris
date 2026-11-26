import { NotFoundError } from "@medaris/common";

/** The session is not an exam (MDRS-248), or it is hidden. */
export class ExamNotFoundError extends NotFoundError {
  static readonly code = "EXAM_NOT_FOUND";

  constructor(lessonId: string) {
    super(ExamNotFoundError.code, `Session ${lessonId} is not an exam`, {
      lessonId,
    });
  }
}
