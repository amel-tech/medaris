import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { FinishedBy } from "../../online-exam/domain/exam-attempt";
import {
  examQuestions,
  onlineExams,
  zerothOptions,
} from "./online-exam.schema";

export const examFinishedBy = pgEnum("exam_finished_by", FinishedBy);

/**
 * One talebe's sitting of a published online exam (MDRS-299): the order the
 * questions and their options were drawn in for them, where they are, and
 * the time they have used. One per talebe and exam: an exam is taken once.
 *
 * The clock is the server's and runs only while the page holding the attempt
 * is connected (the owner, 21 Nov 2026: the clock does not run while the
 * connection is lost). `used_seconds` grows by the time since
 * `counted_at`, capped, on each call of the holding page, so a lost
 * connection costs the talebe nothing. `holder_id` is the tab or device that
 * holds the attempt: the last one to open the exam, which alone may save,
 * count a switch and finish. `last_seq` is the holder's count of its answer
 * saves, so an earlier save that arrives late writes nothing.
 *
 * In progress while `finished_at` is null. RESTRICT like every foreign key
 * under a course: the course purge removes these before the exams.
 */
export const examAttempts = table(
  "exam_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .references(() => onlineExams.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    // The question ids in this talebe's order, and for each its option ids.
    questionOrder: jsonb("question_order").$type<string[]>().notNull(),
    optionOrder: jsonb("option_order")
      .$type<Record<string, string[]>>()
      .notNull(),
    currentQuestionId: uuid("current_question_id"),
    usedSeconds: integer("used_seconds").default(0).notNull(),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull(),
    holderId: text("holder_id").notNull(),
    lastSeq: integer("last_seq").default(0).notNull(),
    switches: integer("switches").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finishedBy: examFinishedBy("finished_by"),
    // In hundredths, rounded once from the exact points when it finishes.
    scoreHundredths: integer("score_hundredths"),
  },
  (t) => [
    uniqueIndex("exam_attempts_exam_user_uq").on(t.examId, t.userId),
    check("exam_attempts_used_check", sql`${t.usedSeconds} >= 0`),
    check(
      "exam_attempts_finished_check",
      sql`(${t.finishedAt} is null) = (${t.finishedBy} is null)`
    ),
  ]
);

/**
 * A talebe's answer to one question of their attempt, saved the moment it is
 * chosen. `option_ids` is empty when the question was skipped or cleared.
 */
export const examAnswers = table(
  "exam_answers",
  {
    attemptId: uuid("attempt_id")
      .references(() => examAttempts.id, { onDelete: "restrict" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => examQuestions.id, { onDelete: "restrict" })
      .notNull(),
    optionIds: jsonb("option_ids").$type<string[]>().notNull(),
    skipped: boolean("skipped").default(false).notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.questionId] }),
    index("exam_answers_question_idx").on(t.questionId),
  ]
);

/**
 * A talebe's answer to an exam's zeroth question (the hadith's), given before
 * the start and required for it; it replaces the earlier one until the
 * attempt starts, and stays after. It has no correct option and no points.
 */
export const zerothAnswers = table(
  "zeroth_answers",
  {
    examId: uuid("exam_id")
      .references(() => onlineExams.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    optionId: uuid("option_id")
      .references(() => zerothOptions.id, { onDelete: "restrict" })
      .notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.examId, t.userId] }),
    index("zeroth_answers_option_idx").on(t.optionId),
  ]
);

/**
 * A deliberate switch to another tab or window during an attempt, kept with
 * its time for the team. Nothing is erased: the attempt goes on where it was
 * (decided 22 Nov 2026, tedris.exams.take D1).
 */
export const examTabSwitches = table(
  "exam_tab_switches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .references(() => examAttempts.id, { onDelete: "restrict" })
      .notNull(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("exam_tab_switches_attempt_idx").on(t.attemptId)]
);
