import {
  index,
  integer,
  pgEnum,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AssignmentKind,
  EvaluationStatus,
} from "../../course/domain/assignment-kind.enum";
import { lessons } from "./course.schema";

export const assignmentKind = pgEnum("assignment_kind", AssignmentKind);
export const evaluationStatus = pgEnum("evaluation_status", EvaluationStatus);

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
    // How the talebe hand it in (MDRS-248): FILE, as every homework did
    // before the column, or MEMORIZE, recited to the müderris and marked in
    // `assignment_evaluations` instead of uploaded.
    kind: assignmentKind("kind").default(AssignmentKind.FILE).notNull(),
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

/**
 * The course team's mark of one talebe on a memorisation homework (MDRS-248,
 * nazar's "Değerlendirme"): "Tam", "Eksik" or "Vermedi" and an optional short
 * note, one per talebe per homework. No row is "Bekliyor". Written under
 * `session.manage`; the talebe reads their own. `user_id` and `evaluated_by`
 * are not foreign keys, like every other user column. RESTRICT like every
 * foreign key under a course: taking the homework off and every purge that
 * removes it (`deleteLessonAssignments`) remove these first.
 */
export const assignmentEvaluations = table(
  "assignment_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .references(() => lessonAssignments.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    status: evaluationStatus("status").notNull(),
    // Plain text as typed, never rendered as HTML; null is none.
    note: text("note"),
    evaluatedBy: uuid("evaluated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // One per talebe per homework; also the talebe's own read and, by its
  // leading column, the course team's read of a homework.
  (t) => [
    uniqueIndex("assignment_evaluations_assignment_user_uq").on(
      t.assignmentId,
      t.userId
    ),
  ]
);
