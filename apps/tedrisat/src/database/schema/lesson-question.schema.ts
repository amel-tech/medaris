import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { lessons } from "./course.schema";

/**
 * A talebe's question on a session, and the course staff's answer to it
 * (MDRS-150). `author_id` and `answered_by` are not foreign keys, like every
 * other user column. RESTRICT like every foreign key under a course;
 * `course/course-purge.ts` removes these before the lessons.
 *
 * One answer per question, kept on the row: answering again replaces it, and
 * there is no history. The three `answer*` columns are all set or all null.
 * Both texts are Markdown source, stored as typed; the client sanitises and
 * renders them.
 */
export const lessonQuestions = table(
  "lesson_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .references(() => lessons.id, { onDelete: "restrict" })
      .notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    answer: text("answer"),
    answeredBy: uuid("answered_by"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The author's own list; the course's list reads through the session.
    index("lesson_questions_author_idx").on(t.authorId),
    index("lesson_questions_lesson_idx").on(t.lessonId),
    check(
      "lesson_questions_answer_complete",
      sql`(${t.answer} is null) = (${t.answeredBy} is null) and (${t.answer} is null) = (${t.answeredAt} is null)`
    ),
  ]
);
