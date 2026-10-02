import { sql } from "drizzle-orm";

/**
 * The statuses of an enrollment that count as "enrolled in the course" for the
 * decks a course brings along: PENDING has not been let in yet.
 */
const ACTIVE_ENROLLMENT = sql`('ENROLLED', 'COMPLETED')`;

/**
 * The deck's own columns, spelled with the table name. Drizzle writes a column
 * of a single-table select WITHOUT its table (`"course_id"`), and inside the
 * subquery below that bare name binds to `enrollments.course_id` — `c.id =
 * e.course_id` is then true for every enrolled user and the predicate shares
 * every deck with every talebe. The e2e suite caught it; do not interpolate
 * `decks.courseId` and friends here.
 */
const deckColumn = (name: string) => sql.raw(`"decks"."${name}"`);

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
 * unaliased, directly or through a join, so one fragment serves the guard's
 * single-deck read, the card-visibility join and the list routes.
 */
export const deckSharedWith = (userId: string) => sql<boolean>`(
  ${deckColumn("archived_at")} IS NULL
  AND EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = ${userId}
      AND e.status IN ${ACTIVE_ENROLLMENT}
      AND c.status = 'PUBLISHED'
      AND c.archived_at IS NULL
      AND (
        c.id = ${deckColumn("course_id")}
        OR c.kosk_id = ${deckColumn("kosk_id")}
        OR c.madrasah_id = ${deckColumn("madrasah_id")}
      )
  )
)`;
