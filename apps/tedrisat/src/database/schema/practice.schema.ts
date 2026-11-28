import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PoolMode } from "../../practice/domain/practice";
import { courses } from "./course.schema";
import { examQuestions, onlineExams } from "./online-exam.schema";

/**
 * One talebe's solving of a çalışma seti (MDRS-248): the order its questions
 * and their options were drawn in for this attempt, where they are, and,
 * once finished, how it went. A talebe solves a set as often as they like,
 * so there is no unique key on the set and the talebe: only one attempt of a
 * set is open at a time (`practice_attempts_open_uq`). There is no clock, no
 * holder and no tab count, unlike `exam_attempts`, which this does not touch.
 *
 * `set_id` null is a solving of the course's question pool rather than of
 * one set, with `pool_mode` saying how it was drawn (ALL or RANDOM); one
 * pool attempt per talebe and course is open at a time
 * (`practice_attempts_pool_open_uq`, MDRS-248 Faz 4). RESTRICT like every foreign key under a
 * course: the course purge removes these before the sets.
 */
export const practiceAttempts = table(
  "practice_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    setId: uuid("set_id").references(() => onlineExams.id, {
      onDelete: "restrict",
    }),
    poolMode: text("pool_mode").$type<PoolMode>(),
    // The question ids in this attempt's order, and for each its option ids.
    questionOrder: jsonb("question_order").$type<string[]>().notNull(),
    optionOrder: jsonb("option_order")
      .$type<Record<string, string[]>>()
      .notNull(),
    currentQuestionId: uuid("current_question_id"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    correctCount: integer("correct_count"),
    wrongCount: integer("wrong_count"),
    blankCount: integer("blank_count"),
    // The share of the questions got, in hundredths of a percent, rounded once.
    scoreHundredths: integer("score_hundredths"),
  },
  (t) => [
    index("practice_attempts_user_course_idx").on(t.userId, t.courseId),
    index("practice_attempts_set_idx").on(t.setId),
    uniqueIndex("practice_attempts_open_uq")
      .on(t.userId, t.setId)
      .where(sql`${t.finishedAt} is null and ${t.setId} is not null`),
    uniqueIndex("practice_attempts_pool_open_uq")
      .on(t.userId, t.courseId)
      .where(sql`${t.finishedAt} is null and ${t.setId} is null`),
    check(
      "practice_attempts_pool_check",
      sql`(${t.setId} is null) = (${t.poolMode} is not null) and (${t.poolMode} is null or ${t.poolMode} in ('ALL', 'RANDOM'))`
    ),
    check(
      "practice_attempts_finished_check",
      sql`(${t.finishedAt} is null) = (${t.scoreHundredths} is null)`
    ),
  ]
);

/**
 * A talebe's answer to one question of their attempt, saved the moment it is
 * chosen. `option_ids` is empty when it was cleared.
 */
export const practiceAnswers = table(
  "practice_answers",
  {
    attemptId: uuid("attempt_id")
      .references(() => practiceAttempts.id, { onDelete: "restrict" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => examQuestions.id, { onDelete: "restrict" })
      .notNull(),
    optionIds: jsonb("option_ids").$type<string[]>().notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.questionId] }),
    index("practice_answers_question_idx").on(t.questionId),
  ]
);
