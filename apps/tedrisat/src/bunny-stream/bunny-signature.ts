import { createHash } from "node:crypto";

/** Bunny Stream's TUS endpoint: the browser uploads the file here, never to tedrisat. */
export const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

/** Bunny's documentation wants a TUS signature to expire at least this far ahead. */
export const MIN_UPLOAD_LIFETIME_SECONDS = 3600;

/** What Bunny's own examples use, and what tedrisat signs for: 24 hours. */
export const DEFAULT_UPLOAD_LIFETIME_SECONDS = 24 * 3600;

/** Bunny's player, which a recording's link opens in an iframe (MDRS-119). */
export const BUNNY_PLAYER_ORIGIN = "https://player.mediadelivery.net";

/**
 * How long a player link stays valid once a recording is read, unless
 * `BUNNY_STREAM_EMBED_TTL_SECONDS` says otherwise (MDRS-119): 6 hours.
 */
export const DEFAULT_EMBED_LINK_LIFETIME_SECONDS = 6 * 3600;

/**
 * The bounds `BUNNY_STREAM_EMBED_TTL_SECONDS` must keep to. Below a minute the
 * player could refuse a link before the page has even framed it; above a week
 * a link that was passed on opens the player page for too long. The expiry
 * bounds the player page only: measured on a dev library, the stream behind it
 * (playlist, segments, MP4 fallback) answers any request that carries a
 * Referer header unless the library's CDN token authentication is on (see
 * docs/migration/mdrs-119-signed-playback.md).
 */
export const MIN_EMBED_LINK_LIFETIME_SECONDS = 60;
export const MAX_EMBED_LINK_LIFETIME_SECONDS = 7 * 24 * 3600;

const sha256Hex = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

/**
 * The `AuthorizationExpire` of a new upload, in Unix seconds. A lifetime
 * below Bunny's minimum is a programming error, so it throws rather than
 * signing an upload Bunny would refuse.
 */
export function uploadExpiry(
  now: Date,
  lifetimeSeconds: number = DEFAULT_UPLOAD_LIFETIME_SECONDS
): number {
  if (
    !Number.isInteger(lifetimeSeconds) ||
    lifetimeSeconds < MIN_UPLOAD_LIFETIME_SECONDS
  ) {
    throw new RangeError(
      `A Bunny upload must live at least ${MIN_UPLOAD_LIFETIME_SECONDS} seconds, got ${lifetimeSeconds}`
    );
  }
  return Math.floor(now.getTime() / 1000) + lifetimeSeconds;
}

/**
 * Bunny's TUS `AuthorizationSignature`:
 * `SHA256_HEX(library_id + api_key + expiration_time + video_id)`, the four
 * concatenated with no separator. The API key goes in and only the hash comes
 * out, which is what lets the browser upload without ever holding the key.
 */
export function tusUploadSignature(
  libraryId: string,
  apiKey: string,
  expiresAt: number,
  videoId: string
): string {
  return sha256Hex(`${libraryId}${apiKey}${expiresAt}${videoId}`);
}

/**
 * Bunny's embed view token: `SHA256_HEX(token_key + video_id + expiration)`,
 * sent as `?token=…&expires=…` on the player link when the library has token
 * authentication on.
 */
export function embedViewToken(
  tokenKey: string,
  videoId: string,
  expiresAt: number
): string {
  return sha256Hex(`${tokenKey}${videoId}${expiresAt}`);
}

/**
 * The player link of a video (MDRS-119):
 * `https://player.mediadelivery.net/embed/<libraryId>/<videoId>`, with
 * `?token=<t>&expires=<unix seconds>` when the library has a token key, the
 * expiry `lifetimeSeconds` after `now`. Pure, so a spec pins the vector; the
 * caller decides who is handed one.
 */
export function embedUrl(
  libraryId: string,
  videoId: string,
  tokenKey: string | null,
  now: Date,
  lifetimeSeconds: number = DEFAULT_EMBED_LINK_LIFETIME_SECONDS
): string {
  const base = `${BUNNY_PLAYER_ORIGIN}/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(videoId)}`;
  if (tokenKey === null) return base;
  const expires = Math.floor(now.getTime() / 1000) + lifetimeSeconds;
  const token = embedViewToken(tokenKey, videoId, expires);
  return `${base}?token=${token}&expires=${expires}`;
}

/**
 * Bunny's video `status` codes, as its Stream API documents them. Only the
 * ones tedrisat acts on are named.
 */
export const BUNNY_VIDEO_STATUS = {
  CREATED: 0,
  FINISHED: 4,
  ERROR: 5,
  UPLOAD_FAILED: 6,
  /** Just-in-time encoding: not playable yet. */
  JIT_SEGMENTING: 7,
  /** Just-in-time encoding: Bunny's schema calls this playable. */
  JIT_PLAYLISTS_CREATED: 8,
} as const;

/** What a poll decides for a recording still PROCESSING: done, failed, or keep waiting. */
export type EncodingOutcome = "READY" | "FAILED" | null;

/**
 * Pure: what one Bunny video status means for its recording at `now`.
 *
 * - Finished is READY, and so is JitPlaylistsCreated (a library with
 *   just-in-time encoding plays from there; measured on the dev library, which
 *   has none, a video goes 2, 3, 4 within seconds). Error and UploadFailed are
 *   FAILED.
 * - Created means no complete upload has arrived. Once the upload's lifetime
 *   (`uploadExpiresAt`) has passed nothing more can arrive — re-signing never
 *   extends it — so that is FAILED too.
 * - Every other status (uploaded, processing, transcoding, JIT segmenting, …) keeps waiting,
 *   even past the lifetime: the file arrived in time and is being encoded.
 */
export function encodingOutcome(
  bunnyStatus: number,
  uploadExpiresAt: Date,
  now: Date
): EncodingOutcome {
  if (
    bunnyStatus === BUNNY_VIDEO_STATUS.FINISHED ||
    bunnyStatus === BUNNY_VIDEO_STATUS.JIT_PLAYLISTS_CREATED
  ) {
    return "READY";
  }
  if (
    bunnyStatus === BUNNY_VIDEO_STATUS.ERROR ||
    bunnyStatus === BUNNY_VIDEO_STATUS.UPLOAD_FAILED
  ) {
    return "FAILED";
  }
  if (
    bunnyStatus === BUNNY_VIDEO_STATUS.CREATED &&
    now.getTime() >= uploadExpiresAt.getTime()
  ) {
    return "FAILED";
  }
  return null;
}
