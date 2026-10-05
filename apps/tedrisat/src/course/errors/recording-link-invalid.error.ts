import { BadRequestError } from "@medaris/common";
import type { RecordingLinkProblem } from "../domain/recording-link";

const MESSAGES: Record<RecordingLinkProblem, string> = {
  invalid: "The recording link is not a link",
  "not-https": "The recording link must be an https link",
  "youtube-no-video":
    "The YouTube link names no video: copy the link of the video itself",
  "bunny-no-video":
    "The Bunny link names no video: copy the player link of the video",
  "bunny-foreign-library":
    "The Bunny link is not from the Medaris video library",
  "bunny-video-used":
    "The Bunny video is already the recording of another session",
};

/**
 * A pasted recording link that cannot be stored (MDRS-119). `reason` is
 * `detectRecordingLink`'s problem, or `bunny-video-used` when the write finds
 * the Bunny video already held by another session's recording (MDRS-247), so
 * a client can word it its own way.
 */
export class RecordingLinkInvalidError extends BadRequestError {
  static readonly code = "RECORDING_LINK_INVALID";

  constructor(readonly reason: RecordingLinkProblem) {
    super(RecordingLinkInvalidError.code, MESSAGES[reason], { reason });
  }
}
