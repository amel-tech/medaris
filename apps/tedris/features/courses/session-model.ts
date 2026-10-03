import type {
  CourseDetailResponse,
  LessonResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";

/**
 * What the session page (MDRS-158) derives from the course and the session.
 * Pure and clock-free (`now` is always a parameter) so a spec can pin it.
 */

/** How long a live session with no length counts as running; tedrisat's rule. */
export const DEFAULT_SESSION_MINUTES = 60;

/** The state `SessionJoin` and the lesson rows draw. */
export type SessionState = "upcoming" | "live" | "ended" | "cancelled";

interface Timed {
  cancelledAt?: Date | null;
  startsAt?: Date | null;
  durationMinutes?: number | null;
}

/**
 * Where a session stands at `now`, the same rule as tedrisat's
 * `sessionStatus`. The page recomputes it every half minute in the browser,
 * so a card that was "upcoming" at render becomes "live" without a reload.
 */
export const sessionStateOf = (session: Timed, now: Date): SessionState => {
  if (session.cancelledAt) return "cancelled";
  if (!session.startsAt) return "upcoming";
  const start = session.startsAt.getTime();
  const end =
    start + (session.durationMinutes ?? DEFAULT_SESSION_MINUTES) * 60_000;
  if (now.getTime() >= end) return "ended";
  if (now.getTime() >= start) return "live";
  return "upcoming";
};

const stateOfLesson = (lesson: LessonResponse, now: Date): SessionState =>
  sessionStateOf(
    {
      cancelledAt: lesson.cancelledAt,
      startsAt: lesson.scheduledAt,
      durationMinutes: lesson.durationMinutes,
    },
    now
  );

export type RowState = "default" | "current" | "done";
export type WeekState = "default" | "active" | "done";

export interface ProgrammeRow {
  lesson: LessonResponse;
  state: RowState;
  cancelled: boolean;
}

export interface ProgrammeWeek {
  week: WeekResponse;
  state: WeekState;
  /** `YYYY-MM-DD` in the course's zone: the first session of a week still ahead. */
  opensOn?: string;
  /** Live sessions that stand (not cancelled). */
  sessionCount: number;
  minutes: number;
  rows: ProgrammeRow[];
}

/** The calendar day of an instant in a zone, as `YYYY-MM-DD`. */
export const dayInZone = (at: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

const isLive = (lesson: LessonResponse) => lesson.type === "LIVE";

/**
 * The Müfredat accordion of the session page. A week is `done` when every
 * session that stands in it is over, `active` when it is the first week that
 * is not, and a later week carries the day its first session falls on
 * ("17 Ekim tarihinde açılır"). The row marked "Sıradaki" is the next session
 * that stands, whichever page the viewer is on — a cancelled session never
 * is.
 */
export const buildProgramme = (
  course: Pick<CourseDetailResponse, "weeks" | "timeZone">,
  now: Date
): { weeks: ProgrammeWeek[]; nextLessonId: string | null } => {
  const standingLive = (week: WeekResponse) =>
    week.lessons.filter((l) => isLive(l) && !l.cancelledAt);

  const next =
    course.weeks
      .flatMap(standingLive)
      .find((l) => stateOfLesson(l, now) !== "ended") ?? null;

  let activeSeen = false;
  const weeks = course.weeks.map((week): ProgrammeWeek => {
    const standing = standingLive(week);
    const done =
      standing.length > 0 &&
      standing.every((l) => stateOfLesson(l, now) === "ended");
    let state: WeekState = "default";
    if (done) state = "done";
    else if (!activeSeen && standing.length > 0) {
      state = "active";
      activeSeen = true;
    }
    const firstAhead = standing
      .map((l) => l.scheduledAt)
      .filter((at): at is Date => at != null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      week,
      state,
      opensOn:
        state === "default" && firstAhead
          ? dayInZone(firstAhead, course.timeZone)
          : undefined,
      sessionCount: standing.length,
      minutes: standing.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0),
      rows: week.lessons.map((lesson) => ({
        lesson,
        cancelled: Boolean(lesson.cancelledAt),
        state:
          lesson.id === next?.id
            ? "current"
            : isLive(lesson) && stateOfLesson(lesson, now) === "ended"
              ? "done"
              : "default",
      })),
    };
  });
  return { weeks, nextLessonId: next?.id ?? null };
};

/** The place a course's clock is kept in, for "Saatler İstanbul saatiyle". */
export const zoneLabel = (timeZone: string, locale: string): string => {
  if (timeZone === "Europe/Istanbul") {
    if (locale === "tr") return "İstanbul";
    if (locale === "ar") return "إسطنبول";
    return "Istanbul";
  }
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
};

const ARABIC_RUN = /[؀-ۿݐ-ݿࢠ-ࣿ]+(?:\s+[؀-ۿݐ-ݿࢠ-ࣿ]+)*/g;

/**
 * A line split into plain and Arabic runs, so the page can set each Arabic
 * run in `lang="ar" dir="rtl"` inside a Turkish sentence ("قرأ fiilinin…").
 */
export const splitArabic = (
  text: string
): { text: string; arabic: boolean }[] => {
  const parts: { text: string; arabic: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(ARABIC_RUN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), arabic: false });
    parts.push({ text: match[0], arabic: true });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), arabic: false });
  return parts;
};
