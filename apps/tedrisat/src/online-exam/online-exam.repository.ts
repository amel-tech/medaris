import { Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseExamTopics,
  examOptions,
  examQuestions,
  examQuestionTopics,
  onlineExams,
  onlineExamTopics,
  zerothOptions,
} from "../database/schema/online-exam.schema";
import {
  type AnswerMode,
  nextFreeTopicNumber,
  type Scoring,
  topicNameKey,
  topicNameOf,
} from "./domain/online-exam";
import {
  ExamLockedError,
  ExamStaleError,
  OnlineExamNotFoundError,
  QuestionNotFoundError,
  TopicExistsError,
  TopicNotFoundError,
  TopicNotOfCourseError,
  TopicNumberTakenError,
} from "./errors/online-exam.errors";

type Db = DatabaseService["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface ICourseTopic {
  id: string;
  number: number;
  name: string;
}

export interface IDraftQuestion {
  id: string;
  position: number;
  text: string;
  answerMode: AnswerMode;
  scoring: Scoring | null;
  ownPoints: number | null;
  topicIds: string[];
  options: Array<{ id: string; text: string; correct: boolean }>;
}

export interface IOnlineExamSummary {
  id: string;
  title: string;
  questionCount: number;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface IOnlineExamDraft {
  id: string;
  courseId: string;
  title: string;
  durationMinutes: number;
  instructions: string | null;
  zerothQuestion: string;
  zerothOptions: Array<{ id: string; text: string }>;
  topicIds: string[];
  questions: IDraftQuestion[];
  publishedAt: Date | null;
  closedEarlyAt: Date | null;
  version: number;
}

export interface IExamWrite {
  courseId: string;
  examId: string;
  version: number;
  actorId: string;
}

const UNIQUE_VIOLATION = "23505";
const constraintOf = (error: unknown): string | null => {
  const e = error as { code?: string; constraint?: string; cause?: unknown };
  if (e?.code === UNIQUE_VIOLATION) return e.constraint ?? "";
  if (e?.cause) return constraintOf(e.cause);
  return null;
};

/**
 * Online multiple-choice exams (MDRS-299), the team's side: the draft as the
 * exam page reads it, and every write of it. A write takes the exam row for
 * update, refuses a version the page no longer holds (EXAM_STALE) and an
 * exam that has opened (EXAM_LOCKED), bumps the version and writes its audit
 * row in the same transaction.
 */
@Injectable()
export class OnlineExamRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The course of an exam; null when there is no such exam. */
  async findExamCourseId(examId: string): Promise<string | null> {
    const [exam] = await this.db
      .select({ courseId: onlineExams.courseId })
      .from(onlineExams)
      .where(eq(onlineExams.id, examId))
      .limit(1);
    return exam?.courseId ?? null;
  }

  /** The course's online exams, the latest changed first. */
  async listExams(courseId: string): Promise<IOnlineExamSummary[]> {
    return this.db
      .select({
        id: onlineExams.id,
        title: onlineExams.title,
        questionCount: count(examQuestions.id),
        publishedAt: onlineExams.publishedAt,
        updatedAt: onlineExams.updatedAt,
      })
      .from(onlineExams)
      .leftJoin(examQuestions, eq(examQuestions.examId, onlineExams.id))
      .where(eq(onlineExams.courseId, courseId))
      .groupBy(onlineExams.id)
      .orderBy(desc(onlineExams.updatedAt));
  }

  /** Opens a draft: 60 minutes, no question, no celse. */
  async createExam(
    courseId: string,
    title: string,
    actorId: string
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [made] = await tx
        .insert(onlineExams)
        .values({ courseId, title, createdBy: actorId })
        .returning({ id: onlineExams.id });
      await tx.insert(auditLog).values({
        actorId,
        action: "online_exam.create",
        entity: "online_exam",
        entityId: made.id,
        details: { courseId, title },
      });
      return made.id;
    });
  }

  /** An exam of the course as its page reads it; null when there is none. */
  async findDraft(
    courseId: string,
    examId: string
  ): Promise<IOnlineExamDraft | null> {
    const [exam] = await this.db
      .select()
      .from(onlineExams)
      .where(
        and(eq(onlineExams.id, examId), eq(onlineExams.courseId, courseId))
      )
      .limit(1);
    if (!exam) return null;
    const [zeroth, picked, questions] = await Promise.all([
      this.db
        .select({ id: zerothOptions.id, text: zerothOptions.text })
        .from(zerothOptions)
        .where(eq(zerothOptions.examId, examId))
        .orderBy(asc(zerothOptions.position)),
      this.db
        .select({ topicId: onlineExamTopics.topicId })
        .from(onlineExamTopics)
        .where(eq(onlineExamTopics.examId, examId))
        .orderBy(asc(onlineExamTopics.position)),
      this.db
        .select()
        .from(examQuestions)
        .where(eq(examQuestions.examId, examId))
        .orderBy(asc(examQuestions.position)),
    ]);
    const ids = questions.map((q) => q.id);
    const [options, carried] = ids.length
      ? await Promise.all([
          this.db
            .select()
            .from(examOptions)
            .where(inArray(examOptions.questionId, ids))
            .orderBy(asc(examOptions.position)),
          this.db
            .select()
            .from(examQuestionTopics)
            .where(inArray(examQuestionTopics.questionId, ids)),
        ])
      : [[], []];
    return {
      id: exam.id,
      courseId: exam.courseId,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      instructions: exam.instructions,
      zerothQuestion: exam.zerothQuestion,
      zerothOptions: zeroth,
      topicIds: picked.map((p) => p.topicId),
      questions: questions.map((q) => ({
        id: q.id,
        position: q.position,
        text: q.text,
        answerMode: q.answerMode,
        scoring: q.scoring,
        ownPoints: q.ownPoints,
        topicIds: carried
          .filter((c) => c.questionId === q.id)
          .map((c) => c.topicId),
        options: options
          .filter((o) => o.questionId === q.id)
          .map((o) => ({ id: o.id, text: o.text, correct: o.correct })),
      })),
      publishedAt: exam.publishedAt,
      closedEarlyAt: exam.closedEarlyAt,
      version: exam.version,
    };
  }

  /** The course's topics, by number. */
  async listTopics(courseId: string): Promise<ICourseTopic[]> {
    return this.db
      .select({
        id: courseExamTopics.id,
        number: courseExamTopics.number,
        name: courseExamTopics.name,
      })
      .from(courseExamTopics)
      .where(eq(courseExamTopics.courseId, courseId))
      .orderBy(asc(courseExamTopics.number));
  }

  /** Adds a topic to the course's list, with its number or the next free one. */
  async createTopic(
    courseId: string,
    input: { name: string; number?: number },
    actorId: string
  ): Promise<ICourseTopic> {
    const name = topicNameOf(input.name);
    try {
      return await this.db.transaction(async (tx) => {
        const held = await tx
          .select({
            number: courseExamTopics.number,
            nameKey: courseExamTopics.nameKey,
          })
          .from(courseExamTopics)
          .where(eq(courseExamTopics.courseId, courseId));
        if (held.some((t) => t.nameKey === topicNameKey(name))) {
          throw new TopicExistsError(name);
        }
        const number =
          input.number ?? nextFreeTopicNumber(held.map((t) => t.number));
        if (held.some((t) => t.number === number)) {
          throw new TopicNumberTakenError(number);
        }
        const [made] = await tx
          .insert(courseExamTopics)
          .values({ courseId, number, name, nameKey: topicNameKey(name) })
          .returning({
            id: courseExamTopics.id,
            number: courseExamTopics.number,
            name: courseExamTopics.name,
          });
        await tx.insert(auditLog).values({
          actorId,
          action: "exam_topic.create",
          entity: "exam_topic",
          entityId: made.id,
          details: { courseId, number, name },
        });
        return made;
      });
    } catch (error) {
      throw this.topicConflict(error, name, input.number);
    }
  }

  /** Renames or renumbers a topic, for the whole course. */
  async updateTopic(
    courseId: string,
    topicId: string,
    input: { name?: string; number?: number },
    actorId: string
  ): Promise<ICourseTopic> {
    const name = input.name === undefined ? undefined : topicNameOf(input.name);
    try {
      return await this.db.transaction(async (tx) => {
        const [topic] = await tx
          .select()
          .from(courseExamTopics)
          .where(
            and(
              eq(courseExamTopics.id, topicId),
              eq(courseExamTopics.courseId, courseId)
            )
          )
          .for("update");
        if (!topic) throw new TopicNotFoundError(topicId);
        const others = await tx
          .select({
            id: courseExamTopics.id,
            number: courseExamTopics.number,
            nameKey: courseExamTopics.nameKey,
          })
          .from(courseExamTopics)
          .where(eq(courseExamTopics.courseId, courseId));
        if (
          name !== undefined &&
          others.some(
            (t) => t.id !== topicId && t.nameKey === topicNameKey(name)
          )
        ) {
          throw new TopicExistsError(name);
        }
        if (
          input.number !== undefined &&
          others.some((t) => t.id !== topicId && t.number === input.number)
        ) {
          throw new TopicNumberTakenError(input.number);
        }
        const [saved] = await tx
          .update(courseExamTopics)
          .set({
            ...(name === undefined
              ? {}
              : { name, nameKey: topicNameKey(name) }),
            ...(input.number === undefined ? {} : { number: input.number }),
            updatedAt: new Date(),
          })
          .where(eq(courseExamTopics.id, topicId))
          .returning({
            id: courseExamTopics.id,
            number: courseExamTopics.number,
            name: courseExamTopics.name,
          });
        await tx.insert(auditLog).values({
          actorId,
          action: "exam_topic.rename",
          entity: "exam_topic",
          entityId: topicId,
          details: {
            courseId,
            from: { number: topic.number, name: topic.name },
            to: { number: saved.number, name: saved.name },
          },
        });
        return saved;
      });
    } catch (error) {
      throw this.topicConflict(error, name, input.number);
    }
  }

  /** A unique index that two concurrent writes both passed, as the refusal it stands for. */
  private topicConflict(
    error: unknown,
    name: string | undefined,
    number: number | undefined
  ): unknown {
    const constraint = constraintOf(error);
    if (constraint === "course_exam_topics_name_uq" && name !== undefined) {
      return new TopicExistsError(name);
    }
    if (constraint === "course_exam_topics_number_uq" && number !== undefined) {
      return new TopicNumberTakenError(number);
    }
    return error;
  }

  /**
   * One write of an exam: the row taken for update, the version and the
   * state checked, `write` run, the version bumped and the audit row added,
   * all in one transaction. Returns `write`'s result and the new version.
   */
  async write<T>(
    w: IExamWrite,
    audit: { action: string; entityId?: string; details?: object },
    write: (tx: Tx) => Promise<T>
  ): Promise<{ result: T; version: number }> {
    return this.db.transaction(async (tx) => {
      const [exam] = await tx
        .select({
          version: onlineExams.version,
          publishedAt: onlineExams.publishedAt,
        })
        .from(onlineExams)
        .where(
          and(
            eq(onlineExams.id, w.examId),
            eq(onlineExams.courseId, w.courseId)
          )
        )
        .for("update");
      if (!exam) throw new OnlineExamNotFoundError(w.examId);
      if (exam.publishedAt !== null) throw new ExamLockedError(w.examId);
      if (exam.version !== w.version) {
        throw new ExamStaleError(w.examId, w.version);
      }
      const result = await write(tx);
      const [bumped] = await tx
        .update(onlineExams)
        .set({
          version: sql`${onlineExams.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(onlineExams.id, w.examId))
        .returning({ version: onlineExams.version });
      await tx.insert(auditLog).values({
        actorId: w.actorId,
        action: audit.action,
        entity: audit.action.split(".")[0],
        entityId: audit.entityId ?? w.examId,
        details: { courseId: w.courseId, examId: w.examId, ...audit.details },
      });
      return { result, version: bumped.version };
    });
  }

  /** The exam's settings, zeroth question and topics; only what is given changes. */
  async updateExam(
    tx: Tx,
    w: IExamWrite,
    input: {
      title?: string;
      durationMinutes?: number;
      instructions?: string | null;
      zerothQuestion?: string;
      zerothOptions?: string[];
      topicIds?: string[];
    }
  ): Promise<void> {
    const set = {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.durationMinutes === undefined
        ? {}
        : { durationMinutes: input.durationMinutes }),
      ...(input.instructions === undefined
        ? {}
        : { instructions: input.instructions }),
      ...(input.zerothQuestion === undefined
        ? {}
        : { zerothQuestion: input.zerothQuestion }),
    };
    if (Object.keys(set).length > 0) {
      await tx.update(onlineExams).set(set).where(eq(onlineExams.id, w.examId));
    }
    if (input.zerothOptions !== undefined) {
      await tx.delete(zerothOptions).where(eq(zerothOptions.examId, w.examId));
      if (input.zerothOptions.length > 0) {
        await tx.insert(zerothOptions).values(
          input.zerothOptions.map((text, position) => ({
            examId: w.examId,
            position,
            text,
          }))
        );
      }
    }
    if (input.topicIds !== undefined) {
      const picked = [...new Set(input.topicIds)];
      await this.assertCourseTopics(tx, w.courseId, picked);
      await tx
        .delete(onlineExamTopics)
        .where(eq(onlineExamTopics.examId, w.examId));
      if (picked.length > 0) {
        await tx.insert(onlineExamTopics).values(
          picked.map((topicId, position) => ({
            examId: w.examId,
            topicId,
            position,
          }))
        );
      }
      // Unpicking a topic takes it off the questions that carried it.
      const questionIds = tx
        .select({ id: examQuestions.id })
        .from(examQuestions)
        .where(eq(examQuestions.examId, w.examId));
      await tx.delete(examQuestionTopics).where(
        and(
          inArray(examQuestionTopics.questionId, questionIds),
          picked.length > 0
            ? sql`${examQuestionTopics.topicId} not in (${sql.join(
                picked.map((id) => sql`${id}::uuid`),
                sql`, `
              )})`
            : sql`true`
        )
      );
    }
  }

  /** Adds an empty question last; its five option fields are the page's, nothing is stored for them. */
  async addQuestion(tx: Tx, examId: string): Promise<string> {
    const [last] = await tx
      .select({ position: max(examQuestions.position) })
      .from(examQuestions)
      .where(eq(examQuestions.examId, examId));
    const [made] = await tx
      .insert(examQuestions)
      .values({ examId, position: (last?.position ?? -1) + 1 })
      .returning({ id: examQuestions.id });
    return made.id;
  }

  /** The question of this exam, taken for update; QUESTION_NOT_FOUND otherwise. */
  async lockQuestion(
    tx: Tx,
    examId: string,
    questionId: string
  ): Promise<{ id: string; ownPoints: number | null }> {
    const [question] = await tx
      .select({ id: examQuestions.id, ownPoints: examQuestions.ownPoints })
      .from(examQuestions)
      .where(
        and(eq(examQuestions.id, questionId), eq(examQuestions.examId, examId))
      )
      .for("update");
    if (!question) throw new QuestionNotFoundError(questionId);
    return question;
  }

  /**
   * Replaces a question as written: its text, options, mode and topics. A
   * topic of the course the exam has not picked yet is picked with it (a
   * number typed in the question form).
   */
  async saveQuestion(
    tx: Tx,
    w: IExamWrite,
    questionId: string,
    input: {
      text: string;
      options: Array<{ text: string; correct: boolean }>;
      answerMode: AnswerMode;
      scoring: Scoring | null;
      topicIds: string[];
    }
  ): Promise<void> {
    const topicIds = [...new Set(input.topicIds)];
    await this.assertCourseTopics(tx, w.courseId, topicIds);
    await tx
      .update(examQuestions)
      .set({
        text: input.text,
        answerMode: input.answerMode,
        scoring: input.scoring,
        updatedAt: new Date(),
      })
      .where(eq(examQuestions.id, questionId));
    await tx.delete(examOptions).where(eq(examOptions.questionId, questionId));
    if (input.options.length > 0) {
      await tx.insert(examOptions).values(
        input.options.map((o, position) => ({
          questionId,
          position,
          text: o.text,
          correct: o.correct,
        }))
      );
    }
    await tx
      .delete(examQuestionTopics)
      .where(eq(examQuestionTopics.questionId, questionId));
    if (topicIds.length > 0) {
      await tx
        .insert(examQuestionTopics)
        .values(topicIds.map((topicId) => ({ questionId, topicId })));
      const picked = await tx
        .select({
          topicId: onlineExamTopics.topicId,
          position: onlineExamTopics.position,
        })
        .from(onlineExamTopics)
        .where(eq(onlineExamTopics.examId, w.examId));
      const have = new Set(picked.map((p) => p.topicId));
      const missing = topicIds.filter((id) => !have.has(id));
      if (missing.length > 0) {
        const next =
          picked.reduce((top, p) => Math.max(top, p.position), -1) + 1;
        await tx.insert(onlineExamTopics).values(
          missing.map((topicId, i) => ({
            examId: w.examId,
            topicId,
            position: next + i,
          }))
        );
      }
    }
  }

  /** Removes a question with its options and topics. */
  async removeQuestion(tx: Tx, questionId: string): Promise<void> {
    await tx.delete(examOptions).where(eq(examOptions.questionId, questionId));
    await tx
      .delete(examQuestionTopics)
      .where(eq(examQuestionTopics.questionId, questionId));
    await tx.delete(examQuestions).where(eq(examQuestions.id, questionId));
  }

  /** Every question's own points, for the share; taken under the exam's lock. */
  async ownPointsOf(
    tx: Tx,
    examId: string
  ): Promise<Array<{ id: string; ownHundredths: number | null }>> {
    const rows = await tx
      .select({ id: examQuestions.id, own: examQuestions.ownPoints })
      .from(examQuestions)
      .where(eq(examQuestions.examId, examId))
      .orderBy(asc(examQuestions.position));
    return rows.map((r) => ({ id: r.id, ownHundredths: r.own }));
  }

  async setOwnPoints(
    tx: Tx,
    questionId: string,
    hundredths: number | null
  ): Promise<void> {
    await tx
      .update(examQuestions)
      .set({ ownPoints: hundredths, updatedAt: new Date() })
      .where(eq(examQuestions.id, questionId));
  }

  /** TOPIC_NOT_FOUND (400) for any topic that is not the course's. */
  private async assertCourseTopics(
    tx: Tx,
    courseId: string,
    topicIds: string[]
  ): Promise<void> {
    if (topicIds.length === 0) return;
    const found = await tx
      .select({ id: courseExamTopics.id })
      .from(courseExamTopics)
      .where(
        and(
          eq(courseExamTopics.courseId, courseId),
          inArray(courseExamTopics.id, topicIds)
        )
      );
    const have = new Set(found.map((t) => t.id));
    const missing = topicIds.filter((id) => !have.has(id));
    if (missing.length > 0) throw new TopicNotOfCourseError(missing);
  }
}
