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
 * `canReadContent` is the course's content rule (`course.view_details`). Without it
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
