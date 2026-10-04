import type { CourseDetailResponse } from "@medaris/services/tedrisat";

/**
 * What the questions tab derives from the course and from a question
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

/**
 * Whether the author may still rewrite a question: an answer belongs to the
 * question as it was asked, so the API refuses an edit once one exists.
 * Deleting is allowed at any time.
 */
export const canEditQuestion = (question: { answer: unknown }): boolean =>
  question.answer === null;

/**
 * A page of the author's questions appended to what is shown, a question
 * already shown (one asked since, which the next page's cursor does not
 * reach) kept once.
 */
export const appendQuestions = <T extends { id: string }>(
  shown: readonly T[],
  page: readonly T[]
): T[] => {
  const seen = new Set(shown.map((q) => q.id));
  return [...shown, ...page.filter((q) => !seen.has(q.id))];
};

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
