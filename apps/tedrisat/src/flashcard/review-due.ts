import { and, eq, isNull, lte, ne, or, type SQL } from "drizzle-orm";
import { flashcardProgress } from "../database/schema/flashcard.schema";
import { FlashcardProgressStatus } from "./domain/flashcard-progress-status.enum";

/**
 * "This progress row is waiting for a repeat" (MDRS-165): the card has been
 * started and either its review time has come or it never got one. A LEARNING
 * row without a time is the old "memorised" toggle's leftover and counts as
 * due; a MASTERED row without one was marked by hand and is never due. A NEW
 * row is a card nobody has studied, which is not a repeat.
 *
 * Written with drizzle's column references, so it is qualified by the table in
 * every joined query that selects `flashcard_progress`.
 */
export const isReviewDue = (now: Date): SQL =>
  and(
    ne(flashcardProgress.status, FlashcardProgressStatus.NEW),
    or(
      and(
        isNull(flashcardProgress.dueAt),
        eq(flashcardProgress.status, FlashcardProgressStatus.LEARNING)
      ),
      lte(flashcardProgress.dueAt, now)
    )
  ) as SQL;
