import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { whenLabel } from "~/features/archive/archive";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Müfredat of a course, the hiding half only (MDRS-143): its live weeks and the
 * sessions in them, each with "Gizle". The editor that adds, moves and rewrites
 * them is MDRS-123's and absorbs this page. Pure on purpose: the page has
 * nothing to decide but what it reads.
 */
export interface SessionRow {
  id: string;
  title: string;
  /** "28 Eyl 16:10", or none for a session with no time yet */
  when: string | null;
}

export interface WeekRow {
  id: string;
  number: number;
  title: string;
  sessions: SessionRow[];
}

type Weeks = Pick<CourseDetailResponse, "weeks">["weeks"];

export function weekRows(
  weeks: Weeks,
  t: Messages,
  where: { locale: string; timeZone: string; now: Date }
): WeekRow[] {
  return [...weeks]
    .sort((a, b) => a.orderIndex - b.orderIndex || a.weekNumber - b.weekNumber)
    .map((week) => ({
      id: week.id,
      number: week.weekNumber,
      title: week.title,
      sessions: [...week.lessons]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          when: lesson.scheduledAt
            ? whenLabel(new Date(lesson.scheduledAt), where.now, where, t)
            : null,
        })),
    }));
}

/** The message key of a refused hide, from the code the API answered with. */
export function hideErrorKey(code: string): string {
  switch (code) {
    case "WEEK_NOT_FOUND":
    case "LESSON_NOT_FOUND":
      return "Curriculum.gone";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}
