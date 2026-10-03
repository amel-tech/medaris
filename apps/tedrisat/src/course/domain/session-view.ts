import type {
  IAgendaStep,
  ICourseDetailView,
  ILessonView,
  IWeekView,
} from "../course.repository.interface";
import { LessonType } from "./lesson-type.enum";
import type { IRecordingView } from "./recording";
import { SessionStatus } from "./session-status.enum";

/**
 * How long a live session with no recorded length counts as running. The web
 * page assumed the same hour before the status moved to the server, so a
 * session without a length ends when it always did.
 */
export const DEFAULT_SESSION_MINUTES = 60;

/** A neighbouring session, as much of it as a "previous / next" card shows. */
export interface ISessionRef {
  id: string;
  title: string;
  weekNumber: number;
  startsAt: Date | null;
  status: SessionStatus;
}

/** A müderris of the course; the imam is the one the page badges. */
export interface ISessionMuderris {
  name: string;
  title: string | null;
  isImam: boolean;
}

export interface ISessionView extends ISessionRef {
  courseId: string;
  weekId: string;
  weekTitle: string;
  durationMinutes: number | null;
  cancelledAt: Date | null;
  /** Course content: absent for a caller who may not read it. */
  cancelReason?: string | null;
  replacementSessionId: string | null;
  replacement: ISessionRef | null;
  /** Course content: absent for a caller who may not read it. */
  kaynak?: string | null;
  /** Course content: absent for a caller who may not read it. */
  agenda?: IAgendaStep[] | null;
  /**
   * Course content: absent for a caller who may not read it, and null once
   * the session is cancelled or over — there is nothing left to join.
   */
  meetingUrl?: string | null;
  /** Course content; only while the session is LIVE (MDRS-162). */
  liveStreamUrl?: string | null;
  /** Course content: absent for a caller who may not read it (MDRS-162). */
  recording?: Omit<
    IRecordingView,
    "lessonId" | "weekId" | "weekNumber" | "weekTitle"
  > | null;
  previous: ISessionRef | null;
  next: ISessionRef | null;
  /** The course's müderrisler: public, like on the course page. */
  muderris: ISessionMuderris[];
  contentLocked: boolean;
}

/**
 * Where a session stands at `now`. Stored nowhere: a cancellation is the only
 * fact the row holds, the rest follows from its schedule, so the status can
 * never disagree with the clock.
 */
export function sessionStatus(
  lesson: Pick<ILessonView, "cancelledAt" | "scheduledAt" | "durationMinutes">,
  now: Date
): SessionStatus {
  if (lesson.cancelledAt) return SessionStatus.CANCELLED;
  if (!lesson.scheduledAt) return SessionStatus.SCHEDULED;
  const start = lesson.scheduledAt.getTime();
  const end =
    start + (lesson.durationMinutes ?? DEFAULT_SESSION_MINUTES) * 60_000;
  if (now.getTime() >= end) return SessionStatus.ENDED;
  if (now.getTime() >= start) return SessionStatus.LIVE;
  return SessionStatus.SCHEDULED;
}

interface IPlaced {
  week: IWeekView;
  lesson: ILessonView;
}

const refOf = ({ week, lesson }: IPlaced, now: Date): ISessionRef => ({
  id: lesson.id,
  title: lesson.title,
  weekNumber: week.weekNumber,
  startsAt: lesson.scheduledAt,
  status: sessionStatus(lesson, now),
});

/**
 * One live session out of a course detail the caller is already allowed to
 * read, or null when the course has no such live session. Built from
 * the filtered detail on purpose: the content rule has been applied before
 * this runs, so a session cannot carry more than the course page would.
 *
 * Sessions are the course's LIVE lessons in programme order (week, then
 * position in the week). The neighbours skip cancelled sessions: a cancelled
 * session's replacement stands in its place, so "next" from the session
 * before a cancellation is the replacement, as the design shows it.
 */
export function buildSessionView(
  course: ICourseDetailView,
  sessionId: string,
  now: Date,
  imamUserId: string | null = null
): ISessionView | null {
  const sessions: IPlaced[] = course.weeks.flatMap((week) =>
    week.lessons
      .filter((lesson) => lesson.type === LessonType.LIVE)
      .map((lesson) => ({ week, lesson }))
  );
  const index = sessions.findIndex((s) => s.lesson.id === sessionId);
  if (index === -1) return null;
  const { week, lesson } = sessions[index];

  const standing = (placed: IPlaced) => placed.lesson.cancelledAt === null;
  const before = sessions.slice(0, index).filter(standing).at(-1);
  const after = sessions.slice(index + 1).find(standing);
  const replacement = lesson.replacementLessonId
    ? sessions.find((s) => s.lesson.id === lesson.replacementLessonId)
    : undefined;

  const status = sessionStatus(lesson, now);
  const view: ISessionView = {
    ...refOf({ week, lesson }, now),
    courseId: course.id,
    weekId: week.id,
    weekTitle: week.title,
    durationMinutes: lesson.durationMinutes,
    cancelledAt: lesson.cancelledAt,
    replacementSessionId: replacement ? replacement.lesson.id : null,
    replacement: replacement ? refOf(replacement, now) : null,
    previous: before ? refOf(before, now) : null,
    next: after ? refOf(after, now) : null,
    muderris: course.muderris.map((m) => ({
      name: m.name,
      title: m.title,
      isImam: imamUserId !== null && m.userId === imamUserId,
    })),
    contentLocked: course.contentLocked,
  };

  // The content keys are copied only when the filtered lesson has them, so a
  // locked caller's body names none of them (MDRS-103).
  if ("cancelReason" in lesson) view.cancelReason = lesson.cancelReason;
  if ("kaynak" in lesson) view.kaynak = lesson.kaynak;
  if ("agenda" in lesson) view.agenda = lesson.agenda;
  if ("meetingUrl" in lesson) {
    const joinable =
      status === SessionStatus.SCHEDULED || status === SessionStatus.LIVE;
    view.meetingUrl = joinable ? lesson.meetingUrl : null;
  }
  return view;
}
