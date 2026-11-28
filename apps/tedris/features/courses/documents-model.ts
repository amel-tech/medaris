import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import type { ResourceRow } from "./components/course-resources";

/** A celse and its own documents, in the order of the programme. */
export interface DocumentsSession {
  lessonId: string;
  title: string;
  rows: readonly ResourceRow[];
}

/** A week of the programme that has at least one celse with documents. */
export interface DocumentsWeek {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  sessions: readonly DocumentsSession[];
}

/** Every document of a course, as the "Dokümanlar" tab lists them. */
export interface CourseDocuments {
  /** The course's own documents ("Ders geneli"). */
  general: readonly ResourceRow[];
  /** The celses' documents, week by week; weeks and celses without one are left out. */
  weeks: readonly DocumentsWeek[];
  /** How many documents there are in all, for the tab's label. */
  count: number;
}

/**
 * The "Dokümanlar" tab of the course page (MDRS-248): the course's documents
 * and every celse's, on one page, so a talebe does not open each celse to
 * find what to download. Read from the course detail the page already has
 * (`GET /courses/:id`), which carries both, with the same content gating as
 * the celse page: without `course.view_details` the API leaves the links and
 * files out. The weeks and celses keep the API's order, which is the
 * programme's (weeks by number, celses by their place in the week).
 */
export const courseDocuments = (
  course: Pick<CourseDetailResponse, "resources" | "weeks">
): CourseDocuments => {
  const general = course.resources ?? [];
  const weeks = (course.weeks ?? [])
    .map((week) => ({
      weekId: week.id,
      weekNumber: week.weekNumber,
      weekTitle: week.title,
      sessions: (week.lessons ?? [])
        .filter((lesson) => (lesson.resources?.length ?? 0) > 0)
        .map((lesson) => ({
          lessonId: lesson.id,
          title: lesson.title,
          rows: lesson.resources,
        })),
    }))
    .filter((week) => week.sessions.length > 0);
  const count =
    general.length +
    weeks.reduce(
      (sum, week) =>
        sum +
        week.sessions.reduce(
          (inWeek, session) => inWeek + session.rows.length,
          0
        ),
      0
    );
  return { general, weeks, count };
};
