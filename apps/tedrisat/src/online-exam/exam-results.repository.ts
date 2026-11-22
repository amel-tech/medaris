import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { displayNameOf } from "../assignment/assignment.service";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import { enrollments, lessons } from "../database/schema/course.schema";
import {
  examAnswers,
  examAttempts,
  examTabSwitches,
  zerothAnswers,
} from "../database/schema/exam-attempt.schema";
import {
  examResults,
  lessonExams,
} from "../database/schema/lesson-exam.schema";
import {
  onlineExams,
  zerothOptions,
} from "../database/schema/online-exam.schema";
import { users } from "../database/schema/user.schema";
import type { FinishedBy } from "./domain/exam-attempt";
import { wholeScore } from "./domain/exam-results";
import { publishedMinutes } from "./domain/online-exam";
import type { IAttempt, Tx } from "./exam-attempt.repository";

/** Who has a seat in the course and so a row in the results: ENROLLED or COMPLETED, as Değerlendirme has it. */
const SEATED = [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED];

/** A published online exam as the team reads its results. */
export interface IResultsExam {
  examId: string;
  courseId: string;
  lessonId: string;
  title: string;
  durationMinutes: number;
  zerothQuestion: string;
  startsAt: Date;
  latestStartAt: Date | null;
  closedEarlyAt: Date | null;
  createdBy: string;
  /** The celse's MDRS-248 exam row, where Değerlendirme keeps the scores; null when it has none. */
  lessonExamId: string | null;
  resultsReleasedAt: Date | null;
}

export interface ISeatedTalebe {
  userId: string;
  name: string | null;
}

/**
 * The reads of an online exam's results and the early close (MDRS-299), and
 * the score of a finished attempt written where Değerlendirme reads it.
 */
@Injectable()
export class ExamResultsRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The published exam with its celse; null for a draft or an unknown id. */
  async findExam(examId: string, tx?: Tx): Promise<IResultsExam | null> {
    const [row] = await (tx ?? this.db)
      .select({
        examId: onlineExams.id,
        courseId: onlineExams.courseId,
        lessonId: onlineExams.lessonId,
        title: onlineExams.title,
        durationMinutes: onlineExams.durationMinutes,
        zerothQuestion: onlineExams.zerothQuestion,
        startsAt: lessons.scheduledAt,
        latestStartAt: onlineExams.latestStartAt,
        closedEarlyAt: onlineExams.closedEarlyAt,
        createdBy: onlineExams.createdBy,
        lessonExamId: lessonExams.id,
        resultsReleasedAt: lessonExams.resultsReleasedAt,
      })
      .from(onlineExams)
      .innerJoin(lessons, eq(lessons.id, onlineExams.lessonId))
      .leftJoin(lessonExams, eq(lessonExams.lessonId, onlineExams.lessonId))
      .where(
        and(eq(onlineExams.id, examId), isNotNull(onlineExams.publishedAt))
      )
      .limit(1);
    if (!row || row.lessonId === null || row.startsAt === null) return null;
    return {
      ...row,
      lessonId: row.lessonId,
      startsAt: row.startsAt,
      // Read only of a published exam, which always has its length.
      durationMinutes: publishedMinutes(row.durationMinutes),
    };
  }

  /** The talebe seated in the course, by name; one with no name sorts last. */
  async listSeated(courseId: string): Promise<ISeatedTalebe[]> {
    const rows = await this.db
      .select({
        userId: enrollments.userId,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
        studentName: enrollments.studentName,
        studentEmail: enrollments.studentEmail,
      })
      .from(enrollments)
      .leftJoin(users, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(enrollments.courseId, courseId),
          inArray(enrollments.status, SEATED)
        )
      );
    const people = rows.map((row) => ({
      userId: row.userId,
      // As Değerlendirme names them: the account's name, else as they enrolled.
      name:
        displayNameOf({
          givenName: row.givenName ?? null,
          familyName: row.familyName ?? null,
          email: row.email ?? null,
        }) ??
        row.studentName ??
        row.studentEmail ??
        null,
    }));
    return people.sort((a, b) =>
      a.name === null
        ? b.name === null
          ? a.userId.localeCompare(b.userId)
          : 1
        : b.name === null
          ? -1
          : a.name.localeCompare(b.name, "tr") ||
            a.userId.localeCompare(b.userId)
    );
  }

  listAttempts(examId: string): Promise<IAttempt[]> {
    return this.db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.examId, examId));
  }

  /** One talebe's attempt of the exam, if they started it. */
  async findAttemptOf(
    examId: string,
    userId: string
  ): Promise<IAttempt | null> {
    const [row] = await this.db
      .select()
      .from(examAttempts)
      .where(
        and(eq(examAttempts.examId, examId), eq(examAttempts.userId, userId))
      )
      .limit(1);
    return row ?? null;
  }

  /** One attempt's answers, with whether each was skipped and when it was saved. */
  answersOfAttempt(attemptId: string): Promise<
    Array<{
      questionId: string;
      optionIds: string[];
      skipped: boolean;
      savedAt: Date;
    }>
  > {
    return this.db
      .select({
        questionId: examAnswers.questionId,
        optionIds: examAnswers.optionIds,
        skipped: examAnswers.skipped,
        savedAt: examAnswers.savedAt,
      })
      .from(examAnswers)
      .where(eq(examAnswers.attemptId, attemptId));
  }

  /** Every answer of the given attempts; none for an empty list. */
  async listAnswers(
    attemptIds: string[]
  ): Promise<
    Array<{ attemptId: string; questionId: string; optionIds: string[] }>
  > {
    if (attemptIds.length === 0) return [];
    return this.db
      .select({
        attemptId: examAnswers.attemptId,
        questionId: examAnswers.questionId,
        optionIds: examAnswers.optionIds,
      })
      .from(examAnswers)
      .where(inArray(examAnswers.attemptId, attemptIds));
  }

  /** Every switch of the given attempts, oldest first; none for an empty list. */
  async listSwitches(
    attemptIds: string[]
  ): Promise<Array<{ attemptId: string; at: Date }>> {
    if (attemptIds.length === 0) return [];
    return this.db
      .select({ attemptId: examTabSwitches.attemptId, at: examTabSwitches.at })
      .from(examTabSwitches)
      .where(inArray(examTabSwitches.attemptId, attemptIds))
      .orderBy(asc(examTabSwitches.at));
  }

  listZerothAnswers(
    examId: string
  ): Promise<Array<{ userId: string; optionId: string }>> {
    return this.db
      .select({
        userId: zerothAnswers.userId,
        optionId: zerothAnswers.optionId,
      })
      .from(zerothAnswers)
      .where(eq(zerothAnswers.examId, examId));
  }

  /** The exam's zeroth options, in their order. */
  listZerothOptions(
    examId: string
  ): Promise<Array<{ id: string; text: string }>> {
    return this.db
      .select({ id: zerothOptions.id, text: zerothOptions.text })
      .from(zerothOptions)
      .where(eq(zerothOptions.examId, examId))
      .orderBy(asc(zerothOptions.position));
  }

  /**
   * Writes a finished attempt's score as the talebe's result on the celse's
   * exam row, where Değerlendirme reads it and "Sonuçları talebelere aç"
   * releases it: a whole number, as Değerlendirme keeps scores. A result the
   * team entered by hand is never replaced. Nothing is written when the celse
   * has no exam row.
   */
  async writeExamResult(
    tx: Tx,
    entry: {
      examId: string;
      userId: string;
      scoreHundredths: number;
      gradedBy?: string;
    }
  ): Promise<void> {
    const [exam] = await tx
      .select({
        lessonExamId: lessonExams.id,
        createdBy: onlineExams.createdBy,
      })
      .from(onlineExams)
      .innerJoin(lessonExams, eq(lessonExams.lessonId, onlineExams.lessonId))
      .where(eq(onlineExams.id, entry.examId))
      .limit(1);
    if (!exam) return;
    await tx
      .insert(examResults)
      .values({
        examId: exam.lessonExamId,
        userId: entry.userId,
        score: wholeScore(entry.scoreHundredths),
        absent: false,
        // Scored by the exam's own key: its author stands as the grader
        // unless the team ended it.
        gradedBy: entry.gradedBy ?? exam.createdBy,
      })
      .onConflictDoNothing({
        target: [examResults.examId, examResults.userId],
      });
  }

  /** Runs `fn` in one transaction. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /** Holds the exam's row for the close; false when it is not there. */
  async holdExam(tx: Tx, examId: string): Promise<boolean> {
    const [held] = await tx
      .select({ id: onlineExams.id })
      .from(onlineExams)
      .where(eq(onlineExams.id, examId))
      .for("update");
    return held !== undefined;
  }

  /** The exam's attempts in progress, held, so no save of theirs lands after the close. */
  holdInProgress(tx: Tx, examId: string): Promise<IAttempt[]> {
    return tx
      .select()
      .from(examAttempts)
      .where(
        and(eq(examAttempts.examId, examId), isNull(examAttempts.finishedAt))
      )
      .for("update");
  }

  answersOf(
    tx: Tx,
    attemptId: string
  ): Promise<Array<{ questionId: string; optionIds: string[] }>> {
    return tx
      .select({
        questionId: examAnswers.questionId,
        optionIds: examAnswers.optionIds,
      })
      .from(examAnswers)
      .where(eq(examAnswers.attemptId, attemptId));
  }

  /** Sets the early close and writes `online_exam.close` to the audit log. */
  async markClosed(
    tx: Tx,
    entry: {
      examId: string;
      courseId: string;
      actorId: string;
      at: Date;
      finished: number;
    }
  ): Promise<void> {
    await tx
      .update(onlineExams)
      .set({ closedEarlyAt: entry.at, updatedAt: entry.at })
      .where(eq(onlineExams.id, entry.examId));
    await tx.insert(auditLog).values({
      actorId: entry.actorId,
      action: "online_exam.close",
      entity: "online_exam",
      entityId: entry.examId,
      details: { courseId: entry.courseId, finished: entry.finished },
    });
  }

  /** Marks an attempt finished with its score, in the close's transaction. */
  async finishAttempt(
    tx: Tx,
    attemptId: string,
    set: { finishedAt: Date; finishedBy: FinishedBy; scoreHundredths: number }
  ): Promise<void> {
    await tx
      .update(examAttempts)
      .set({ ...set, countedAt: set.finishedAt })
      .where(eq(examAttempts.id, attemptId));
  }
}
