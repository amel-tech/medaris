import { NotFoundError } from "@medaris/common";

/** The session has no homework recited to the müderris (MDRS-248) to mark or read a mark of. */
export class MemorizationNotFoundError extends NotFoundError {
  static readonly code = "MEMORIZATION_NOT_FOUND";

  constructor(lessonId: string) {
    super(
      MemorizationNotFoundError.code,
      `Session ${lessonId} has no memorisation homework`,
      { lessonId }
    );
  }
}
