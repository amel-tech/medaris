import type { CourseDetailResponse } from "@medaris/services/tedrisat";

/**
 * What the questions views derive from the course and from a question
 * (MDRS-150). Pure: a spec pins every rule.
 */

/** The API's limit on a question or an answer (`LESSON_QUESTION_BODY_MAX`). */
export const QUESTION_BODY_MAX = 4000;

/** A session a question can be asked on, with the week it is in. */
export interface SessionChoice {
  id: string;
  weekNumber: number;
  title: string;
}

/** The course's sessions in programme order, cancelled ones left out. */
export const sessionChoices = (
  course: Pick<CourseDetailResponse, "weeks">
): SessionChoice[] =>
  course.weeks.flatMap((week) =>
    week.lessons
      .filter((lesson) => !lesson.cancelledAt)
      .map((lesson) => ({
        id: lesson.id,
        weekNumber: week.weekNumber,
        title: lesson.title,
      }))
  );

/** How many questions still wait for an answer. */
export const waitingCount = (
  questions: ReadonlyArray<{ answer: unknown }>
): number => questions.filter((q) => q.answer === null).length;

/** When a question was asked or answered: "4 Eki 2026 21:00", in the course's zone. */
export const questionWhen = (
  at: Date,
  locale: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(at);
