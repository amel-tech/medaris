import type { RecordingResponse } from "@medaris/services/tedrisat";

/**
 * What the recordings tab and the session page derive from a recording
 * (MDRS-162). Pure: a spec pins every rule.
 *
 * tedris sends no Content Security Policy today. One added later must allow
 * the players these pages frame in `frame-src` (MDRS-114):
 * `https://player.mediadelivery.net` (Bunny) and
 * `https://www.youtube-nocookie.com` (YouTube), plus
 * `https://drive.google.com` (a Drive recording on the session page) and
 * `https://www.youtube.com` (the live chat, MDRS-229).
 */

const ID = /^[\w-]{6,32}$/;

/** Bunny's player, the only host a Bunny recording is framed from (MDRS-114). */
const BUNNY_PLAYER_ORIGIN = "https://player.mediadelivery.net";

/** `/embed/<library id>/<video id>`: a numeric library, the GUID Bunny gave the video. */
const BUNNY_EMBED_PATH =
  /^\/embed\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** tedrisat's signature and nothing else: a SHA-256 hex token and a Unix expiry. */
const BUNNY_SIGNED_QUERY =
  /^\?(?:token=[0-9a-f]{64}&expires=\d+|expires=\d+&token=[0-9a-f]{64})$/;

const parse = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
};

/** The video id of a YouTube link (`watch?v=`, `/embed/`, `/live/`, `/shorts/`, `youtu.be/`), or null. */
const youtubeIdOf = (parsed: URL): string | null => {
  const host = parsed.hostname.replace(/^(www|m)\./, "");
  let id: string | null | undefined = null;
  if (host === "youtu.be") id = parsed.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      parsed.pathname === "/watch"
        ? parsed.searchParams.get("v")
        : /^\/(?:embed|live|shorts)\/([^/?]+)/.exec(parsed.pathname)?.[1];
  }
  return id && ID.test(id) ? id : null;
};

/**
 * The signed player link tedrisat returned for this viewer (MDRS-119),
 * exactly as it came, or null when it is anything but
 * `https://player.mediadelivery.net/embed/<library id>/<video id>?token=<t>&expires=<unix seconds>`:
 * another host or port, credentials, a fragment, a query key besides the two,
 * an unsigned link, or a string the URL parser would write differently (so the
 * string checked is the string framed). It is never rebuilt from parts: the
 * token in it is this viewer's.
 */
export const bunnyPlayerUrlOf = (
  url: string | null | undefined
): string | null => {
  const parsed = url ? parse(url) : null;
  if (!url || !parsed || parsed.href !== url) return null;
  return parsed.origin === BUNNY_PLAYER_ORIGIN &&
    !parsed.username &&
    !parsed.password &&
    !url.includes("#") &&
    BUNNY_EMBED_PATH.test(parsed.pathname) &&
    BUNNY_SIGNED_QUERY.test(parsed.search)
    ? url
    : null;
};

/**
 * The address a recording or a live stream is embedded from, or null when the
 * link cannot be embedded safely. A YouTube or Drive address is built from the
 * video id alone (`youtube-nocookie.com`, `drive.google.com`): nothing of the
 * stored link, its query string included, reaches the `src` of the frame. A
 * Bunny address is the signed link itself, once `bunnyPlayerUrlOf` accepts it.
 */
export const embedUrlOf = (
  provider: string,
  url: string | null | undefined
): string | null => {
  if (provider === "BUNNY") return bunnyPlayerUrlOf(url);
  const parsed = url ? parse(url) : null;
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^(www|m)\./, "");

  if (provider === "YOUTUBE") {
    const id = youtubeIdOf(parsed);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }

  if (provider === "DRIVE" && host === "drive.google.com") {
    const id = /^\/file\/d\/([^/]+)/.exec(parsed.pathname)?.[1];
    return id && ID.test(id)
      ? `https://drive.google.com/file/d/${id}/preview`
      : null;
  }
  return null;
};

/**
 * The embed address with YouTube's IFrame Player API switched on
 * (`enablejsapi=1`), which the notes panel needs to read the position
 * (MDRS-150). Only the YouTube embed gets it; any other address comes back as
 * it was.
 */
export const playerApiUrlOf = (embedUrl: string | null): string | null =>
  embedUrl?.startsWith("https://www.youtube-nocookie.com/embed/")
    ? `${embedUrl}?enablejsapi=1`
    : embedUrl;

/** Whether the live stream link can be framed: the same hosts as a YouTube recording. */
export const liveEmbedUrlOf = (url: string | null | undefined) =>
  embedUrlOf("YOUTUBE", url);

export type RecordingAction = "play" | "open" | "none";

/**
 * What a list row offers (tedris/24): a YouTube or Bunny recording (MDRS-114)
 * plays in the page's player, any other ready one opens at its host in a new
 * tab, as does one whose link cannot be framed; one that is still being
 * prepared offers nothing.
 */
export const recordingAction = (
  recording: Pick<RecordingResponse, "provider" | "status" | "url">
): RecordingAction => {
  if (recording.status !== "READY" || !recording.url) return "none";
  return embedUrlOf(recording.provider, recording.url) &&
    (recording.provider === "YOUTUBE" || recording.provider === "BUNNY")
    ? "play"
    : "open";
};

export interface RecordingWeekGroup {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  items: RecordingResponse[];
}

/**
 * The list grouped by week, in the order the API sent: newest week first,
 * newest recording first inside it (tedris/24, "Haftalara göre, yeniden
 * eskiye").
 */
export const groupByWeek = (
  recordings: RecordingResponse[]
): RecordingWeekGroup[] => {
  const groups: RecordingWeekGroup[] = [];
  for (const rec of recordings) {
    const last = groups.at(-1);
    if (last && last.weekId === rec.weekId) last.items.push(rec);
    else
      groups.push({
        weekId: rec.weekId,
        weekNumber: rec.weekNumber,
        weekTitle: rec.weekTitle,
        items: [rec],
      });
  }
  return groups;
};

/** The recording the player starts on: the newest one that plays in it. */
export const firstPlayable = (
  recordings: RecordingResponse[]
): RecordingResponse | null =>
  recordings.find((r) => recordingAction(r) === "play") ?? null;

/**
 * Whether the tab lists the recordings under its player (MDRS-280): when
 * there is more than one to choose from, or when the only one does not play
 * in the frame (it opens at its host or is still being prepared) and the list
 * is the only place it appears. A lone recording that is already playing
 * above is not listed a second time.
 */
export const listsRecordings = (recordings: RecordingResponse[]): boolean =>
  recordings.length > 1 || firstPlayable(recordings) === null;

const WEEK_WORD = "(?:hafta|week|الأسبوع|أسبوع)";

/**
 * Whether a week's title only says which week it is: empty, "Hafta 3",
 * "3. hafta", "Week 3" (any case, leading zeros). The list then prints the
 * week once, as its label, instead of "Hafta 3" over "Hafta 3" (MDRS-280).
 */
export const isPlainWeekTitle = (
  title: string,
  weekNumber: number
): boolean => {
  const value = title.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
  if (value === "") return true;
  const n = `0*${weekNumber}`;
  return new RegExp(
    `^(?:${WEEK_WORD} ?${n}|${n}\\.? ?${WEEK_WORD})$`,
    "u"
  ).test(value);
};

/** The address of a course's recordings tab. */
export const recordingsTabPath = (courseId: string): string =>
  `/courses/${courseId}?tab=kayitlar`;

/**
 * YouTube's own live chat for a stream (MDRS-229), framed under the player.
 * `embed_domain` must be the embedding page's host or YouTube refuses the
 * frame, so the caller passes `window.location.hostname`. `dark_theme=1` is
 * undocumented but honoured: it draws the chat on a dark ground for a dark
 * page. Like `embedUrlOf`, only the video id of the stored link is used.
 */
export const liveChatUrlOf = (
  url: string | null | undefined,
  { host, dark }: { host: string; dark: boolean }
): string | null => {
  const parsed = url ? parse(url) : null;
  const id = parsed ? youtubeIdOf(parsed) : null;
  if (!id || !host) return null;
  const chat = new URL("https://www.youtube.com/live_chat");
  chat.searchParams.set("v", id);
  chat.searchParams.set("embed_domain", host);
  if (dark) chat.searchParams.set("dark_theme", "1");
  return chat.toString();
};

/**
 * The same chat as YouTube's own page, to open in a tab of its own. There the
 * viewer's YouTube sign-in is first-party, so they can write where the browser
 * keeps YouTube's cookies out of a frame on another site (Firefox's Total
 * Cookie Protection, Safari, a private window) and the framed chat asks them
 * to sign in although they are.
 */
export const liveChatPopoutUrlOf = (
  url: string | null | undefined
): string | null => {
  const parsed = url ? parse(url) : null;
  const id = parsed ? youtubeIdOf(parsed) : null;
  if (!id) return null;
  const chat = new URL("https://www.youtube.com/live_chat");
  chat.searchParams.set("is_popout", "1");
  chat.searchParams.set("v", id);
  return chat.toString();
};
