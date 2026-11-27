import type {
  PracticeAttemptResponse,
  PracticeSetSummaryResponse,
} from "@medaris/services/tedrisat";

/**
 * The pure parts of the çalışma soruları (MDRS-248, Faz 3): the list grouped
 * by course, where each set leads, how a percentage is written, and where a
 * solving goes on after a reload.
 */

/** The list page. */
export const PRACTICE_HREF = "/calisma-sorulari";

/** A set's solving page: it starts an attempt, or goes on with the open one. */
export const solveHref = (setId: string) => `${PRACTICE_HREF}/${setId}`;

/** A finished attempt's result. */
export const resultHref = (attemptId: string) =>
  `${PRACTICE_HREF}/deneme/${attemptId}`;

/** A course's sets on the list page, from the course page's link. */
export const courseAnchor = (courseId: string) => `ders-${courseId}`;

export interface CourseSets {
  courseId: string;
  courseTitle: string;
  sets: PracticeSetSummaryResponse[];
}

/** The sets by course, the courses and the sets each in the API's order. */
export const groupByCourse = (
  sets: readonly PracticeSetSummaryResponse[]
): CourseSets[] => {
  const groups = new Map<string, CourseSets>();
  for (const set of sets) {
    const group = groups.get(set.courseId) ?? {
      courseId: set.courseId,
      courseTitle: set.courseTitle,
      sets: [],
    };
    group.sets.push(set);
    groups.set(set.courseId, group);
  }
  return [...groups.values()];
};

export type PracticeAction = "start" | "continue" | "again";

/** "Devam et" for an attempt in progress, "Tekrar çöz" once solved, "Başla" before. */
export const actionOf = (
  set: Pick<PracticeSetSummaryResponse, "openAttemptId" | "attemptCount">
): PracticeAction =>
  set.openAttemptId ? "continue" : set.attemptCount > 0 ? "again" : "start";

/** "62.50" as the locale writes a percentage: "%62,5" in Turkish, "62.5%" in English. */
export const percentText = (percent: string, locale: string): string => {
  const value = Number(percent);
  if (!Number.isFinite(value)) return `${percent}%`;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value / 100);
};

/**
 * Where an attempt opens: the question it was left at (the last one
 * answered, which the API keeps), else the first one not answered, else the
 * first.
 */
export const startIndex = (
  attempt: Pick<PracticeAttemptResponse, "currentQuestionId" | "questions">
): number => {
  const at = attempt.questions.findIndex(
    (q) => q.id === attempt.currentQuestionId
  );
  if (at !== -1) return at;
  const open = attempt.questions.findIndex(
    (q) => q.chosenOptionIds.length === 0
  );
  return open === -1 ? 0 : open;
};

/** How many questions have no choice: what "Bitir" asks about. */
export const blankCount = (
  ids: readonly string[],
  chosen: ReadonlyMap<string, readonly string[]>
): number => ids.filter((id) => (chosen.get(id)?.length ?? 0) === 0).length;

const skippedKey = (attemptId: string) => `practice-skipped:${attemptId}`;

/** The questions skipped in this tab, so a reload brings them back after the last one. */
export function readSkipped(
  attemptId: string,
  storage: Pick<Storage, "getItem"> | undefined
): Set<string> {
  try {
    const raw = storage?.getItem(skippedKey(attemptId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : []
    );
  } catch {
    return new Set();
  }
}

export function writeSkipped(
  attemptId: string,
  ids: readonly string[],
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined
): void {
  try {
    if (ids.length === 0) storage?.removeItem(skippedKey(attemptId));
    else storage?.setItem(skippedKey(attemptId), JSON.stringify(ids));
  } catch {
    // A full or blocked storage only forgets the skips on a reload.
  }
}
