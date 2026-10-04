import { RecordingLinkInvalidError } from "../errors/recording-link-invalid.error";
import { RecordingProvider } from "./recording";

/**
 * What a pasted recording link is stored as (MDRS-119), per provider. The
 * `lesson_recordings_provider_columns` CHECK (migration 0047) wants a URL for
 * every provider but BUNNY and a `bunny_video_id` with no URL for BUNNY; it
 * also wants a BUNNY row's `upload_expires_at`, which a write endpoint storing
 * a pasted Bunny link must fill. There is no `youtube_video_id` column yet:
 * `youtubeVideoId` is returned for the caller, not stored.
 *
 * - YOUTUBE: the watch link rebuilt from the video id, so a tracking query
 *   (`si=`, `feature=`) or a `/live/` or `/shorts/` form is never stored, and
 *   the id itself.
 * - BUNNY: the video id in our own library, never a URL; the player link is
 *   signed each time the recording is read.
 * - DRIVE and OTHER: the link as pasted (trimmed). Anyone holding such a link
 *   can open it: our authorization decides who is shown it, not who can play
 *   it.
 */
export type DetectedRecordingLink =
  | { provider: RecordingProvider.YOUTUBE; url: string; youtubeVideoId: string }
  | { provider: RecordingProvider.BUNNY; bunnyVideoId: string }
  | {
      provider: RecordingProvider.DRIVE | RecordingProvider.OTHER;
      url: string;
    };

/** Why a pasted link was refused; the error's `reason`, so nazir can word it. */
export type RecordingLinkProblem =
  /** not a link, or one with a user name or password in it */
  | "invalid"
  /** `http://` or any other scheme */
  | "not-https"
  /** a YouTube page that names no video (a channel, a playlist, the home page) */
  | "youtube-no-video"
  /** a Bunny player link without a library id and a video id */
  | "bunny-no-video"
  /** a Bunny player link of a library that is not ours, or no library is configured */
  | "bunny-foreign-library";

/** tedrisat's limit on a stored link, as on the live stream link (MDRS-228). */
export const RECORDING_LINK_MAX_LENGTH = 500;

/** The id rule tedris's player uses (`apps/tedris/features/courses/recordings-model.ts`). */
const YOUTUBE_VIDEO_ID = /^[\w-]{6,32}$/;

/** A Bunny library id is numeric; a video id is the GUID Bunny gave it. */
const BUNNY_LIBRARY_ID = /^\d+$/;
const BUNNY_VIDEO_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bunny's player hosts: the current one and the one its older embed codes use. */
const BUNNY_PLAYER_HOSTS = new Set([
  "player.mediadelivery.net",
  "iframe.mediadelivery.net",
]);

/** The paths of a Bunny player link that name a video: `/embed/<lib>/<vid>`, `/play/<lib>/<vid>`. */
const BUNNY_PLAYER_PATHS = new Set(["embed", "play"]);

const onDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

/** The video id of a YouTube link, or null (the same forms tedris's player reads). */
function youtubeVideoIdOf(url: URL, host: string): string | null {
  const [first = "", second = ""] = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = first;
  else if (first === "watch") id = url.searchParams.get("v");
  else if (first === "live" || first === "shorts" || first === "embed") {
    id = second;
  }
  return id && YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

/**
 * Reads a pasted recording link (MDRS-119): which provider it is and what is
 * stored for it, or a `RecordingLinkInvalidError` (400) saying why not. Pure:
 * nothing is asked of any host.
 *
 * - YouTube (`youtube.com`, `youtube-nocookie.com`, `youtu.be`, any
 *   subdomain): `watch?v=<id>`, `youtu.be/<id>`, `/live/<id>`,
 *   `/shorts/<id>` and `/embed/<id>`. A YouTube page that names no video is
 *   refused. No visibility rule is applied: the owner dropped "a YouTube
 *   recording is always PUBLIC" on 3 October.
 * - Bunny (`player.mediadelivery.net` or `iframe.mediadelivery.net`,
 *   `/embed/<libraryId>/<videoId>` or `/play/…`): accepted only when the
 *   library is `ownLibraryId`, and only the video id is kept. A link of any
 *   other library, or any Bunny link while no library is configured
 *   (`ownLibraryId` null), is refused: tedrisat could not sign it, and a
 *   foreign library's token settings are not ours to rely on. Its query
 *   string (a token someone else signed) is dropped.
 * - Google Drive or Docs: DRIVE. Anything else https: OTHER.
 */
export function detectRecordingLink(
  input: string,
  ownLibraryId: string | null
): DetectedRecordingLink {
  const value = input.trim();
  if (!value || value.length > RECORDING_LINK_MAX_LENGTH) {
    throw new RecordingLinkInvalidError("invalid");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RecordingLinkInvalidError("invalid");
  }
  if (url.protocol !== "https:") {
    throw new RecordingLinkInvalidError("not-https");
  }
  if (url.username || url.password) {
    throw new RecordingLinkInvalidError("invalid");
  }
  const host = url.hostname.toLowerCase();

  if (
    host === "youtu.be" ||
    onDomain(host, "youtube.com") ||
    onDomain(host, "youtube-nocookie.com")
  ) {
    const id = youtubeVideoIdOf(url, host);
    if (!id) throw new RecordingLinkInvalidError("youtube-no-video");
    return {
      provider: RecordingProvider.YOUTUBE,
      url: `https://www.youtube.com/watch?v=${id}`,
      youtubeVideoId: id,
    };
  }

  if (BUNNY_PLAYER_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const [kind = "", libraryId = "", videoId = ""] = segments;
    if (
      segments.length !== 3 ||
      !BUNNY_PLAYER_PATHS.has(kind) ||
      !BUNNY_LIBRARY_ID.test(libraryId) ||
      !BUNNY_VIDEO_ID.test(videoId)
    ) {
      throw new RecordingLinkInvalidError("bunny-no-video");
    }
    if (ownLibraryId === null || libraryId !== ownLibraryId) {
      throw new RecordingLinkInvalidError("bunny-foreign-library");
    }
    return {
      provider: RecordingProvider.BUNNY,
      bunnyVideoId: videoId.toLowerCase(),
    };
  }

  if (onDomain(host, "drive.google.com") || onDomain(host, "docs.google.com")) {
    return { provider: RecordingProvider.DRIVE, url: value };
  }
  return { provider: RecordingProvider.OTHER, url: value };
}
