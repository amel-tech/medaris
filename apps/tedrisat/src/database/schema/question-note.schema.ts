import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./course.schema";
import { examQuestions, onlineExams } from "./online-exam.schema";

/**
 * A talebe's note on one question of a çalışma seti or an online exam
 * (MDRS-248, soru notları): one per talebe and question. It is the talebe's
 * own until they send it to the course's hoca (`shared_with_teacher`), who
 * then reads it on the set and may answer it once (`teacher_reply`,
 * replacing an earlier answer; an empty answer takes it back).
 *
 * `updated_at` is the talebe's last write (the text or the sending), never
 * the hoca's answer, so a note written again after its answer reads as
 * changed since (`updated_at > replied_at`). `reply_seen_at` is when the
 * talebe last read their notes with the answer on them.
 *
 * `user_id` and `replied_by` are not foreign keys, like every user column.
 * RESTRICT like every foreign key under a course: the course purge and the
 * set's delete remove these before the questions.
 */
export const questionNotes = table(
  "question_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    examId: uuid("exam_id")
      .references(() => onlineExams.id, { onDelete: "restrict" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => examQuestions.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    body: text("body").notNull(),
    sharedWithTeacher: boolean("shared_with_teacher").default(false).notNull(),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    teacherReply: text("teacher_reply"),
    repliedBy: uuid("replied_by"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    replySeenAt: timestamp("reply_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("question_notes_user_question_uq").on(t.userId, t.questionId),
    // The hoca's list of a set and its count of unanswered notes.
    index("question_notes_exam_shared_idx").on(t.examId, t.sharedWithTeacher),
    // The talebe's list in a course, and the course purge.
    index("question_notes_course_user_idx").on(t.courseId, t.userId),
    index("question_notes_question_idx").on(t.questionId),
    check(
      "question_notes_body_check",
      sql`char_length(${t.body}) between 1 and 1000`
    ),
    check(
      "question_notes_reply_check",
      sql`${t.teacherReply} is null or char_length(${t.teacherReply}) between 1 and 1000`
    ),
    check(
      "question_notes_reply_complete",
      sql`(${t.teacherReply} is null) = (${t.repliedBy} is null) and (${t.teacherReply} is null) = (${t.repliedAt} is null)`
    ),
    check(
      "question_notes_shared_check",
      sql`${t.sharedWithTeacher} = (${t.sharedAt} is not null)`
    ),
  ]
);
