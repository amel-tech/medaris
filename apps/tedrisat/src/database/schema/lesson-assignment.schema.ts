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
 * The homework a müderris sets on a celse ("Bu celsenin ödevi var"): at most
 * one per celse, an optional description and its own files. Apart from the
 * celse's resources on purpose: the owner asked for homework to read as
 * homework, never as one more row of "Kaynaklar". A celse without a row has no
 * homework. Written under `session.manage`, like the celse's resources; read
 * by whoever may read the course's content. RESTRICT like every foreign key
 * under a course: `course/course-purge.ts` and the archive's week and session
 * purges remove these, and mark their files for removal from storage, before
 * the lessons.
 */
export const lessonAssignments = table(
  "lesson_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .references(() => lessons.id, { onDelete: "restrict" })
      .notNull(),
    // Plain text as typed, never rendered as HTML; null is none.
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // One per celse; also how the course page finds its celses' homework.
  (t) => [uniqueIndex("lesson_assignments_lesson_id_uq").on(t.lessonId)]
);

/**
 * A file of a celse's homework, kept in Medaris storage like a resource's
 * (MDRS-287) and checked the same way: the object's key, which never leaves
 * tedrisat, and what it is shown and served as. Never a row of
 * `lesson_resources`, so no resource list ever shows it.
 */
export const lessonAssignmentFiles = table(
  "lesson_assignment_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .references(() => lessonAssignments.id, { onDelete: "restrict" })
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
    uniqueIndex("lesson_assignment_files_storage_key_uq").on(t.storageKey),
    index("lesson_assignment_files_assignment_id_idx").on(t.assignmentId),
  ]
);
