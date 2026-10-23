import type {
  CourseDeckStudentResponse,
  CourseDetailResponse,
} from "@medaris/services/tedrisat";
import { nextSession } from "./course-view";

/**
 * What the course page's "Ders destesi" tab derives from the course's decks:
 * which deck is featured and what each deck's status is. Pure and clock-free:
 * the caller passes `now`, so a spec pins every rule.
 */

export type CourseDeck = CourseDeckStudentResponse;

/**
 * `thisWeek`: the featured deck belongs to the week of the celse on air or of
 * the next one ("Bu haftanın destesi"). `next`: it is only the course's next
 * deck ("Sıradaki deste").
 */
export type FeaturedReason = "thisWeek" | "next";

export interface FeaturedDeck {
  deck: CourseDeck;
  reason: FeaturedReason;
}

/**
 * A deck is done when every one of its cards is mastered. An empty deck is not
 * done: it has nothing to finish.
 */
export const isDeckComplete = (
  deck: Pick<CourseDeck, "cardCount" | "masteredCount">
): boolean => deck.cardCount > 0 && deck.masteredCount >= deck.cardCount;

const weekRank = (deck: Pick<CourseDeck, "weekNumber">): number =>
  deck.weekNumber ?? Number.MAX_SAFE_INTEGER;

/**
 * The deck to feature, in this order:
 *
 * 1. a deck of the week of the celse on air, or of the next celse still ahead
 *    (`thisWeek`); between several, one not done yet, then the one with the
 *    most cards to repeat;
 * 2. the lowest-week deck with cards to repeat (`next`);
 * 3. the lowest-week deck not done yet (`next`);
 * 4. none: there are no decks, or every deck is done.
 */
export const pickFeaturedDeck = (
  decks: readonly CourseDeck[],
  course: Pick<CourseDetailResponse, "weeks">,
  now: number
): FeaturedDeck | null => {
  if (decks.length === 0) return null;

  const weekId = nextSession(course, now, { includeRunning: true })?.lesson
    .weekId;
  if (weekId) {
    const sameWeek = decks
      .filter((deck) => deck.weekId === weekId)
      .sort(
        (a, b) =>
          Number(isDeckComplete(a)) - Number(isDeckComplete(b)) ||
          b.dueCount - a.dueCount
      );
    if (sameWeek.length > 0) return { deck: sameWeek[0], reason: "thisWeek" };
  }

  const lowestWeekFirst = [...decks].sort((a, b) => weekRank(a) - weekRank(b));
  const due = lowestWeekFirst.find((deck) => deck.dueCount > 0);
  if (due) return { deck: due, reason: "next" };

  const open = lowestWeekFirst.find((deck) => !isDeckComplete(deck));
  return open ? { deck: open, reason: "next" } : null;
};

/** The decks the list under the featured one shows, in the order the API gave them. */
export const otherDecks = (
  decks: readonly CourseDeck[],
  featured: FeaturedDeck | null
): CourseDeck[] => decks.filter((deck) => deck.id !== featured?.deck.id);

/** A row's status: done, cards to repeat today, or not started. */
export type DeckRowStatus = "done" | "due" | "start";

export const deckRowStatus = (deck: CourseDeck): DeckRowStatus => {
  if (isDeckComplete(deck)) return "done";
  if (deck.dueCount > 0) return "due";
  return "start";
};
