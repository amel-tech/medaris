import type {
  EnrolledCourseResponse,
  FlashcardDeckSummaryResponse,
} from "@medaris/services/tedrisat";

/** How many courses "Kaldığın yerden devam et" shows. */
export const CONTINUE_LIMIT = 3;

/**
 * The courses to pick up again: in progress (ENROLLED, not finished), the ones
 * with the next session soonest first, then those with none, each keeping the
 * API's order among equals. A course at 100 % has nothing to continue.
 */
export const coursesToContinue = (
  courses: EnrolledCourseResponse[],
  limit = CONTINUE_LIMIT
): EnrolledCourseResponse[] => {
  const at = (course: EnrolledCourseResponse) =>
    course.nextSession ? new Date(course.nextSession.at).getTime() : Infinity;
  return courses
    .filter(
      (course) =>
        course.enrollment.status === "ENROLLED" &&
        course.enrollment.progress < 100
    )
    .map((course, index) => ({ course, index }))
    .sort((a, b) => at(a.course) - at(b.course) || a.index - b.index)
    .slice(0, limit)
    .map(({ course }) => course);
};

export type DeckLine =
  | { kind: "due"; count: number }
  | { kind: "added"; count: number };

/** What a deck waits with today: cards to repeat if there are, else the cards added since it was collected. */
export const deckLine = (
  deck: Pick<
    FlashcardDeckSummaryResponse,
    "dueCount" | "addedSinceCollectedCount"
  >
): DeckLine =>
  deck.dueCount > 0
    ? { kind: "due", count: deck.dueCount }
    : { kind: "added", count: deck.addedSinceCollectedCount };
