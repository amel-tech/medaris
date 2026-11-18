import type { LessonViewResponse } from "@medaris/services/tedrisat";

/**
 * The talebe's watch records (MDRS-248, "sayaç çalışmıyor"): what the course
 * programme and the watch page say from them, and when the watch page reports
 * the player's position. Pure and clock-free: a spec pins every rule.
 */

/** How often a playing video's position is sent, in milliseconds. */
export const REPORT_EVERY_MS = 15_000;

/** A position closer to the start than this is not offered to resume. */
const RESUME_MIN_SECONDS = 10;

/** The programme's mark of one celse. */
export type WatchMark =
  | { kind: "watched" }
  | { kind: "percent"; percent: number }
  | { kind: "started"; positionSeconds: number };

/** The records by celse id. */
export const viewsByLesson = (
  views: readonly LessonViewResponse[] | null | undefined
): ReadonlyMap<string, LessonViewResponse> =>
  new Map((views ?? []).map((view) => [view.lessonId, view]));

/**
 * What the programme says of a celse: "İzlendi" once it counts as watched,
 * the share played while its length is known, else where the player was. A
 * celse never played, or played less than a few seconds, has no mark.
 */
export const watchMarkOf = (
  view: LessonViewResponse | undefined
): WatchMark | null => {
  if (!view) return null;
  if (view.completedAt) return { kind: "watched" };
  if (view.positionSeconds < RESUME_MIN_SECONDS) return null;
  if (view.durationSeconds) {
    const percent = Math.floor(
      (view.positionSeconds * 100) / view.durationSeconds
    );
    return { kind: "percent", percent: Math.max(1, Math.min(99, percent)) };
  }
  return { kind: "started", positionSeconds: view.positionSeconds };
};

/**
 * Where "Kaldığın yerden devam et" goes, or null when there is nothing to go
 * back to: never played, barely started, or stopped in the last seconds (ten,
 * or a twentieth of a short video, whichever is less).
 */
export const resumeFrom = (
  view: Pick<LessonViewResponse, "positionSeconds" | "durationSeconds"> | null
): number | null => {
  if (!view || view.positionSeconds < RESUME_MIN_SECONDS) return null;
  if (
    view.durationSeconds &&
    view.positionSeconds >=
      view.durationSeconds -
        Math.min(RESUME_MIN_SECONDS, view.durationSeconds / 20)
  ) {
    return null;
  }
  return view.positionSeconds;
};

/** What the page sends to `PUT /lessons/:id/view`. */
export interface ViewReport {
  positionSeconds: number;
  durationSeconds?: number;
  ended?: boolean;
}

/**
 * A report from what the player said, in whole seconds, or null when the
 * position is not a number the API takes. A length that is not a positive
 * number (a player not ready yet says 0) is left out.
 */
export const reportOf = (
  position: number | null | undefined,
  duration: number | null | undefined,
  ended = false
): ViewReport | null => {
  if (position == null || !Number.isFinite(position) || position < 0) {
    return null;
  }
  const report: ViewReport = { positionSeconds: Math.floor(position) };
  if (duration != null && Number.isFinite(duration) && duration >= 1) {
    report.durationSeconds = Math.floor(duration);
  }
  if (ended) report.ended = true;
  return report;
};
