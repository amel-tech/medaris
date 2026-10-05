import { ConflictError } from "@medaris/common";

/**
 * A session has at most one recording (MDRS-162). Adding another is refused
 * with the existing one's id, to change that one instead; a new Bunny upload
 * (MDRS-116) is refused while it has one too, unless that one is a Bunny upload
 * that FAILED, which the new upload replaces.
 */
export class RecordingExistsError extends ConflictError {
  static readonly code = "RECORDING_EXISTS";

  constructor(lessonId: string, recordingId?: string) {
    super(
      RecordingExistsError.code,
      `Lesson ${lessonId} already has a recording`,
      recordingId ? { lessonId, recordingId } : { lessonId }
    );
  }
}
