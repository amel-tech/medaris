import type { ReviewRating } from "@medaris/services/tedrisat";

/**
 * "Kendini sına" on the course page's card grid: every card of the round starts
 * face down, the talebe turns one and says whether they knew it. When every
 * card of the round is marked, a summary says how many, and a new round of the
 * missed cards alone can follow.
 *
 * Pure: the grid holds the state and sends each mark to `rateFlashcard`.
 */

export type SelfTestMark = "known" | "missed";

export interface SelfTest {
  /** The cards in play this round, in the deck's order. */
  round: string[];
  marks: Record<string, SelfTestMark>;
}

export const startSelfTest = (cardIds: readonly string[]): SelfTest => ({
  round: [...cardIds],
  marks: {},
});

/** A card outside the round cannot be marked; a marked one keeps its first mark. */
export const markCard = (
  test: SelfTest,
  cardId: string,
  mark: SelfTestMark
): SelfTest =>
  !test.round.includes(cardId) || test.marks[cardId]
    ? test
    : { ...test, marks: { ...test.marks, [cardId]: mark } };

export interface SelfTestSummary {
  total: number;
  marked: number;
  known: number;
  missed: string[];
  done: boolean;
}

export const summarize = (test: SelfTest): SelfTestSummary => {
  const marked = test.round.filter((id) => test.marks[id]);
  const missed = test.round.filter((id) => test.marks[id] === "missed");
  return {
    total: test.round.length,
    marked: marked.length,
    known: marked.length - missed.length,
    missed,
    done: test.round.length > 0 && marked.length === test.round.length,
  };
};

/** The next round: the cards the talebe did not know, face down again. */
export const retryMissed = (test: SelfTest): SelfTest =>
  startSelfTest(summarize(test).missed);

/**
 * What a mark tells the review schedule: a missed card is rated hard, a known
 * one easy (MDRS-165's ratings; "Orta" has no button here). Literal values,
 * as in `study-model.ts`, so the client bundle does not load the API client.
 */
export const ratingFor = (mark: SelfTestMark): ReviewRating =>
  (mark === "known" ? "EASY" : "HARD") as ReviewRating;
