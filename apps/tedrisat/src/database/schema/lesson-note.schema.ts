import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { lessons } from "./course.schema";

/**
 * A talebe's private note on a session's video (MDRS-150). `author_id` is the
 * only reader and writer: no route returns a note to anyone else, and every
 * query on this table filters by it. Not a foreign key, like every other user
 * column. RESTRICT like every foreign key under a course;
 * `course/course-purge.ts` and the week and session cases of
 * `archive/archive.repository.ts` remove these before the lessons.
 *
 * `offset_seconds` is the player position from the start of the video, so a
 * note taken on the live stream points at the same moment in the recording
 * afterwards. Null when the player reports none and the talebe left it empty.
 * `body` is Markdown source, stored as typed; the client sanitises and
 * renders it.
 */
export const lessonNotes = table(
  "lesson_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .references(() => lessons.id, { onDelete: "restrict" })
      .notNull(),
    authorId: uuid("author_id").notNull(),
    offsetSeconds: integer("offset_seconds"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The one read: an author's notes on one session.
    index("lesson_notes_author_lesson_idx").on(t.authorId, t.lessonId),
    check(
      "lesson_notes_offset_not_negative",
      sql`${t.offsetSeconds} is null or ${t.offsetSeconds} >= 0`
    ),
  ]
);
