import type {
  FlashcardResponse,
  ReviewRating,
} from "@medaris/services/tedrisat";

/**
 * What the study screen (design tedris/30, MDRS-165) derives: the round a
 * signed-out visitor studies, the three ratings, and the numbers on the bar.
 * Pure, so a spec can pin each of them.
 */

/** A signed-out visitor studies the first cards of the deck, in its order: nothing is saved, so no queue is kept. */
export const ANONYMOUS_ROUND = 10;

export const anonymousRound = (
  cards: FlashcardResponse[]
): FlashcardResponse[] => cards.slice(0, ANONYMOUS_ROUND);

export const RATINGS: {
  value: ReviewRating;
  key: "hard" | "medium" | "easy";
}[] = [
  { value: "HARD" as ReviewRating, key: "hard" },
  { value: "MEDIUM" as ReviewRating, key: "medium" },
  { value: "EASY" as ReviewRating, key: "easy" },
];

/** Whole percent of the round done; 0 for an empty round. */
export const roundPercent = (done: number, total: number): number =>
  total <= 0 ? 0 : Math.round((Math.min(done, total) / total) * 100);

/** Which sentence the page's subtitle is: cards due, only new cards, or (signed out) just the count. */
export const subtitleKind = (
  signedIn: boolean,
  dueCount: number
): "due" | "new" | "all" => (!signedIn ? "all" : dueCount > 0 ? "due" : "new");
