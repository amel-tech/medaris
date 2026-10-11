import type { LessonResponse } from "@medaris/services/tedrisat";
import { resolveMeetingPlatform } from "@medaris/utils";

/**
 * How a celse is attended (MDRS-283), as one rule for every screen of nizam
 * that says it: Celseler's "Katılım" column, a course's Genel bakış, the köşk
 * home page and Müfredat. A celse has three ways in: its meeting link, its
 * live stream and the in-person mark (the course's, unless the celse has its
 * own).
 *
 * Owner, 2026-10-11: a celse is covered when it has any one of the three; only
 * a celse still ahead, not cancelled, with none of them is flagged. tedrisat
 * counts the köşk home page's alert by the same rule (`withoutAccessSql`), and
 * nazar draws it the same way (its `features/sessions/attendance.ts`). Pure on
 * purpose, so the tables have nothing to decide.
 */

export interface AttendanceFacts {
  /** the meeting link; null for none */
  meeting: string | null;
  /** a live stream link is set; the course read never carries the link to tell */
  hasLiveStream: boolean;
  /** held in person: the celse's own mark, else the course's */
  inPerson: boolean;
}

/** Whether a celse has a way in: a meeting link, a live stream or the in-person mark. */
export const hasAccess = (facts: AttendanceFacts): boolean =>
  Boolean(facts.meeting?.trim()) || facts.hasLiveStream || facts.inPerson;

/** What "Katılım" draws for one celse, in the order it is read. */
export interface AttendanceView {
  /** "Yüz yüze" */
  inPerson: boolean;
  /** the meeting platform, read off the link's host */
  platform: { id: string; host: string } | null;
  /** "YouTube yayını" beside another way in, "Yalnız yayın" when it is the only one */
  stream: "beside" | "alone" | null;
  /**
   * None of the three: "missing" (the warning) for a celse still ahead, which
   * a link added now would serve; "none" (plain words) for one under way or
   * over, which nothing counts.
   */
  lack: "missing" | "none" | null;
}

/** The host of a link, or the text itself when it cannot be read. */
export function hostOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch {
    return value;
  }
}

/** "Katılım" of one celse; `ahead`: it has not started, so a celse with no way in is flagged. */
export function attendanceView(
  facts: AttendanceFacts,
  ahead: boolean
): AttendanceView {
  const meeting = facts.meeting?.trim() || null;
  const platform = meeting
    ? { id: resolveMeetingPlatform(meeting).id, host: hostOf(meeting) }
    : null;
  return {
    inPerson: facts.inPerson,
    platform,
    stream: facts.hasLiveStream
      ? platform || facts.inPerson
        ? "beside"
        : "alone"
      : null,
    lack: hasAccess(facts) ? null : ahead ? "missing" : "none",
  };
}

/**
 * The attendance a course read carries for one of its celseler, or null when
 * it carries none: a content-locked read sends no meeting link, no stream and
 * no in-person mark (`inPerson` absent), so nothing can be said of the celse
 * and it is never flagged.
 */
export function lessonAttendance(
  lesson: Pick<LessonResponse, "meetingUrl" | "hasLiveStream" | "inPerson">
): AttendanceFacts | null {
  if (lesson.inPerson === undefined || lesson.inPerson === null) return null;
  return {
    meeting: lesson.meetingUrl ?? null,
    hasLiveStream: lesson.hasLiveStream === true,
    inPerson: lesson.inPerson,
  };
}
