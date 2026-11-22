import { Injectable } from "@nestjs/common";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  courses,
  courseWeeks,
  lessons,
} from "../database/schema/course.schema";
import {
  examAnswers,
  examAttempts,
  examTabSwitches,
  zerothAnswers,
} from "../database/schema/exam-attempt.schema";
import {
  onlineExams,
  zerothOptions,
} from "../database/schema/online-exam.schema";
import type { FinishedBy } from "./domain/exam-attempt";

type Db = DatabaseService["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A published online exam as its talebe reads it, by its celse. */
export interface IPublishedExam {
  examId: string;
  courseId: string;
  courseTitle: string;
  title: string;
  durationMinutes: number;
  instructions: string | null;
  zerothQuestion: string;
  startsAt: Date;
  latestStartAt: Date | null;
  closedEarlyAt: Date | null;
}

export type IAttempt = typeof examAttempts.$inferSelect;
export type IAnswer = typeof examAnswers.$inferSelect;

/**
 * The reads and writes of a talebe's sitting of an online exam (MDRS-299).
 * Every write of an attempt runs in `inAttempt`, which holds the row, so the
 * clock, the holder and the answers' count never race.
 */
@Injectable()
export class ExamAttemptRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * The published online exam of a celse that is neither cancelled nor
   * archived; null for any other celse, a draft's included.
   */
  async findPublishedByLesson(
    lessonId: string
  ): Promise<IPublishedExam | null> {
    const [row] = await this.db
      .select({
        examId: onlineExams.id,
        courseId: onlineExams.courseId,
        courseTitle: courses.title,
        title: onlineExams.title,
        durationMinutes: onlineExams.durationMinutes,
        instructions: onlineExams.instructions,
        zerothQuestion: onlineExams.zerothQuestion,
        startsAt: lessons.scheduledAt,
        latestStartAt: onlineExams.latestStartAt,
        closedEarlyAt: onlineExams.closedEarlyAt,
        cancelledAt: lessons.cancelledAt,
        archivedAt: lessons.archivedAt,
      })
      .from(onlineExams)
      .innerJoin(lessons, eq(lessons.id, onlineExams.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .where(
        and(
          eq(onlineExams.lessonId, lessonId),
          isNotNull(onlineExams.publishedAt)
        )
      )
      .limit(1);
    if (!row || row.startsAt === null) return null;
    if (row.cancelledAt !== null || row.archivedAt !== null) return null;
    const { cancelledAt: _c, archivedAt: _a, startsAt, ...rest } = row;
    return { ...rest, startsAt };
  }

  /** The exam's zeroth options, in the preparer's order. */
  zerothOptionsOf(
    examId: string
  ): Promise<Array<{ id: string; text: string }>> {
    return this.db
      .select({ id: zerothOptions.id, text: zerothOptions.text })
      .from(zerothOptions)
      .where(eq(zerothOptions.examId, examId))
      .orderBy(asc(zerothOptions.position));
  }

  async findZerothAnswer(
    examId: string,
    userId: string
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ optionId: zerothAnswers.optionId })
      .from(zerothAnswers)
      .where(
        and(eq(zerothAnswers.examId, examId), eq(zerothAnswers.userId, userId))
      )
      .limit(1);
    return row?.optionId ?? null;
  }

  /** Saves the caller's zeroth answer, replacing an earlier one. */
  async saveZerothAnswer(
    examId: string,
    userId: string,
    optionId: string,
    at: Date
  ): Promise<void> {
    await this.db
      .insert(zerothAnswers)
      .values({ examId, userId, optionId, answeredAt: at })
      .onConflictDoUpdate({
        target: [zerothAnswers.examId, zerothAnswers.userId],
        set: { optionId, answeredAt: at },
      });
  }

  async findAttempt(examId: string, userId: string): Promise<IAttempt | null> {
    const [row] = await this.db
      .select()
      .from(examAttempts)
      .where(
        and(eq(examAttempts.examId, examId), eq(examAttempts.userId, userId))
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Creates the caller's attempt with its drawn order; when another call
   * created it first, nothing is written and that one is answered.
   */
  async createAttempt(values: {
    examId: string;
    userId: string;
    questionOrder: string[];
    optionOrder: Record<string, string[]>;
    holderId: string;
    at: Date;
  }): Promise<IAttempt> {
    const [made] = await this.db
      .insert(examAttempts)
      .values({
        examId: values.examId,
        userId: values.userId,
        questionOrder: values.questionOrder,
        optionOrder: values.optionOrder,
        currentQuestionId: values.questionOrder[0] ?? null,
        countedAt: values.at,
        startedAt: values.at,
        holderId: values.holderId,
      })
      .onConflictDoNothing({
        target: [examAttempts.examId, examAttempts.userId],
      })
      .returning();
    return (
      made ??
      ((await this.findAttempt(values.examId, values.userId)) as IAttempt)
    );
  }

  /** Runs `fn` on the caller's attempt, held for update; null when there is none. */
  inAttempt<T>(
    examId: string,
    userId: string,
    fn: (tx: Tx, attempt: IAttempt) => Promise<T>
  ): Promise<T | null> {
    return this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(examAttempts)
        .where(
          and(eq(examAttempts.examId, examId), eq(examAttempts.userId, userId))
        )
        .for("update");
      if (!attempt) return null;
      return fn(tx, attempt);
    });
  }

  async updateAttempt(
    tx: Tx,
    id: string,
    set: Partial<{
      usedSeconds: number;
      countedAt: Date;
      holderId: string;
      lastSeq: number;
      currentQuestionId: string | null;
      finishedAt: Date;
      finishedBy: FinishedBy;
      scoreHundredths: number;
    }>
  ): Promise<IAttempt> {
    const [row] = await tx
      .update(examAttempts)
      .set(set)
      .where(eq(examAttempts.id, id))
      .returning();
    return row;
  }

  /** The attempt's answers, in the caller's transaction when it gives one. */
  answersOf(attemptId: string, tx?: Tx): Promise<IAnswer[]> {
    return (tx ?? this.db)
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.attemptId, attemptId));
  }

  async saveAnswer(
    tx: Tx,
    answer: {
      attemptId: string;
      questionId: string;
      optionIds: string[];
      skipped: boolean;
      at: Date;
    }
  ): Promise<IAnswer> {
    const [row] = await tx
      .insert(examAnswers)
      .values({
        attemptId: answer.attemptId,
        questionId: answer.questionId,
        optionIds: answer.optionIds,
        skipped: answer.skipped,
        savedAt: answer.at,
      })
      .onConflictDoUpdate({
        target: [examAnswers.attemptId, examAnswers.questionId],
        set: {
          optionIds: answer.optionIds,
          skipped: answer.skipped,
          savedAt: answer.at,
        },
      })
      .returning();
    return row;
  }

  /** Counts one switch and keeps it with its time. */
  async recordSwitch(tx: Tx, attemptId: string, at: Date): Promise<IAttempt> {
    await tx.insert(examTabSwitches).values({ attemptId, at });
    const [row] = await tx
      .update(examAttempts)
      .set({ switches: sql`${examAttempts.switches} + 1` })
      .where(eq(examAttempts.id, attemptId))
      .returning();
    return row;
  }
}
