import { BadRequestError } from "@medaris/common";

/**
 * A YouTube link that is not marked PUBLIC. YouTube is for public recordings
 * only; a recording for the course's own people goes to a host that can keep
 * it private.
 */
export class RecordingYoutubePublicOnlyError extends BadRequestError {
  static readonly code = "RECORDING_YOUTUBE_PUBLIC_ONLY";

  constructor() {
    super(
      RecordingYoutubePublicOnlyError.code,
      "A YouTube recording must be PUBLIC; use another host for one only the enrolled may watch"
    );
  }
}
