import { sql } from "drizzle-orm";
import { decks } from "../database/schema/flashcard-deck.schema";

/**
 * The statuses of an enrollment that count as "enrolled in the course" for the
 * decks a course brings along: PENDING has not been let in yet.
 */
const ACTIVE_ENROLLMENT = sql`('ENROLLED', 'COMPLETED')`;

/**
 * SQL for "this deck is shared with `userId` through a course" (MDRS-164): the
 * deck belongs to a course, a köşk or a medrese, and the caller is enrolled in
 * that course, in a course of that köşk or in a course of that medrese. Such a
 * deck is not public, and is readable (and collectable) by exactly those
 * talebe; it is written by nobody but its author.
 *
 * A hidden deck is shared with nobody, and a hidden or unpublished course
 * brings none. The three keys are compared with `=`, so a deck that names no
 * köşk matches no course on that key (`NULL = x` is not true).
 *
 * Written against the `decks` table by name: every caller selects from it
 * directly or through a join, so one fragment serves the guard's single-deck
 * read, the card-visibility join and the list routes.
 */
export const deckSharedWith = (userId: string) => sql<boolean>`(
  ${decks.archivedAt} IS NULL
  AND EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = ${userId}
      AND e.status IN ${ACTIVE_ENROLLMENT}
      AND c.status = 'PUBLISHED'
      AND c.archived_at IS NULL
      AND (
        c.id = ${decks.courseId}
        OR c.kosk_id = ${decks.koskId}
        OR c.madrasah_id = ${decks.madrasahId}
      )
  )
)`;
