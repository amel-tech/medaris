import {
  index,
  integer,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { lessons } from "./course.schema";

/**
 * A talebe's homework on a celse (MDRS-290): one per talebe per celse, an
 * optional note and up to `MAX_SUBMISSION_FILES` files (10 since MDRS-296). There is no deadline and no grade: the
 * talebe changes it whenever they like, and `updated_at` is when they last
 * did. Read by the talebe and by whoever holds `submission.read` on the
 * course. `user_id` is not a foreign key, like every other user column.
 * RESTRICT like every foreign key under a course: `course/course-purge.ts` and
 * the archive's week and session purges remove these, and mark their files
 * for removal from storage, before the lessons.
 */
export const lessonSubmissions = table(
  "lesson_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .references(() => lessons.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // One per talebe per celse; also the talebe's own read and, by its leading
  // column, the staff's read of a celse.
  (t) => [
    uniqueIndex("lesson_submissions_lesson_user_uq").on(t.lessonId, t.userId),
  ]
);

/**
 * A file of a homework (MDRS-290), kept in Medaris storage like a resource's
 * (MDRS-287): the object's key, which never leaves tedrisat, and what it is
 * shown and served as.
 */
export const submissionFiles = table(
  "submission_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .references(() => lessonSubmissions.id, { onDelete: "restrict" })
      .notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("submission_files_storage_key_uq").on(t.storageKey),
    index("submission_files_submission_id_idx").on(t.submissionId),
  ]
);
