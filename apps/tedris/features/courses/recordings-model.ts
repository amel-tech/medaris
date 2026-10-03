import type { RecordingResponse } from "@medaris/services/tedrisat";

/**
 * What the recordings tab and the session page derive from a recording
 * (MDRS-162). Pure: a spec pins every rule.
 */

const ID = /^[\w-]{6,32}$/;

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
 * The address a recording or a live stream is embedded from, or null when the
 * link cannot be embedded safely. Only the two hosts the page frames are ever
 * returned (`youtube-nocookie.com`, `drive.google.com`), built from the video
 * id alone: nothing of the stored link, its query string included, reaches the
 * `src` of the frame.
 */
export const embedUrlOf = (
  provider: string,
  url: string | null | undefined
): string | null => {
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

/** Whether the live stream link can be framed: the same hosts as a YouTube recording. */
export const liveEmbedUrlOf = (url: string | null | undefined) =>
  embedUrlOf("YOUTUBE", url);

export type RecordingAction = "play" | "open" | "none";

/**
 * What a list row offers (tedris/24): a YouTube recording plays in the page's
 * player, any other ready one opens at its host in a new tab, one that is
 * still being prepared offers nothing.
 */
export const recordingAction = (
  recording: Pick<RecordingResponse, "provider" | "status" | "url">
): RecordingAction => {
  if (recording.status !== "READY" || !recording.url) return "none";
  return embedUrlOf(recording.provider, recording.url) &&
    recording.provider === "YOUTUBE"
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
