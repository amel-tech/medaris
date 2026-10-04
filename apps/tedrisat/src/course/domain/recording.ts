import { SessionStatus } from "./session-status.enum";

/**
 * Where a lesson recording lives. YOUTUBE, DRIVE and OTHER are links the
 * staff paste (MDRS-162): no API call is made to those hosts. BUNNY is a video
 * uploaded to the Medaris Bunny Stream library through tedrisat (MDRS-116):
 * the row carries the library's video id, never a URL, and the player link is
 * built when the recording is read.
 */
export enum RecordingProvider {
  YOUTUBE = "YOUTUBE",
  DRIVE = "DRIVE",
  OTHER = "OTHER",
  BUNNY = "BUNNY",
}

/** Who may see a recording: everyone with the link, or only the course's own people. */
export enum RecordingVisibility {
  PUBLIC = "PUBLIC",
  ENROLLED = "ENROLLED",
}

/**
 * PROCESSING is a recording the müderris announced but has not published a
 * link for yet, or a Bunny upload that is still uploading or encoding.
 * FAILED is a Bunny upload that Bunny could not encode, or that was never
 * completed within its upload lifetime (MDRS-116).
 */
export enum RecordingStatus {
  PROCESSING = "PROCESSING",
  READY = "READY",
  FAILED = "FAILED",
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
 * PROCESSING has no link to give, whoever asks. A FAILED one (a Bunny upload
 * that was never completed or could not be encoded, MDRS-116) is not listed
 * at all: there is nothing to play or wait for, and a reader would otherwise
 * be shown "Hazırlanıyor" for good. The müderris retries it through the
 * upload route.
 */
export function visibleRecordings(
  rows: IRecordingRow[],
  canReadContent: boolean,
  publicAllowed = true
): IRecordingView[] {
  return rows
    .filter(
      (r) =>
        r.status !== RecordingStatus.FAILED &&
        (canReadContent ||
          (publicAllowed && r.visibility === RecordingVisibility.PUBLIC))
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
