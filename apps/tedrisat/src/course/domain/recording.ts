import { RecordingYoutubePublicOnlyError } from "../errors/recording-youtube-public-only.error";
import { SessionStatus } from "./session-status.enum";

/** Where a lesson recording lives (MDRS-162). Only a link is stored: no API call is made to either host. */
export enum RecordingProvider {
  YOUTUBE = "YOUTUBE",
  DRIVE = "DRIVE",
  OTHER = "OTHER",
}

/** Who may see a recording: everyone with the link, or only the course's own people. */
export enum RecordingVisibility {
  PUBLIC = "PUBLIC",
  ENROLLED = "ENROLLED",
}

/** PROCESSING is a recording the müderris announced but has not published a link for yet. */
export enum RecordingStatus {
  PROCESSING = "PROCESSING",
  READY = "READY",
}

/** A recording as the repository reads it, joined to its lesson's place in the programme. */
export interface IRecordingRow {
  id: string;
  lessonId: string;
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  title: string;
  recordedAt: Date | null;
  durationMinutes: number | null;
  provider: RecordingProvider;
  url: string | null;
  visibility: RecordingVisibility;
  status: RecordingStatus;
}

/** What a caller is told about one recording; `url` is null until it is ready. */
export type IRecordingView = IRecordingRow;

/**
 * The recordings a caller may see, newest week first and, inside a week, the
 * latest recording first (tedris/24 "Haftalara göre, yeniden eskiye").
 *
 * `canReadContent` is the course's content rule (`view_details`). Without it
 * only a recording marked PUBLIC is listed, and none when `publicAllowed` is
 * false: a closed course (MDRS-176) never opens its recordings to everyone.
 * A recording that is still
 * PROCESSING has no link to give, whoever asks.
 */
export function visibleRecordings(
  rows: IRecordingRow[],
  canReadContent: boolean,
  publicAllowed = true
): IRecordingView[] {
  return rows
    .filter(
      (r) =>
        canReadContent ||
        (publicAllowed && r.visibility === RecordingVisibility.PUBLIC)
    )
    .map((r) => ({
      ...r,
      url: r.status === RecordingStatus.READY ? r.url : null,
    }))
    .sort(
      (a, b) =>
        b.weekNumber - a.weekNumber ||
        (b.recordedAt?.getTime() ?? 0) - (a.recordedAt?.getTime() ?? 0)
    );
}

/**
 * The live stream link of a session, which is joinable content: only a caller
 * who may read content, and only while the session is on air.
 */
export function liveStreamFor(
  status: SessionStatus,
  url: string | null,
  canReadContent: boolean
): string | null {
  return canReadContent && status === SessionStatus.LIVE ? url : null;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const onDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

/**
 * Where a pasted link lives, read off its host: nothing is asked of either
 * service. Anything that is not YouTube or Google Drive (a Zoom or Meet
 * recording page, another host) is OTHER.
 */
export function providerOfUrl(url: string): RecordingProvider {
  const host = hostOf(url);
  if (
    onDomain(host, "youtube.com") ||
    onDomain(host, "youtube-nocookie.com") ||
    host === "youtu.be"
  ) {
    return RecordingProvider.YOUTUBE;
  }
  if (onDomain(host, "drive.google.com") || onDomain(host, "docs.google.com")) {
    return RecordingProvider.DRIVE;
  }
  return RecordingProvider.OTHER;
}

/** What a recording holds that its writers can change. */
export interface IRecordingFields {
  title: string;
  url: string;
  visibility: RecordingVisibility;
}

/** A write to a recording: only the keys that are present change. */
export type IRecordingPatch = Partial<IRecordingFields>;

/**
 * The recording a patch leaves behind. A link that is changed is read again
 * for its provider. YouTube takes public recordings only: an enrolled-only
 * one belongs on a host that can keep it private, so a link or a visibility
 * that would leave a YouTube recording ENROLLED is refused. A write that
 * touches neither is not checked, so a title can still be fixed on an older
 * row.
 */
export function applyRecordingPatch(
  current: IRecordingFields & { provider: RecordingProvider },
  patch: IRecordingPatch
): IRecordingFields & { provider: RecordingProvider } {
  const next = {
    title: patch.title ?? current.title,
    url: patch.url ?? current.url,
    visibility: patch.visibility ?? current.visibility,
    provider:
      patch.url === undefined ? current.provider : providerOfUrl(patch.url),
  };
  if (
    (patch.url !== undefined || patch.visibility !== undefined) &&
    next.provider === RecordingProvider.YOUTUBE &&
    next.visibility !== RecordingVisibility.PUBLIC
  ) {
    throw new RecordingYoutubePublicOnlyError();
  }
  return next;
}
