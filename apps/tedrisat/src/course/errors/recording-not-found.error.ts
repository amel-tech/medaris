import { NotFoundError } from "@medaris/common";

export class RecordingNotFoundError extends NotFoundError {
  static readonly code = "RECORDING_NOT_FOUND";

  constructor(recordingId: string) {
    super(
      RecordingNotFoundError.code,
      `Recording with id ${recordingId} not found`
    );
  }
}
