import { type SessionTiming, scheduledEnd } from "./session-view";

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

/** How a new Bunny upload was asked for (`POST /lessons/:id/recordings/uploads`). */
export interface IUploadIntent {
  /**
   * Sent by "Düzenle" of a Bunny recording: the new video takes the place of
   * the recording's video, whatever its status. "Kayıt ekle" never sends it.
   */
  replaceVideo?: boolean;
}

/**
 * Whether a new Bunny upload may take the place of a session's recording
 * (`POST /lessons/:id/recordings/uploads`): a pasted or stream link, of any
 * provider but BUNNY, or a Bunny upload that FAILED. The owner added a
 * session's stream as its recording, found the stream private and had no way
 * left to upload its video instead (12 October): a link now gives way to an
 * upload. Without `replaceVideo` a Bunny video PROCESSING or READY is kept:
 * two people adding at once still collide. With it (13 October, "yanlış dosya
 * yüklemiş olsak değiştiremeyecek miyiz?") a Bunny video in any status gives
 * way too, PROCESSING included, so an upload stopped with "İptal" is not
 * stuck until its 24 hours pass; the video it replaces is queued for deletion
 * from Bunny. Asked before Bunny is called and again under the lesson's lock.
 */
export function uploadReplaces(
  recording: Pick<IRecordingRow, "provider" | "status">,
  intent: IUploadIntent = {}
): boolean {
  return (
    recording.provider !== RecordingProvider.BUNNY ||
    recording.status === RecordingStatus.FAILED ||
    intent.replaceVideo === true
  );
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
  /**
   * When talebe may watch it (MDRS-288): its session's release time, set by
   * the course team; null opens it as soon as it is READY.
   */
  availableAt: Date | null;
}

/** What a caller is told about one recording; `url` is null until it is ready. */
export type IRecordingView = IRecordingRow;

/**
 * Who reads a recording, as far as its release time goes (MDRS-288): the
 * read's clock, and whether the caller is the course team, who see and play
 * a recording before its talebe may.
 */
export interface IRecordingReader {
  now: Date;
  /** Holds `recording.manage` on the course, or the başnazım's bypass. */
  team: boolean;
}

/**
 * Open to talebe (MDRS-288): READY, and its session's release time, when one
 * is set, has come. The one place the release time is read: the reads that
 * hand out a recording link, the stream rule below and the announcement of
 * a recording all ask this, or its SQL twin in `RecordingRepository`.
 */
export function isReleased(
  recording: Pick<IRecordingRow, "status" | "availableAt">,
  now: Date
): boolean {
  return (
    recording.status === RecordingStatus.READY &&
    (!recording.availableAt || recording.availableAt.getTime() <= now.getTime())
  );
}

/**
 * Whether `reader` is handed the recording's link, a Bunny one signed for
 * them included: READY, and released or read by the course team. Before its
 * release time a talebe or a visitor is told of the recording and its
 * `availableAt`, never its link (MDRS-288).
 */
export function mayPlay(
  recording: Pick<IRecordingRow, "status" | "availableAt">,
  reader: IRecordingReader
): boolean {
  return (
    recording.status === RecordingStatus.READY &&
    (reader.team || isReleased(recording, reader.now))
  );
}

/**
 * The recordings a caller may see, newest week first and, inside a week, the
 * latest recording first (tedris/24 "Haftalara göre, yeniden eskiye").
 *
 * `canReadContent` is the course's content rule (`course.view_details`). Without it
 * only a recording marked PUBLIC is listed, and none when `publicAllowed` is
 * false: a closed course (MDRS-176) never opens its recordings to everyone.
 * A recording that is still
 * PROCESSING has no link to give, whoever asks. A FAILED one (a Bunny upload
 * that was never completed or could not be encoded, MDRS-116) is not listed
 * at all: there is nothing to play or wait for, and a reader would otherwise
 * be shown "Hazırlanıyor" for good. The müderris retries it through the
 * upload route. A READY one whose release time has not come is listed with
 * its `availableAt` and no link, except to the course team (`mayPlay`,
 * MDRS-288). A call that names no `reader` is read as a talebe's, now.
 */
export function visibleRecordings(
  rows: IRecordingRow[],
  canReadContent: boolean,
  publicAllowed = true,
  reader: IRecordingReader = { now: new Date(), team: false }
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
      url: mayPlay(r, reader) ? r.url : null,
    }))
    .sort(
      (a, b) =>
        b.weekNumber - a.weekNumber ||
        (b.recordedAt?.getTime() ?? 0) - (a.recordedAt?.getTime() ?? 0)
    );
}

/**
 * How long after a session's scheduled end its stream link is still sent when
 * no released recording has replaced it (MDRS-285). A PROPOSAL, NOT AN OWNER
 * DECISION: the owner decided that a lesson ends when its stream ends, which
 * only each viewer's player learns, and the issue proposed this bound for a
 * session that never gets a recording. Change it here and nowhere else.
 */
export const LIVE_STREAM_HOURS_AFTER_END = 24;

/**
 * The live stream link of a session, which is joinable content: only a caller
 * who may read content gets it, from the scheduled start until the session
 * has a recording open to talebe (MDRS-285; MDRS-288: `isReleased`, READY and
 * past its release time). It used to stop when the clock said the session was
 * over, which cut a lesson that ran long off mid-stream; the end of a stream
 * is now learned by the viewer's player, never by the server. A PROCESSING or
 * FAILED recording has nothing to play yet, and a READY one held back until
 * its release time plays for the course team alone, so the stream stays.
 * With no released recording it stops `LIVE_STREAM_HOURS_AFTER_END` hours
 * after the scheduled end. A cancelled session, or one with no time, has none.
 */
export function liveStreamFor(
  session: SessionTiming,
  url: string | null,
  recording: Pick<IRecordingRow, "status" | "availableAt"> | null,
  canReadContent: boolean,
  now: Date
): string | null {
  if (!canReadContent || url === null) return null;
  if (session.cancelledAt || !session.scheduledAt) return null;
  if (recording && isReleased(recording, now)) return null;
  const at = now.getTime();
  const stop =
    scheduledEnd(session.scheduledAt, session.durationMinutes) +
    LIVE_STREAM_HOURS_AFTER_END * 3_600_000;
  return at >= session.scheduledAt.getTime() && at < stop ? url : null;
}
