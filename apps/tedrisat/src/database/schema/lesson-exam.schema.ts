import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { EXAM_DEFAULT_MAX_SCORE, ExamFormat } from "../../course/domain/exam";
import { lessons } from "./course.schema";

export const examFormat = pgEnum("exam_format", ExamFormat);

/**
 * A celse planned as "Sınav" (MDRS-248): at most one row per celse, which
 * stays a LIVE session in every other respect. RESTRICT like every foreign
 * key under a course: every purge that removes the celse removes these first
 * (`deleteLessonExams`).
 *
 * `reminded_at` is claimed once by the 24-hour reminder, so it is sent once
 * whichever instance gets there first; `results_released_at` is "Sonuçları
 * talebelere aç": until it is set no talebe reads a score.
 */
export const lessonExams = table(
  "lesson_exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .references(() => lessons.id, { onDelete: "restrict" })
      .notNull(),
    format: examFormat("format").default(ExamFormat.WRITTEN).notNull(),
    maxScore: integer("max_score").default(EXAM_DEFAULT_MAX_SCORE).notNull(),
    // Plain text as typed, never rendered as HTML; null is none.
    topics: text("topics"),
    location: text("location"),
    isRetake: boolean("is_retake").default(false).notNull(),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    resultsReleasedAt: timestamp("results_released_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("lesson_exams_lesson_id_uq").on(t.lessonId),
    check(
      "lesson_exams_max_score_check",
      sql`${t.maxScore} between 1 and 1000`
    ),
  ]
);

/**
 * One talebe's result on an exam: a score from 0 to the exam's `max_score`,
 * or "Girmedi" (`absent`, with no score). No row is not entered yet. The
 * upper bound is checked by the service, which reads `max_score` under a
 * lock; the database holds the shape. `user_id` and `graded_by` are not
 * foreign keys, like every other user column.
 */
export const examResults = table(
  "exam_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .references(() => lessonExams.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    score: integer("score"),
    absent: boolean("absent").default(false).notNull(),
    gradedBy: uuid("graded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("exam_results_exam_user_uq").on(t.examId, t.userId),
    check(
      "exam_results_score_check",
      sql`(${t.absent} and ${t.score} is null) or (not ${t.absent} and ${t.score} >= 0)`
    ),
  ]
);
