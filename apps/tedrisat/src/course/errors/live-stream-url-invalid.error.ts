import { BadRequestError } from "@medaris/common";
import type { YoutubeLiveProblem } from "@medaris/utils/src/youtube-live.js";

const MESSAGES: Record<YoutubeLiveProblem, string> = {
  empty: "The live stream link is empty; send null to clear it",
  "too-long": "The live stream link is too long",
  invalid: "The live stream link is not a link",
  "not-https": "The live stream link must be an https link",
  "not-youtube": "The live stream link must be a YouTube link",
  channel:
    "A YouTube video link is needed, not a channel link: start the stream and copy its video or YouTube Studio link",
  "no-video": "The YouTube link names no video",
};

/**
 * A session's live stream link that is not a YouTube video (MDRS-228).
 * `problem` is `parseYoutubeLiveUrl`'s reason, so a client can word it the
 * way its own check would.
 */
export class LiveStreamUrlInvalidError extends BadRequestError {
  static readonly code = "LIVE_STREAM_URL_INVALID";

  constructor(problem: YoutubeLiveProblem) {
    super(LiveStreamUrlInvalidError.code, MESSAGES[problem], { problem });
  }
}
