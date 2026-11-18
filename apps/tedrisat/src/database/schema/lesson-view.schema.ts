import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  pgTable as table,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { lessons } from "./course.schema";

/**
 * How far a talebe has watched a celse's video (MDRS-248, "sayaç çalışmıyor"):
 * one row per talebe and celse, written by the watch page's player while it
 * plays. `user_id` is the only reader and writer, like a note's author; not a
 * foreign key, like every other user column. RESTRICT like every foreign key
 * under a course; `course/course-purge.ts` and the week and session cases of
 * `archive/archive.repository.ts` remove these before the lessons.
 *
 * `position_seconds` is where the player last was, the place "Kaldığın yer"
 * goes back to. `duration_seconds` is the video's length as the player
 * reported it, null until it did. `completed_at` is set once, the first time
 * the player ended or reached nine tenths of the video, and stays: watching it
 * again from the start does not take the mark away.
 */
export const lessonViews = table(
  "lesson_views",
  {
    userId: uuid("user_id").notNull(),
    lessonId: uuid("lesson_id")
      .references(() => lessons.id, { onDelete: "restrict" })
      .notNull(),
    positionSeconds: integer("position_seconds").default(0).notNull(),
    durationSeconds: integer("duration_seconds"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The reads are a talebe's rows, of one course or one celse.
    primaryKey({ columns: [t.userId, t.lessonId] }),
    check("lesson_views_position_not_negative", sql`${t.positionSeconds} >= 0`),
    check(
      "lesson_views_duration_positive",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} > 0`
    ),
  ]
);
