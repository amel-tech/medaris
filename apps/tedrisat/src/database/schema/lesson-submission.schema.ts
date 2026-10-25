import { sql } from "drizzle-orm";
import {
  check,
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
    // The course team's review of it: a note and, as `submission_review_files`,
    // corrected files. Sent when `reviewed_at` is set; until then the talebe
    // sees none of it. Sending again replaces the note and keeps the files.
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
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
    check(
      "lesson_submissions_review_sent",
      sql`(${t.reviewedBy} is null) = (${t.reviewedAt} is null)`
    ),
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

/**
 * A file the course team returns with its review of a homework: the talebe's
 * work corrected, or anything else the reviewer attaches. Kept in Medaris
 * storage like the talebe's own files, apart from them, so the talebe's limit
 * and "handed in" never count it. The talebe reads it once the review is sent.
 */
export const submissionReviewFiles = table(
  "submission_review_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .references(() => lessonSubmissions.id, { onDelete: "restrict" })
      .notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("submission_review_files_storage_key_uq").on(t.storageKey),
    index("submission_review_files_submission_id_idx").on(t.submissionId),
  ]
);
