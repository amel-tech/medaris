import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AnswerMode,
  ExamKind,
  Scoring,
} from "../../online-exam/domain/online-exam";
import { courses, lessons } from "./course.schema";
import { madrasahs } from "./madrasah.schema";

export const examAnswerMode = pgEnum("exam_answer_mode", AnswerMode);
export const examScoring = pgEnum("exam_scoring", Scoring);
export const examKind = pgEnum("exam_kind", ExamKind);

/**
 * One topic of a course's online exams (MDRS-299): a short name with a number
 * of its own in the course ("3. Kıyas"), which the team types to pick it. Kept
 * by the course and picked by its exams and questions; a rename or a new
 * number is the course's, so every exam that carries it reads it.
 * `name_key` is the name in Turkish lower case, so "İcma" and "icma" clash.
 * RESTRICT like every foreign key under a course: the course purge removes
 * these after the exams that pick them.
 */
export const courseExamTopics = table(
  "course_exam_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("course_exam_topics_number_uq").on(t.courseId, t.number),
    uniqueIndex("course_exam_topics_name_uq").on(t.courseId, t.nameKey),
    check(
      "course_exam_topics_number_check",
      sql`${t.number} between 1 and 999`
    ),
  ]
);

/**
 * An online multiple-choice exam of a course (MDRS-299): its settings, its
 * zeroth question and where it stands. The team opens it on the course's
 * "Sınavlar" page as a draft (60 minutes, no question), and a draft has no
 * celse: no talebe can see it anywhere (the owner, 22 Nov 2026: "Celsesiz
 * taslak"). Publishing it makes its exam celse, whose time is the earliest
 * start, and sets `lesson_id`.
 *
 * `version` is bumped by every write of the exam, its topics, its questions
 * and their points; a write that names an older one is refused
 * (EXAM_STALE), so two people editing it never overwrite each other unseen.
 *
 * `kind` PRACTICE is a çalışma seti (MDRS-248): published without a celse,
 * so its `lesson_id` stays null, and solved by the talebe in
 * `practice_attempts` as often as they like.
 */
export const onlineExams = table(
  "online_exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    // Set when the exam is published and its celse is made.
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "restrict",
    }),
    kind: examKind("kind").default(ExamKind.EXAM).notNull(),
    title: text("title").notNull(),
    // No default: the team types it, and an exam without it is not published
    // (the owner, 22 Nov 2026: "sınav süresinin varsayılanı olmasın, zorunlu
    // olsun ama boş kalsın o olmadan sınav yayına alınamasın").
    durationMinutes: integer("duration_minutes"),
    instructions: text("instructions"),
    zerothQuestion: text("zeroth_question").default("").notNull(),
    latestStartAt: timestamp("latest_start_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    closedEarlyAt: timestamp("closed_early_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("online_exams_course_idx").on(t.courseId),
    uniqueIndex("online_exams_lesson_uq").on(t.lessonId),
    check("online_exams_duration_check", sql`${t.durationMinutes} >= 1`),
    // A çalışma seti never has a celse.
    check(
      "online_exams_kind_lesson_check",
      sql`${t.kind} = 'EXAM' or ${t.lessonId} is null`
    ),
  ]
);

/** A topic an exam has picked from its course's list, in the team's order. */
export const onlineExamTopics = table(
  "online_exam_topics",
  {
    examId: uuid("exam_id")
      .references(() => onlineExams.id, { onDelete: "restrict" })
      .notNull(),
    topicId: uuid("topic_id")
      .references(() => courseExamTopics.id, { onDelete: "restrict" })
      .notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.examId, t.topicId] }),
    index("online_exam_topics_topic_idx").on(t.topicId),
  ]
);

/**
 * One option of an exam's zeroth question (the hadith's question): none is
 * correct and none carries points.
 */
export const zerothOptions = table(
  "zeroth_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .references(() => onlineExams.id, { onDelete: "restrict" })
      .notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("zeroth_options_exam_idx").on(t.examId)]
);

/**
 * One multiple-choice question of an exam, in the preparer's order (a talebe
 * gets an order of their own). `own_points` is in hundredths, null when it
 * shares what the own points leave of 100. A question is kept as it is
 * written, complete or not; an incomplete one keeps the exam from being
 * published.
 */
export const examQuestions = table(
  "exam_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .references(() => onlineExams.id, { onDelete: "restrict" })
      .notNull(),
    position: integer("position").notNull(),
    text: text("text").default("").notNull(),
    answerMode: examAnswerMode("answer_mode")
      .default(AnswerMode.SINGLE)
      .notNull(),
    scoring: examScoring("scoring"),
    ownPoints: integer("own_points"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("exam_questions_exam_idx").on(t.examId),
    check(
      "exam_questions_own_points_check",
      sql`${t.ownPoints} is null or ${t.ownPoints} between 1 and 10000`
    ),
    check(
      "exam_questions_scoring_check",
      sql`(${t.answerMode} = 'MULTIPLE') = (${t.scoring} is not null)`
    ),
  ]
);

/** A topic a question carries, one of its course's. */
export const examQuestionTopics = table(
  "exam_question_topics",
  {
    questionId: uuid("question_id")
      .references(() => examQuestions.id, { onDelete: "restrict" })
      .notNull(),
    topicId: uuid("topic_id")
      .references(() => courseExamTopics.id, { onDelete: "restrict" })
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.topicId] }),
    index("exam_question_topics_topic_idx").on(t.topicId),
  ]
);

/** One option of a question; `correct` is never sent to a talebe before the release. */
export const examOptions = table(
  "exam_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .references(() => examQuestions.id, { onDelete: "restrict" })
      .notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    correct: boolean("correct").default(false).notNull(),
  },
  (t) => [index("exam_options_question_idx").on(t.questionId)]
);

/**
 * A medrese's zeroth question (MDRS-299), asked before every exam of its
 * courses: one per medrese, about the hadith the page shows fixed. The owner,
 * 22 Nov 2026: the same question for every exam of a term, changed for the
 * next. Publishing an exam copies it into the exam (`online_exams.
 * zeroth_question`, `zeroth_options`), so a change reaches only the exams
 * published after it. It goes with its medrese; `updated_by` is not a foreign
 * key, like every user column here.
 */
export const madrasahZerothQuestions = table("madrasah_zeroth_questions", {
  madrasahId: uuid("madrasah_id")
    .primaryKey()
    .references(() => madrasahs.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: uuid("updated_by").notNull(),
});

/** One option of a medrese's zeroth question, in its order: none is correct, none carries points. */
export const madrasahZerothOptions = table(
  "madrasah_zeroth_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    madrasahId: uuid("madrasah_id").notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    // Named here: the generated name is longer than Postgres keeps (63).
    foreignKey({
      name: "madrasah_zeroth_options_question_fk",
      columns: [t.madrasahId],
      foreignColumns: [madrasahZerothQuestions.madrasahId],
    }).onDelete("cascade"),
    uniqueIndex("madrasah_zeroth_options_position_uq").on(
      t.madrasahId,
      t.position
    ),
  ]
);

/**
 * A course's own zeroth question (MDRS-299), asked before its exams instead of
 * its medrese's. The owner, 22 Nov 2026: "ders özelinde sıfırıncı soru mümkün
 * olsun, medreseninki default olur ders özelinde değişebilir". A course of a
 * köşk alone has no medrese, so its own is the only one it can publish with.
 * Publishing copies whichever applies into the exam, as with the medrese's.
 * RESTRICT like every foreign key under a course: the course purge removes it.
 */
export const courseZerothQuestions = table("course_zeroth_questions", {
  courseId: uuid("course_id")
    .primaryKey()
    .references(() => courses.id, { onDelete: "restrict" }),
  text: text("text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: uuid("updated_by").notNull(),
});

/** One option of a course's own zeroth question, in its order: none is correct, none carries points. */
export const courseZerothOptions = table(
  "course_zeroth_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    // Named here, as the medrese's: the generated name is longer than Postgres keeps (63).
    foreignKey({
      name: "course_zeroth_options_question_fk",
      columns: [t.courseId],
      foreignColumns: [courseZerothQuestions.courseId],
    }).onDelete("cascade"),
    uniqueIndex("course_zeroth_options_position_uq").on(t.courseId, t.position),
  ]
);
