import type {
  CourseDetailResponse,
  CourseSubmissionResponse,
  CourseSubmissionSessionResponse,
} from "@medaris/services/tedrisat";
import { type StoredFile, storedFileOf } from "../files/files";

/**
 * Ödevler of a course as rules (MDRS-290): what talebe handed in on each
 * celse, by celse in programme order, for the course team who hold
 * `submission.read`, and for each celse whether the course team set homework
 * on it and "N / M teslim": how many of the enrolled talebe handed in. Pure
 * on purpose, so the page has nothing to decide.
 */

export const homeworkHref = (courseId: string): string =>
  `/ders/${encodeURIComponent(courseId)}/odevler`;

/** One talebe's homework on a celse, as a row of its table. */
export interface HomeworkRow {
  id: string;
  /** the account's name, else null for one tedrisat has not seen sign in */
  talebe: string | null;
  note: string | null;
  /** ISO time of the talebe's last change: the note, or a file added or removed */
  updatedAt: string;
  /** oldest first */
  files: Array<StoredFile & { id: string }>;
}

/** A celse of the filter, with the homework handed in on it. */
export interface HomeworkSession {
  lessonId: string;
  weekNumber: number;
  title: string;
  /** ISO time it starts, when the course read gives one */
  startsAt: string | null;
  /** latest change first, as tedrisat lists them */
  rows: HomeworkRow[];
  /** the course team set homework on it */
  hasAssignment: boolean;
  /**
   * "N / M teslim": enrolled talebe who handed in, of all enrolled; null for
   * a celse tedrisat no longer counts (one hidden since)
   */
  handIns: { count: number; total: number } | null;
}

/** tedrisat's count beside the homework: each live celse's, and the enrolled talebe. */
export interface HandIns {
  sessions: readonly CourseSubmissionSessionResponse[];
  talebeCount: number;
}

const rowOf = (item: CourseSubmissionResponse): HomeworkRow => ({
  id: item.id,
  talebe: item.talebe.name,
  note: item.note,
  updatedAt: new Date(item.updatedAt).toISOString(),
  files: item.files.map((file) => ({ id: file.id, ...storedFileOf(file) })),
});

/**
 * The course's celses in programme order (week, then the order within it),
 * each with its homework, whether homework was set on it and how many
 * handed in. A cancelled celse is listed only when somebody handed in on it
 * or it has homework. Homework on a celse the course read does not list (one
 * hidden since) still shows, under the title and week it was handed in on,
 * after the listed celses of that week, without a count.
 */
export function homeworkSessions(
  course: Pick<CourseDetailResponse, "weeks">,
  items: readonly CourseSubmissionResponse[],
  handIns: HandIns = { sessions: [], talebeCount: 0 }
): HomeworkSession[] {
  const counted = new Map(
    handIns.sessions.map((session) => [session.lessonId, session])
  );
  const countOf = (lessonId: string) => {
    const session = counted.get(lessonId);
    return {
      hasAssignment: session?.hasAssignment ?? false,
      handIns: session
        ? { count: session.handedInCount, total: handIns.talebeCount }
        : null,
    };
  };
  const byLesson = new Map<string, HomeworkRow[]>();
  for (const item of items) {
    const rows = byLesson.get(item.lessonId) ?? [];
    rows.push(rowOf(item));
    byLesson.set(item.lessonId, rows);
  }
  const sessions: HomeworkSession[] = [];
  const listed = new Set<string>();
  for (const week of course.weeks) {
    for (const lesson of week.lessons) {
      listed.add(lesson.id);
      const rows = byLesson.get(lesson.id) ?? [];
      const counts = countOf(lesson.id);
      if (lesson.cancelledAt && rows.length === 0 && !counts.hasAssignment)
        continue;
      sessions.push({
        lessonId: lesson.id,
        weekNumber: week.weekNumber,
        title: lesson.title,
        startsAt: lesson.scheduledAt
          ? new Date(lesson.scheduledAt).toISOString()
          : null,
        rows,
        ...counts,
      });
    }
  }
  for (const item of items) {
    if (listed.has(item.lessonId)) continue;
    listed.add(item.lessonId);
    sessions.push({
      lessonId: item.lessonId,
      weekNumber: item.weekNumber,
      title: item.lessonTitle,
      startsAt: null,
      rows: byLesson.get(item.lessonId) ?? [],
      ...countOf(item.lessonId),
    });
  }
  // A stable sort: the course's own order stays within each week.
  return sessions.sort((a, b) => a.weekNumber - b.weekNumber);
}

/** The filter's value for every celse. */
export const ALL_SESSIONS = "all";

/**
 * The celses the page draws for a filter value: for "all", every celse that
 * has homework set or handed in, so a celse with homework and no hand-in
 * shows its "0 / M teslim"; else the one chosen, empty or not. A value that
 * names no celse (one gone since) is taken as "all".
 */
export function shownSessions(
  sessions: readonly HomeworkSession[],
  value: string
): HomeworkSession[] {
  const chosen = sessions.find((session) => session.lessonId === value);
  if (value !== ALL_SESSIONS && chosen) return [chosen];
  return sessions.filter(
    (session) => session.rows.length > 0 || session.hasAssignment
  );
}

/** Whether the page has anything to draw: homework set on a celse, or handed in. */
export const hasHomework = (sessions: readonly HomeworkSession[]): boolean =>
  sessions.some((session) => session.rows.length > 0 || session.hasAssignment);

/** The number of submissions, and of the celses holding them. */
export const homeworkCounts = (
  sessions: readonly HomeworkSession[]
): { submissions: number; sessions: number } => ({
  submissions: sessions.reduce((n, session) => n + session.rows.length, 0),
  sessions: sessions.filter((session) => session.rows.length > 0).length,
});

/** "12 Eki 2026 21:05": the last change of a submission, on the course's clock. */
export const changedLabel = (
  at: Date,
  locale: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(at);

/** How much of a note a row shows before "Tamamını göster". */
export const NOTE_EXCERPT = 140;

/**
 * The start of a long note, cut at a word where one is near, or null when
 * the note is short enough to show whole.
 */
export function noteExcerpt(
  note: string,
  max: number = NOTE_EXCERPT
): string | null {
  const text = note.trim();
  if (text.length <= max) return null;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
