/**
 * Sorular of a course (MDRS-150) as rules: the limit the API puts on an
 * answer, how a page of questions joins what is shown, how a time is written
 * and which message a refused call says. Pure on purpose, so that the page and
 * the list have nothing to decide.
 */

/** The API's limit on a question or an answer (`LESSON_QUESTION_BODY_MAX`). */
export const ANSWER_BODY_MAX = 4000;

/**
 * A page of questions appended to what is shown. A question already shown is
 * kept once: answering moves a question to the end of the API's order, so a
 * later page can reach one the list already holds.
 */
export const appendQuestions = <T extends { id: string }>(
  shown: readonly T[],
  page: readonly T[]
): T[] => {
  const seen = new Set(shown.map((question) => question.id));
  return [...shown, ...page.filter((question) => !seen.has(question.id))];
};

/** When a question was asked or answered: "4 Eki 2026 21:00", in the viewer's zone. */
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

/** The message key of a refused answer, from the code the API answered with. */
export function answerErrorKey(code: string): string {
  switch (code) {
    // The question is gone, or the caller may not answer it: the API says the same for both.
    case "LESSON_QUESTION_NOT_FOUND":
      return "Questions.errors.gone";
    case "VALIDATION_ERROR":
      return "Questions.errors.invalid";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Questions.errors.failed";
  }
}
