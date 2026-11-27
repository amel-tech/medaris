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
import { ExamKind } from "../online-exam/domain/online-exam";

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
  setId: string;
  text: string;
  options: number;
  correct: number;
  topics: number;
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
        setId: examQuestions.examId,
        text: examQuestions.text,
        options: sql<number>`(select count(*)::int from ${examOptions} where ${examOptions.questionId} = ${question})`,
        correct: sql<number>`(select count(*)::int from ${examOptions} where ${examOptions.questionId} = ${question} and ${examOptions.correct})`,
        topics: sql<number>`(select count(*)::int from ${examQuestionTopics} where ${examQuestionTopics.questionId} = ${question})`,
      })
      .from(examQuestions)
      .where(inArray(examQuestions.examId, setIds));
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
