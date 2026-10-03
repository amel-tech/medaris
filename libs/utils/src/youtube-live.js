// The live stream link of a session (MDRS-228): one parser for tedrisat, which
// stores the link, and the web apps, which check it before sending it.
//
// Plain JavaScript with a hand-written `youtube-live.d.ts`, not TypeScript, on
// purpose. The rest of this package is TypeScript source that only bundlers
// read; tedrisat is compiled by `tsc` to CommonJS and runs on Node, which
// cannot load a `.ts` file, and pointing its compiler at this source would
// pull the file into tedrisat's program and move its `dist/` layout. So this
// one file is already runnable: an ES module, which tedrisat `require`s by
// path (`@medaris/utils/src/youtube-live.js`, Node 22.12+ loads an ES module
// through `require`) and the web apps import through `index.ts`. The same
// reason `@medaris/env` is a `.cjs` file. Keep it dependency-free.

/** Where a stored link points: the watch page of the stream's video. */
const LIVE_PREFIX = "https://www.youtube.com/live/";

/** The id rule tedris's player uses (`recordings-model.ts`), so a stored link always embeds. */
const VIDEO_ID = /^[\w-]{6,32}$/;

/** `scheme://` at the start of a link. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** tedrisat's `@MaxLength(500)` on the same field. */
export const LIVE_STREAM_URL_MAX_LENGTH = 500;

/** The first segment of a youtube.com path that names a channel, never a video. */
const CHANNEL_SEGMENTS = new Set(["channel", "c", "user"]);

/**
 * @param {string} id
 * @returns {import("./youtube-live").YoutubeLiveResult}
 */
const video = (id) =>
  id && VIDEO_ID.test(id)
    ? { ok: true, videoId: id, url: `${LIVE_PREFIX}${id}` }
    : { ok: false, problem: "no-video" };

/**
 * Reads a YouTube link as a session's live stream (MDRS-228) and says either
 * which video it is, stored as `https://www.youtube.com/live/<id>`, or why it
 * cannot be one.
 *
 * Accepted, with or without `www.` or `m.`: `youtube.com/watch?v=<id>`,
 * `/live/<id>`, `/embed/<id>`, `youtu.be/<id>`, and the YouTube Studio link
 * `studio.youtube.com/video/<id>/livestreaming` (any suffix after the id),
 * which is the one a müderris has in hand first. A link typed without a
 * scheme is read as `https://`; an `http://` one is refused, as tedrisat
 * refuses every other link that is not https.
 *
 * Refused, with the reason the editor shows: a channel (`/@handle/live`,
 * `/channel/…`, `/c/…`, `/user/…`), which YouTube resolves to whatever that
 * channel streams now and tedris cannot embed; any other host; and a
 * YouTube page that names no video.
 *
 * @param {string | null | undefined} input
 * @returns {import("./youtube-live").YoutubeLiveResult}
 */
export const parseYoutubeLiveUrl = (input) => {
  const value = (input ?? "").trim();
  if (!value) return { ok: false, problem: "empty" };
  if (value.length > LIVE_STREAM_URL_MAX_LENGTH) {
    return { ok: false, problem: "too-long" };
  }
  const withScheme = SCHEME.test(value)
    ? value
    : `https://${value.replace(/^\/+/, "")}`;
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, problem: "invalid" };
  }
  if (parsed.protocol !== "https:") return { ok: false, problem: "not-https" };

  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);
  const [first = "", second = ""] = segments;

  if (host === "youtu.be") return video(first);

  if (host === "studio.youtube.com") {
    if (first === "video") return video(second);
    if (first === "channel") return { ok: false, problem: "channel" };
    return { ok: false, problem: "no-video" };
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (first.startsWith("@") || CHANNEL_SEGMENTS.has(first)) {
      return { ok: false, problem: "channel" };
    }
    if (first === "watch" && segments.length === 1) {
      return video(parsed.searchParams.get("v") ?? "");
    }
    if (first === "live" || first === "embed") return video(second);
    return { ok: false, problem: "no-video" };
  }

  return { ok: false, problem: "not-youtube" };
};

/**
 * The link as it is stored, or `null` when it cannot be a session's stream.
 *
 * @param {string | null | undefined} input
 * @returns {string | null}
 */
export const normalizeYoutubeLiveUrl = (input) => {
  const result = parseYoutubeLiveUrl(input);
  return result.ok ? result.url : null;
};
