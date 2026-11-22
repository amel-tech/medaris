import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import type { ExamFormat } from "../course/domain/exam";
import { DatabaseService } from "../database/database.service";
import { enrolledCourseIds } from "../database/enrolled-courses";
import {
  courses,
  courseWeeks,
  lessons,
} from "../database/schema/course.schema";
import { examAttempts } from "../database/schema/exam-attempt.schema";
import { kosks } from "../database/schema/kosk.schema";
import {
  examResults,
  lessonExams,
} from "../database/schema/lesson-exam.schema";
import {
  courseExamTopics,
  examQuestions,
  onlineExams,
} from "../database/schema/online-exam.schema";

/** One exam celse of a talebe's course, with what Sınavlarım needs of it. */
export interface IMyExamRow {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  startsAt: Date;
  /** The lesson exam's format; null for an online exam with no lesson exam row. */
  format: ExamFormat | null;
  location: string | null;
  maxScore: number | null;
  releasedAt: Date | null;
  /** Set for a published online exam. */
  examId: string | null;
  examTitle: string | null;
  durationMinutes: number | null;
  latestStartAt: Date | null;
  closedEarlyAt: Date | null;
  questionCount: number;
  attemptId: string | null;
  attemptFinishedAt: Date | null;
  attemptUsedSeconds: number | null;
  scoreHundredths: number | null;
  resultScore: number | null;
  resultAbsent: boolean | null;
}

/**
 * The reads of a talebe's own exams (MDRS-299, Sınavlarım and the talebe's
 * screen of a past online exam). Every read is scoped to the caller's own
 * seats and attempts in its query.
 */
@Injectable()
export class MyExamsRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Every exam celse of the courses `userId` holds an ENROLLED or COMPLETED
   * seat in and is not barred from: a written or oral exam, and a published
   * online exam (a draft has no celse). A cancelled or hidden celse, and one
   * in a hidden week, course or köşk, is not here; a course the talebe left
   * takes its exams with it.
   */
  async listForUser(userId: string): Promise<IMyExamRow[]> {
    const rows = await this.db
      .select({
        lessonId: lessons.id,
        courseId: courses.id,
        courseTitle: courses.title,
        lessonTitle: lessons.title,
        startsAt: lessons.scheduledAt,
        format: lessonExams.format,
        location: lessonExams.location,
        maxScore: lessonExams.maxScore,
        releasedAt: lessonExams.resultsReleasedAt,
        examId: onlineExams.id,
        examTitle: onlineExams.title,
        durationMinutes: onlineExams.durationMinutes,
        latestStartAt: onlineExams.latestStartAt,
        closedEarlyAt: onlineExams.closedEarlyAt,
        questionCount: sql<number>`(select count(*)::int from ${examQuestions} where ${examQuestions.examId} = ${onlineExams.id})`,
        attemptId: examAttempts.id,
        attemptFinishedAt: examAttempts.finishedAt,
        attemptUsedSeconds: examAttempts.usedSeconds,
        scoreHundredths: examAttempts.scoreHundredths,
        resultScore: examResults.score,
        resultAbsent: examResults.absent,
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .leftJoin(lessonExams, eq(lessonExams.lessonId, lessons.id))
      .leftJoin(
        onlineExams,
        and(
          eq(onlineExams.lessonId, lessons.id),
          isNotNull(onlineExams.publishedAt)
        )
      )
      .leftJoin(
        examAttempts,
        and(
          eq(examAttempts.examId, onlineExams.id),
          eq(examAttempts.userId, userId)
        )
      )
      .leftJoin(
        examResults,
        and(
          eq(examResults.examId, lessonExams.id),
          eq(examResults.userId, userId)
        )
      )
      .where(
        and(
          isNotNull(lessons.scheduledAt),
          isNull(lessons.cancelledAt),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt),
          isNull(courses.archivedAt),
          isNull(kosks.archivedAt),
          eq(courses.status, CourseStatus.PUBLISHED),
          inArray(
            courses.id,
            enrolledCourseIds(this.db, userId, [
              EnrollmentStatus.ENROLLED,
              EnrollmentStatus.COMPLETED,
            ])
          ),
          // A published online exam, or a lesson exam that is no online
          // exam's: an online exam taken back to a draft lists nothing.
          or(
            isNotNull(onlineExams.id),
            and(
              isNotNull(lessonExams.id),
              sql`not exists (select 1 from ${onlineExams} where ${onlineExams.lessonId} = ${lessons.id})`
            )
          )
        )
      )
      .orderBy(asc(lessons.scheduledAt), asc(lessons.id));
    return rows.flatMap(({ startsAt, ...row }) =>
      startsAt ? [{ ...row, startsAt }] : []
    );
  }

  /** When the team released the celse's results, or null. */
  async releasedAt(lessonId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: lessonExams.resultsReleasedAt })
      .from(lessonExams)
      .where(eq(lessonExams.lessonId, lessonId))
      .limit(1);
    return row?.at ?? null;
  }

  /**
   * Whether any attempt of the exam is still in progress: not finished, and
   * with time left. An attempt whose time is used up is over, though only
   * its next read writes so.
   */
  async anyInProgress(
    examId: string,
    durationMinutes: number
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: examAttempts.id })
      .from(examAttempts)
      .where(
        and(
          eq(examAttempts.examId, examId),
          isNull(examAttempts.finishedAt),
          lt(examAttempts.usedSeconds, durationMinutes * 60)
        )
      )
      .limit(1);
    return row !== undefined;
  }

  /** The course's topics, by id. */
  async topicsOf(
    courseId: string
  ): Promise<Map<string, { number: number; name: string }>> {
    const rows = await this.db
      .select({
        id: courseExamTopics.id,
        number: courseExamTopics.number,
        name: courseExamTopics.name,
      })
      .from(courseExamTopics)
      .where(eq(courseExamTopics.courseId, courseId));
    return new Map(rows.map((r) => [r.id, { number: r.number, name: r.name }]));
  }

  /**
   * The caller's finished attempts at the course's online exams whose
   * results are released, on celses that stand: what the standing across the
   * course is added up from.
   */
  releasedAttemptsInCourse(
    userId: string,
    courseId: string
  ): Promise<Array<{ examId: string; attemptId: string }>> {
    return this.db
      .select({ examId: onlineExams.id, attemptId: examAttempts.id })
      .from(examAttempts)
      .innerJoin(onlineExams, eq(onlineExams.id, examAttempts.examId))
      .innerJoin(lessons, eq(lessons.id, onlineExams.lessonId))
      .innerJoin(lessonExams, eq(lessonExams.lessonId, lessons.id))
      .where(
        and(
          eq(examAttempts.userId, userId),
          eq(onlineExams.courseId, courseId),
          isNotNull(onlineExams.publishedAt),
          isNotNull(examAttempts.finishedAt),
          isNotNull(lessonExams.resultsReleasedAt),
          isNull(lessons.cancelledAt),
          isNull(lessons.archivedAt)
        )
      )
      .orderBy(asc(lessons.scheduledAt));
  }
}
