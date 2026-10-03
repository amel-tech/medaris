// Types of `youtube-live.js`; see that file for why it is JavaScript.

/** Why a link cannot be a session's live stream. */
export type YoutubeLiveProblem =
  /** nothing was typed */
  | "empty"
  /** longer than tedrisat stores */
  | "too-long"
  /** not a link at all */
  | "invalid"
  /** `http://` or another scheme */
  | "not-https"
  /** a host other than YouTube */
  | "not-youtube"
  /** a channel page: a video link is needed */
  | "channel"
  /** a YouTube page that names no video */
  | "no-video";

export type YoutubeLiveResult =
  | { ok: true; videoId: string; url: string }
  | { ok: false; problem: YoutubeLiveProblem };

export declare const LIVE_STREAM_URL_MAX_LENGTH: 500;

export declare const parseYoutubeLiveUrl: (
  input: string | null | undefined
) => YoutubeLiveResult;

export declare const normalizeYoutubeLiveUrl: (
  input: string | null | undefined
) => string | null;
