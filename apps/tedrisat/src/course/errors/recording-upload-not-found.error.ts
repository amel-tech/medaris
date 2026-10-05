import { NotFoundError } from "@medaris/common";

/** No Bunny upload of this video on this session (MDRS-116). */
export class RecordingUploadNotFoundError extends NotFoundError {
  static readonly code = "RECORDING_UPLOAD_NOT_FOUND";

  constructor(lessonId: string, videoId: string) {
    super(
      RecordingUploadNotFoundError.code,
      `No upload of video ${videoId} on lesson ${lessonId}`
    );
  }
}
