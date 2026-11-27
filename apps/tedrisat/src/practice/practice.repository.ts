import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { enrolledCourseIds } from "../database/enrolled-courses";
import { courses } from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import {
  examOptions,
  examQuestions,
  examQuestionTopics,
  onlineExams,
} from "../database/schema/online-exam.schema";
import {
  practiceAnswers,
  practiceAttempts,
} from "../database/schema/practice.schema";
import {
  type AnswerMode,
  ExamKind,
  type Scoring,
} from "../online-exam/domain/online-exam";
import type { PoolMode } from "./domain/practice";

type Db = DatabaseService["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type IPracticeAttempt = typeof practiceAttempts.$inferSelect;
export type IPracticeAnswer = typeof practiceAnswers.$inferSelect;

/** A published çalışma seti with its course's title. */
export interface IPracticeSet {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  instructions: string | null;
  publishedAt: Date;
}

/** One question of a set as the lists count it. */
export interface ICountedQuestion {
  id: string;
  setId: string;
  text: string;
  options: number;
  correct: number;
  topics: number;
}

/** A question of an attempt, with only what solving and scoring it read. */
export interface IAttemptQuestion {
  id: string;
  setId: string;
  setTitle: string;
  text: string;
  answerMode: AnswerMode;
  scoring: Scoring | null;
  ownPoints: number | null;
  options: Array<{ id: string; text: string; correct: boolean }>;
}

/** How a set's finished attempts went, for its team. */
export interface ISetStats {
  setId: string;
  talebeCount: number;
  attemptCount: number;
  averageHundredths: number | null;
}

/** A published set of kind PRACTICE. */
const publishedSet = and(
  eq(onlineExams.kind, ExamKind.PRACTICE),
  isNotNull(onlineExams.publishedAt)
);

/**
 * The reads and writes of a talebe's çalışma soruları (MDRS-248). Every read
 * of an attempt is scoped to its talebe in its query, and every write of one
 * runs in `inAttempt`, which holds its row.
 */
@Injectable()
export class PracticeRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The course of a published çalışma seti; null for a draft, an exam or no such id. */
  async findSetCourse(setId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: onlineExams.courseId })
      .from(onlineExams)
      .where(and(eq(onlineExams.id, setId), publishedSet))
      .limit(1);
    return row?.courseId ?? null;
  }

  /** The course of the caller's own attempt; null for anyone else's. */
  async findAttemptCourse(
    attemptId: string,
    userId: string
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: practiceAttempts.courseId })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.id, attemptId),
          eq(practiceAttempts.userId, userId)
        )
      )
      .limit(1);
    return row?.courseId ?? null;
  }

  /**
   * The courses `userId` holds an ENROLLED or COMPLETED seat in and is not
   * barred from, published and not hidden, nor their köşk.
   */
  async seatedCourseIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: courses.id })
      .from(courses)
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(
        and(
          isNull(courses.archivedAt),
          isNull(kosks.archivedAt),
          eq(courses.status, CourseStatus.PUBLISHED),
          inArray(
            courses.id,
            enrolledCourseIds(this.db, userId, [
              EnrollmentStatus.ENROLLED,
              EnrollmentStatus.COMPLETED,
            ])
          )
        )
      );
    return rows.map((r) => r.id);
  }

  /** The published çalışma setleri of the courses, the latest published first. */
  async listSets(courseIds: string[]): Promise<IPracticeSet[]> {
    if (courseIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: onlineExams.id,
        courseId: onlineExams.courseId,
        courseTitle: courses.title,
        title: onlineExams.title,
        instructions: onlineExams.instructions,
        publishedAt: onlineExams.publishedAt,
      })
      .from(onlineExams)
      .innerJoin(courses, eq(courses.id, onlineExams.courseId))
      .where(and(inArray(onlineExams.courseId, courseIds), publishedSet))
      .orderBy(desc(onlineExams.publishedAt), asc(onlineExams.id));
    return rows.flatMap(({ publishedAt, ...row }) =>
      publishedAt ? [{ ...row, publishedAt }] : []
    );
  }

  /** One published çalışma seti; null for a draft, an exam or no such id. */
  async findSet(setId: string): Promise<IPracticeSet | null> {
    const [row] = await this.db
      .select({
        id: onlineExams.id,
        courseId: onlineExams.courseId,
        courseTitle: courses.title,
        title: onlineExams.title,
        instructions: onlineExams.instructions,
        publishedAt: onlineExams.publishedAt,
      })
      .from(onlineExams)
      .innerJoin(courses, eq(courses.id, onlineExams.courseId))
      .where(and(eq(onlineExams.id, setId), publishedSet))
      .limit(1);
    if (!row?.publishedAt) return null;
    return { ...row, publishedAt: row.publishedAt };
  }

  /** Every question of the sets, with how many options, correct options and topics it has. */
  async countedQuestions(setIds: string[]): Promise<ICountedQuestion[]> {
    if (setIds.length === 0) return [];
    // Named in full: a select from one table writes its columns unqualified,
    // and a bare "id" inside the subqueries would be their own table's.
    const question = sql`${sql.identifier("exam_questions")}.${sql.identifier("id")}`;
    return this.db
      .select({
        id: examQuestions.id,
        setId: examQuestions.examId,
        text: examQuestions.text,
        options: sql<number>`(select count(*)::int from ${examOptions} where ${examOptions.questionId} = ${question})`,
        correct: sql<number>`(select count(*)::int from ${examOptions} where ${examOptions.questionId} = ${question} and ${examOptions.correct})`,
        topics: sql<number>`(select count(*)::int from ${examQuestionTopics} where ${examQuestionTopics.questionId} = ${question})`,
      })
      .from(examQuestions)
      .where(inArray(examQuestions.examId, setIds));
  }

  /**
   * The course's question pool as the lists count it: every question of
   * its published çalışma setleri, no exam's and no draft's. Only what tells
   * a complete question is read, not the options themselves.
   */
  async countedPoolQuestions(
    courseId: string,
    tx?: Tx
  ): Promise<ICountedQuestion[]> {
    const question = sql`${sql.identifier("exam_questions")}.${sql.identifier("id")}`;
    return (tx ?? this.db)
      .select({
        id: examQuestions.id,
        setId: examQuestions.examId,
        text: examQuestions.text,
        options: sql<number>`(select count(*)::int from ${examOptions} where ${examOptions.questionId} = ${question})`,
        correct: sql<number>`(select count(*)::int from ${examOptions} where ${examOptions.questionId} = ${question} and ${examOptions.correct})`,
        topics: sql<number>`(select count(*)::int from ${examQuestionTopics} where ${examQuestionTopics.questionId} = ${question})`,
      })
      .from(examQuestions)
      .innerJoin(onlineExams, eq(onlineExams.id, examQuestions.examId))
      .where(and(eq(onlineExams.courseId, courseId), publishedSet));
  }

  /** The option ids of the questions, each question's in its own order. */
  async optionIdsOf(
    questionIds: string[],
    tx?: Tx
  ): Promise<Array<{ id: string; questionId: string }>> {
    if (questionIds.length === 0) return [];
    return (tx ?? this.db)
      .select({ id: examOptions.id, questionId: examOptions.questionId })
      .from(examOptions)
      .where(inArray(examOptions.questionId, questionIds))
      .orderBy(asc(examOptions.position));
  }

  /**
   * The questions by id with their set's title and their options: only the
   * columns an attempt's page and its scoring read, so a pool attempt of
   * hundreds of questions reads no more than it needs.
   */
  async questionsByIds(ids: string[], tx?: Tx): Promise<IAttemptQuestion[]> {
    if (ids.length === 0) return [];
    const db = tx ?? this.db;
    const [questions, options] = await Promise.all([
      db
        .select({
          id: examQuestions.id,
          setId: examQuestions.examId,
          setTitle: onlineExams.title,
          text: examQuestions.text,
          answerMode: examQuestions.answerMode,
          scoring: examQuestions.scoring,
          ownPoints: examQuestions.ownPoints,
        })
        .from(examQuestions)
        .innerJoin(onlineExams, eq(onlineExams.id, examQuestions.examId))
        .where(inArray(examQuestions.id, ids)),
      db
        .select({
          id: examOptions.id,
          questionId: examOptions.questionId,
          text: examOptions.text,
          correct: examOptions.correct,
        })
        .from(examOptions)
        .where(inArray(examOptions.questionId, ids))
        .orderBy(asc(examOptions.position)),
    ]);
    const byQuestion = new Map<string, IAttemptQuestion["options"]>();
    for (const { questionId, ...o } of options) {
      const list = byQuestion.get(questionId) ?? [];
      list.push(o);
      byQuestion.set(questionId, list);
    }
    return questions.map((q) => ({
      ...q,
      options: byQuestion.get(q.id) ?? [],
    }));
  }

  /** The caller's pool attempt in progress in the course, or null. */
  async findOpenPoolAttempt(
    userId: string,
    courseId: string,
    tx?: Tx
  ): Promise<IPracticeAttempt | null> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          eq(practiceAttempts.courseId, courseId),
          isNull(practiceAttempts.setId),
          isNull(practiceAttempts.finishedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** The caller's latest pool attempts in the course, the latest started first. */
  async poolAttemptsOf(
    userId: string,
    courseId: string,
    limit: number
  ): Promise<IPracticeAttempt[]> {
    return this.db
      .select()
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          eq(practiceAttempts.courseId, courseId),
          isNull(practiceAttempts.setId)
        )
      )
      .orderBy(desc(practiceAttempts.startedAt), desc(practiceAttempts.id))
      .limit(limit);
  }

  /**
   * Starts a pool attempt in the course, unless one is in progress, which
   * is returned instead: `practice_attempts_pool_open_uq` settles two
   * starts at once. The course's published sets are held for share before
   * `draw` reads their questions on the same connection, so none goes back
   * to a draft, the only way its questions change, until the attempt is
   * written (and after that the take-back sees it).
   */
  async startPoolAttempt(
    input: { courseId: string; userId: string; poolMode: PoolMode },
    draw: (tx: Tx) => Promise<{
      questionOrder: string[];
      optionOrder: Record<string, string[]>;
    }>
  ): Promise<IPracticeAttempt | null> {
    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: onlineExams.id })
        .from(onlineExams)
        .where(and(eq(onlineExams.courseId, input.courseId), publishedSet))
        .for("share");
      const [made] = await tx
        .insert(practiceAttempts)
        .values({ ...input, setId: null, ...(await draw(tx)) })
        .onConflictDoNothing()
        .returning();
      return made ?? this.findOpenPoolAttempt(input.userId, input.courseId, tx);
    });
  }

  /**
   * How the course's published sets were solved: per set, how many talebe
   * finished it, how many finished attempts there are and their average
   * score in hundredths, rounded half up. A set nobody finished is absent.
   */
  async setStats(courseId: string): Promise<ISetStats[]> {
    const rows = await this.db
      .select({
        setId: practiceAttempts.setId,
        talebeCount: sql<number>`count(distinct ${practiceAttempts.userId})::int`,
        attemptCount: sql<number>`count(*)::int`,
        averageHundredths: sql<
          number | null
        >`round(avg(${practiceAttempts.scoreHundredths}))::int`,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.courseId, courseId),
          isNotNull(practiceAttempts.setId),
          isNotNull(practiceAttempts.finishedAt)
        )
      )
      .groupBy(practiceAttempts.setId);
    return rows.flatMap(({ setId, ...row }) =>
      setId === null ? [] : [{ setId, ...row }]
    );
  }

  /** The caller's attempts at the sets, the latest started first. */
  async attemptsOf(
    userId: string,
    setIds: string[]
  ): Promise<IPracticeAttempt[]> {
    if (setIds.length === 0) return [];
    return this.db
      .select()
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          inArray(practiceAttempts.setId, setIds)
        )
      )
      .orderBy(desc(practiceAttempts.startedAt), desc(practiceAttempts.id));
  }

  /** The caller's attempt in progress at the set, or null. */
  async findOpenAttempt(
    userId: string,
    setId: string,
    tx?: Tx
  ): Promise<IPracticeAttempt | null> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          eq(practiceAttempts.setId, setId),
          isNull(practiceAttempts.finishedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** The caller's own attempt, or null. */
  async findAttempt(
    attemptId: string,
    userId: string
  ): Promise<IPracticeAttempt | null> {
    const [row] = await this.db
      .select()
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.id, attemptId),
          eq(practiceAttempts.userId, userId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Starts an attempt at a set, unless one is in progress, which is
   * returned instead: the open-attempt index settles two starts at once.
   * The set's row is held for share before `draw` reads its questions on
   * the same connection, so
   * taking it back to a draft, the only way its questions change, waits;
   * null when it is no published set any more.
   */
  async startAttempt(
    input: { setId: string; courseId: string; userId: string },
    draw: (tx: Tx) => Promise<{
      questionOrder: string[];
      optionOrder: Record<string, string[]>;
    }>
  ): Promise<IPracticeAttempt | null> {
    return this.db.transaction(async (tx) => {
      const [set] = await tx
        .select({ id: onlineExams.id })
        .from(onlineExams)
        .where(and(eq(onlineExams.id, input.setId), publishedSet))
        .for("share");
      if (!set) return null;
      const [made] = await tx
        .insert(practiceAttempts)
        .values({ ...input, ...(await draw(tx)) })
        .onConflictDoNothing()
        .returning();
      return made ?? this.findOpenAttempt(input.userId, input.setId, tx);
    });
  }

  /** The attempt's answers. */
  answersOf(attemptId: string, tx?: Tx): Promise<IPracticeAnswer[]> {
    return (tx ?? this.db)
      .select()
      .from(practiceAnswers)
      .where(eq(practiceAnswers.attemptId, attemptId));
  }

  /** Runs `fn` on the caller's own attempt, its row held; null when there is none. */
  async inAttempt<T>(
    attemptId: string,
    userId: string,
    fn: (tx: Tx, attempt: IPracticeAttempt) => Promise<T>
  ): Promise<T | null> {
    return this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(practiceAttempts)
        .where(
          and(
            eq(practiceAttempts.id, attemptId),
            eq(practiceAttempts.userId, userId)
          )
        )
        .for("update");
      return attempt ? fn(tx, attempt) : null;
    });
  }

  /** Saves one answer, replacing the one before. */
  async saveAnswer(
    tx: Tx,
    input: {
      attemptId: string;
      questionId: string;
      optionIds: string[];
      at: Date;
    }
  ): Promise<IPracticeAnswer> {
    const [saved] = await tx
      .insert(practiceAnswers)
      .values({
        attemptId: input.attemptId,
        questionId: input.questionId,
        optionIds: input.optionIds,
        savedAt: input.at,
      })
      .onConflictDoUpdate({
        target: [practiceAnswers.attemptId, practiceAnswers.questionId],
        set: { optionIds: input.optionIds, savedAt: input.at },
      })
      .returning();
    return saved;
  }

  async updateAttempt(
    tx: Tx,
    attemptId: string,
    set: Partial<
      Pick<
        IPracticeAttempt,
        | "currentQuestionId"
        | "finishedAt"
        | "correctCount"
        | "wrongCount"
        | "blankCount"
        | "scoreHundredths"
      >
    >
  ): Promise<IPracticeAttempt> {
    const [updated] = await tx
      .update(practiceAttempts)
      .set(set)
      .where(eq(practiceAttempts.id, attemptId))
      .returning();
    return updated;
  }
}
