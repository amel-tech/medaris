import { pgTable as table, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { lessons } from "./course.schema";

/**
 * The note the müderris writes for a session (ders notu): one Markdown text a
 * session, read by the course's talebe on the session's page. Not
 * `lesson_notes`, which is each talebe's own private note on the session.
 */
export const lessonTeacherNotes = table("lesson_teacher_notes", {
  lessonId: uuid("lesson_id")
    .primaryKey()
    .references(() => lessons.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  updatedBy: uuid("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
