import { ConflictError } from "@medaris/common";

/** A session holds one recording; to change it, change that one. */
export class RecordingExistsError extends ConflictError {
  static readonly code = "RECORDING_EXISTS";

  constructor(lessonId: string, recordingId: string) {
    super(
      RecordingExistsError.code,
      `Lesson ${lessonId} already has a recording`,
      { lessonId, recordingId }
    );
  }
}
