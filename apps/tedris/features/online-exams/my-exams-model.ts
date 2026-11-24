import type { MyExamResponse } from "@medaris/services/tedrisat";

/**
 * The pure parts of Sınavlarım (MDRS-299, `graphs/tedris/exams/mine`): the
 * three groups, where each exam leads, and how a score is written.
 */

export type MyExamGroup = "open" | "coming" | "past";

/** "Şimdi açık" (open, in progress), "Yaklaşan", "Geçmiş", in the API's order within each. */
export const groupOf = (exam: Pick<MyExamResponse, "state">): MyExamGroup =>
  exam.state === "OPEN" || exam.state === "IN_PROGRESS"
    ? "open"
    : exam.state === "UPCOMING"
      ? "coming"
      : "past";

export const groupExams = (
  exams: readonly MyExamResponse[]
): Array<{ group: MyExamGroup; exams: MyExamResponse[] }> =>
  (["open", "coming", "past"] as const)
    .map((group) => ({
      group,
      exams: exams.filter((exam) => groupOf(exam) === group),
    }))
    .filter((g) => g.exams.length > 0);

/** The online exam's own page, from its briefing to the end. */
export const takeHref = (exam: Pick<MyExamResponse, "courseId" | "lessonId">) =>
  `/courses/${exam.courseId}/lessons/${exam.lessonId}/sinav`;

/** The talebe's screen of a past online exam. */
export const resultHref = (lessonId: string) => `/my-exams/${lessonId}`;

/** A written or oral exam's score stands in its course's Notlarım. */
export const gradesHref = (courseId: string) =>
  `/courses/${courseId}?tab=notlarim`;

/** Where a listed exam leads, if anywhere. */
export type MyExamAction =
  | { kind: "enter" | "continue" | "view"; href: string }
  | { kind: "result"; href: string }
  | { kind: "grades"; href: string }
  | null;

/**
 * Straight to the exam (the owner, 22 Nov 2026: "yaklaşan ve devam eden sınav
 * varsa tıklayınca direk sınav ekranına gitsin talebe ders ve celse
 * sayfalarını atlayıp kolayca"): an online exam to come, open or in progress
 * leads to its own page, never through the course or the celse.
 */
export const actionOf = (exam: MyExamResponse): MyExamAction => {
  if (exam.format === "MULTIPLE_CHOICE") {
    if (exam.state === "UPCOMING")
      return { kind: "view", href: takeHref(exam) };
    if (exam.state === "OPEN") return { kind: "enter", href: takeHref(exam) };
    if (exam.state === "IN_PROGRESS")
      return { kind: "continue", href: takeHref(exam) };
    if (exam.state === "TAKEN" || exam.state === "RELEASED")
      return { kind: "result", href: resultHref(exam.lessonId) };
    return null;
  }
  return exam.state === "UPCOMING"
    ? null
    : { kind: "grades", href: gradesHref(exam.courseId) };
};

/**
 * A score as the API writes it ("85.50", "17") in the locale's numbers: two
 * decimals only where it has them ("85,50", "85", "17").
 */
export const scoreText = (score: string, locale: string): string => {
  const value = Number(score);
  if (!Number.isFinite(value)) return score;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
};
