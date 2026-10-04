import { ConflictError } from "@medaris/common";

/**
 * A Bunny upload can be signed again only while it is still PROCESSING and
 * inside its original lifetime (MDRS-116): re-signing never extends it, so
 * past `AuthorizationExpire` Bunny would refuse the bytes anyway. `reason`
 * is `not-processing` (READY or FAILED already) or `expired`.
 */
export class RecordingUploadClosedError extends ConflictError {
  static readonly code = "RECORDING_UPLOAD_CLOSED";

  constructor(videoId: string, reason: "not-processing" | "expired") {
    super(
      RecordingUploadClosedError.code,
      `The upload of video ${videoId} can no longer be resumed (${reason})`,
      { reason }
    );
  }
}
