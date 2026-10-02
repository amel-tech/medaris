import { FlashcardProgressStatus } from "./flashcard-progress-status.enum";
import { ReviewRating } from "./review-rating.enum";

/** The longest a card is left alone, however easy it was. */
export const MAX_INTERVAL_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduledReview {
  status: FlashcardProgressStatus;
  intervalDays: number;
  dueAt: Date;
}

/**
 * The smallest spaced-repetition scheme that answers "which cards wait for me
 * today" (MDRS-165). Whether this is the algorithm the product wants is not
 * decided: it is one function, so replacing it changes nothing else.
 *
 * - HARD: the card stays LEARNING and comes back in a day, whatever it was.
 * - MEDIUM: stays LEARNING; the gap is the last one, at least three days.
 * - EASY: the card is MASTERED; the gap doubles the last one, at least a
 *   week, and never more than {@link MAX_INTERVAL_DAYS}.
 *
 * A MASTERED card is due again when its gap is up, so mastering is not the end
 * of its review.
 */
export function scheduleReview(
  rating: ReviewRating,
  previousIntervalDays: number,
  now: Date
): ScheduledReview {
  const previous = Math.max(0, previousIntervalDays);
  let status: FlashcardProgressStatus;
  let intervalDays: number;
  switch (rating) {
    case ReviewRating.HARD:
      status = FlashcardProgressStatus.LEARNING;
      intervalDays = 1;
      break;
    case ReviewRating.MEDIUM:
      status = FlashcardProgressStatus.LEARNING;
      intervalDays = Math.max(3, previous);
      break;
    case ReviewRating.EASY:
      status = FlashcardProgressStatus.MASTERED;
      intervalDays = Math.max(7, previous * 2);
      break;
  }
  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);
  return {
    status,
    intervalDays,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
  };
}
