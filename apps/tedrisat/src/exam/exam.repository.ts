import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { AssignmentKind } from "../course/domain/assignment-kind.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { type ExamFormat, isScoreInRange } from "../course/domain/exam";
import { LessonNotFoundError } from "../course/errors/lesson-not-found.error";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import {
  assignmentEvaluations,
  lessonAssignments,
} from "../database/schema/lesson-assignment.schema";
import {
  examResults,
  lessonExams,
} from "../database/schema/lesson-exam.schema";
import type {
  MadrasahExamSummaryResponse,
  MyGradesResponse,
} from "./dto/exam.dto";
import { ExamNotFoundError } from "./errors/exam-not-found.error";
import { ExamScoreOutOfRangeError } from "./errors/exam-score-out-of-range.error";
import { ExamTalebeNotFoundError } from "./errors/exam-talebe-not-found.error";

/** Who sits an exam, as who may hand homework in: ENROLLED or COMPLETED. */
const SEATED = [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED];

/** An exam celse of a course, as a column of "Değerlendirme". */
export interface IExamColumn {
  examId: string;
  lessonId: string;
  title: string;
  weekNumber: number;
  orderIndex: number;
  scheduledAt: Date | null;
  format: ExamFormat;
  maxScore: number;
  isRetake: boolean;
  resultsReleasedAt: Date | null;
}

/** A result as tedrisat keeps it. */
export interface IExamResult {
  lessonId: string;
  userId: string;
  score: number | null;
  absent: boolean;
  updatedAt: Date;
}

/** One message the 24-hour reminder owes one talebe (MDRS-248). */
export interface IExamReminderRecipient {
  email: string;
  locale: string | null;
  timeZone: string;
}

/** An exam the reminder claimed, with the words its mail is filled from. */
export interface IExamReminder {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  scheduledAt: Date;
}

/**
 * Exams (MDRS-248): the results the course team enters on "Değerlendirme",
 * their release to the talebe, a talebe's own "Notlarım", a medrese's summary
 * and the 24-hour reminder's claim. Whose a result is, is decided here: a
 * write names a live exam celse of a course and a talebe seated in it, the
 * talebe's read names the talebe and shows a score only once released. Every
 * write goes to `audit_log` in its own transaction.
 */
@Injectable()
export class ExamRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The course's exams on its live, standing celses, in programme order. */
  async listColumns(courseId: string): Promise<IExamColumn[]> {
    return this.db
      .select({
        examId: lessonExams.id,
        lessonId: lessons.id,
        title: lessons.title,
        weekNumber: courseWeeks.weekNumber,
        orderIndex: lessons.orderIndex,
        scheduledAt: lessons.scheduledAt,
        format: lessonExams.format,
        maxScore: lessonExams.maxScore,
        isRetake: lessonExams.isRetake,
        resultsReleasedAt: lessonExams.resultsReleasedAt,
      })
      .from(lessonExams)
      .innerJoin(lessons, eq(lessons.id, lessonExams.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          isNull(lessons.archivedAt),
          isNull(lessons.cancelledAt),
          isNull(courseWeeks.archivedAt)
        )
      )
      .orderBy(
        asc(courseWeeks.weekNumber),
        asc(lessons.orderIndex),
        asc(lessons.id)
      );
  }

  /** The results on the given exams; none for an empty list. */
  async listResults(columns: IExamColumn[]): Promise<IExamResult[]> {
    if (columns.length === 0) return [];
    const lessonOf = new Map(columns.map((c) => [c.examId, c.lessonId]));
    const rows = await this.db
      .select()
      .from(examResults)
      .where(inArray(examResults.examId, [...lessonOf.keys()]));
    return rows.map((row) => ({
      lessonId: lessonOf.get(row.examId) as string,
      userId: row.userId,
      score: row.score,
      absent: row.absent,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Enters a talebe's result on an exam, or changes it: a score from 0 to the
   * exam's `max_score`, or "Girmedi" with none. `exam_result.save` with the
   * score, never more. A save that changes nothing writes nothing. The exam
   * row is held for update for the transaction, so its `max_score` cannot
   * change under the check and two saves of one cell, the first included,
   * take turns. The celse must be live (LESSON_NOT_FOUND) and an exam
   * (EXAM_NOT_FOUND), the talebe seated in its course
   * (EXAM_TALEBE_NOT_FOUND).
   */
  async saveResult(
    lessonId: string,
    userId: string,
    entry: { score: number | null; absent: boolean },
    write: { courseId: string; actorId: string }
  ): Promise<IExamResult> {
    return this.db.transaction(async (tx) => {
      const [live] = await tx
        .select({ courseId: courseWeeks.courseId })
        .from(lessons)
        .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
        .where(
          and(
            eq(lessons.id, lessonId),
            isNull(lessons.archivedAt),
            isNull(courseWeeks.archivedAt)
          )
        )
        .limit(1);
      if (!live || live.courseId !== write.courseId) {
        throw new LessonNotFoundError(lessonId);
      }
      const [exam] = await tx
        .select({ id: lessonExams.id, maxScore: lessonExams.maxScore })
        .from(lessonExams)
        .where(eq(lessonExams.lessonId, lessonId))
        // FOR UPDATE, not FOR SHARE: before a talebe's first result there is
        // no result row to lock, so two first saves of one cell would both
        // pass a shared lock and the second would write a change (and an
        // audit row) that changes nothing. Saves on one exam take turns.
        .for("update");
      if (!exam) throw new ExamNotFoundError(lessonId);
      if (
        entry.absent
          ? entry.score !== null
          : entry.score === null || !isScoreInRange(entry.score, exam.maxScore)
      ) {
        throw new ExamScoreOutOfRangeError(exam.maxScore);
      }
      const [seat] = await tx
        .select({ userId: enrollments.userId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, write.courseId),
            eq(enrollments.userId, userId),
            inArray(enrollments.status, SEATED)
          )
        )
        .limit(1);
      if (!seat) throw new ExamTalebeNotFoundError(userId);

      const [held] = await tx
        .select()
        .from(examResults)
        .where(
          and(eq(examResults.examId, exam.id), eq(examResults.userId, userId))
        )
        .for("update");
      if (held && held.score === entry.score && held.absent === entry.absent) {
        return {
          lessonId,
          userId,
          score: held.score,
          absent: held.absent,
          updatedAt: held.updatedAt,
        };
      }
      const [saved] = await tx
        .insert(examResults)
        .values({
          examId: exam.id,
          userId,
          score: entry.score,
          absent: entry.absent,
          gradedBy: write.actorId,
        })
        .onConflictDoUpdate({
          target: [examResults.examId, examResults.userId],
          set: {
            score: entry.score,
            absent: entry.absent,
            gradedBy: write.actorId,
            updatedAt: new Date(),
          },
        })
        .returning();
      await tx.insert(auditLog).values({
        actorId: write.actorId,
        action: "exam_result.save",
        entity: "exam_result",
        entityId: saved.id,
        details: {
          courseId: write.courseId,
          lessonId,
          talebeId: userId,
          score: entry.score,
          absent: entry.absent,
        },
      });
      return {
        lessonId,
        userId,
        score: saved.score,
        absent: saved.absent,
        updatedAt: saved.updatedAt,
      };
    });
  }

  /**
   * "Sonuçları talebelere aç": opens the exam's results to its talebe, once.
   * `newly` is false when they were open already, and then nothing is
   * written. `exam.release` in `audit_log`.
   */
  async release(
    lessonId: string,
    write: { courseId: string; actorId: string },
    now: Date = new Date()
  ): Promise<{
    resultsReleasedAt: Date;
    scheduledAt: Date | null;
    newly: boolean;
  }> {
    return this.db.transaction(async (tx) => {
      const [exam] = await tx
        .select({
          id: lessonExams.id,
          resultsReleasedAt: lessonExams.resultsReleasedAt,
          scheduledAt: lessons.scheduledAt,
          courseId: courseWeeks.courseId,
        })
        .from(lessonExams)
        .innerJoin(lessons, eq(lessons.id, lessonExams.lessonId))
        .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
        .where(
          and(
            eq(lessonExams.lessonId, lessonId),
            isNull(lessons.archivedAt),
            isNull(courseWeeks.archivedAt)
          )
        )
        .for("update", { of: lessonExams });
      if (!exam || exam.courseId !== write.courseId) {
        throw new ExamNotFoundError(lessonId);
      }
      if (exam.resultsReleasedAt) {
        return {
          resultsReleasedAt: exam.resultsReleasedAt,
          scheduledAt: exam.scheduledAt,
          newly: false,
        };
      }
      await tx
        .update(lessonExams)
        .set({ resultsReleasedAt: now, updatedAt: now })
        .where(eq(lessonExams.id, exam.id));
      await tx.insert(auditLog).values({
        actorId: write.actorId,
        action: "exam.release",
        entity: "lesson_exam",
        entityId: exam.id,
        details: { courseId: write.courseId, lessonId },
      });
      return {
        resultsReleasedAt: now,
        scheduledAt: exam.scheduledAt,
        newly: true,
      };
    });
  }

  /**
   * "Notlarım": the caller's own exam results and memorisation marks in the
   * course. A score and "Girmedi" are read only from an exam whose results
   * were opened; until then the row is there and says nothing of them.
   * Without `contentOpen` only what is the caller's own is listed: an exam
   * whose result for them was opened, a homework they were marked on.
   */
  async myGrades(
    courseId: string,
    userId: string,
    { contentOpen }: { contentOpen: boolean }
  ): Promise<MyGradesResponse> {
    const columns = await this.listColumns(courseId);
    const results =
      columns.length === 0
        ? []
        : await this.db
            .select()
            .from(examResults)
            .where(
              and(
                inArray(
                  examResults.examId,
                  columns.map((c) => c.examId)
                ),
                eq(examResults.userId, userId)
              )
            );
    const resultOf = new Map(results.map((r) => [r.examId, r]));
    const memorizations = await this.db
      .select({
        lessonId: lessons.id,
        title: lessons.title,
        weekNumber: courseWeeks.weekNumber,
        scheduledAt: lessons.scheduledAt,
        status: assignmentEvaluations.status,
      })
      .from(lessonAssignments)
      .innerJoin(lessons, eq(lessons.id, lessonAssignments.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .leftJoin(
        assignmentEvaluations,
        and(
          eq(assignmentEvaluations.assignmentId, lessonAssignments.id),
          eq(assignmentEvaluations.userId, userId)
        )
      )
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          eq(lessonAssignments.kind, AssignmentKind.MEMORIZE),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt)
        )
      )
      .orderBy(
        asc(courseWeeks.weekNumber),
        asc(lessons.orderIndex),
        asc(lessons.id)
      );
    const ownExams = contentOpen
      ? columns
      : columns.filter(
          (c) => c.resultsReleasedAt !== null && resultOf.has(c.examId)
        );
    const ownMarks = contentOpen
      ? memorizations
      : memorizations.filter((m) => m.status !== null);
    return {
      exams: ownExams.map((c) => {
        const released = c.resultsReleasedAt !== null;
        const result = released ? resultOf.get(c.examId) : undefined;
        return {
          lessonId: c.lessonId,
          title: c.title,
          weekNumber: c.weekNumber,
          scheduledAt: c.scheduledAt,
          maxScore: c.maxScore,
          isRetake: c.isRetake,
          released,
          score: result?.score ?? null,
          absent: result ? result.absent : null,
        };
      }),
      memorizations: ownMarks.map((m) => ({
        lessonId: m.lessonId,
        title: m.title,
        weekNumber: m.weekNumber,
        scheduledAt: m.scheduledAt,
        status: m.status ?? null,
      })),
    };
  }

  /**
   * The medrese's courses that hold an exam (MDRS-248), shown and hidden
   * drafts aside: how many results were entered and their mean, as a share
   * of each exam's `max_score`. Results of talebe no longer seated count:
   * they sat it.
   */
  async madrasahSummary(
    madrasahId: string
  ): Promise<MadrasahExamSummaryResponse[]> {
    const rows = await this.db
      .select({
        courseId: courses.id,
        courseTitle: courses.title,
        examCount: sql<number>`count(distinct ${lessonExams.id})::int`,
        takenCount: sql<number>`count(${examResults.id}) filter (where not ${examResults.absent})::int`,
        absentCount: sql<number>`count(${examResults.id}) filter (where ${examResults.absent})::int`,
        averagePercent: sql<
          string | null
        >`round(avg(${examResults.score} * 100.0 / ${lessonExams.maxScore}) filter (where not ${examResults.absent}), 1)`,
      })
      .from(lessonExams)
      .innerJoin(lessons, eq(lessons.id, lessonExams.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .leftJoin(examResults, eq(examResults.examId, lessonExams.id))
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          isNull(courses.archivedAt),
          isNull(lessons.archivedAt),
          isNull(lessons.cancelledAt),
          isNull(courseWeeks.archivedAt)
        )
      )
      .groupBy(courses.id, courses.title)
      .orderBy(asc(courses.title), asc(courses.id));
    return rows.map((row) => ({
      ...row,
      averagePercent:
        row.averagePercent === null ? null : Number(row.averagePercent),
    }));
  }

  /**
   * Claims the exams that start within `withinMs` of `now` and were not
   * reminded of: one statement that checks and marks, so an exam is reminded
   * of once whichever instance gets there first. A cancelled or hidden celse
   * is not. At most `limit`.
   */
  async claimDueReminders(
    now: Date,
    withinMs: number,
    limit: number
  ): Promise<IExamReminder[]> {
    const until = new Date(now.getTime() + withinMs);
    const result = await this.db.execute<{
      lesson_id: string;
      course_id: string;
      course_title: string;
      lesson_title: string;
      scheduled_at: Date | string;
    }>(sql`
      with due as (
        select x.id from lesson_exams x
          join lessons l on l.id = x.lesson_id
          join course_weeks w on w.id = l.week_id
          join courses c on c.id = w.course_id
         where x.reminded_at is null
           and l.scheduled_at > ${now.toISOString()}::timestamptz
           and l.scheduled_at <= ${until.toISOString()}::timestamptz
           and l.cancelled_at is null and l.archived_at is null
           and w.archived_at is null and c.archived_at is null
         order by l.scheduled_at, x.id
         limit ${limit}
         for update of x skip locked)
      update lesson_exams x set reminded_at = ${now.toISOString()}::timestamptz
        from due, lessons l, course_weeks w, courses c
       where x.id = due.id and l.id = x.lesson_id and w.id = l.week_id
         and c.id = w.course_id
      returning x.lesson_id, c.id as course_id, c.title as course_title,
                l.title as lesson_title, l.scheduled_at`);
    return result.rows.map((r) => ({
      lessonId: r.lesson_id,
      courseId: r.course_id,
      courseTitle: r.course_title,
      lessonTitle: r.lesson_title,
      // A raw `execute` skips drizzle's column mappers: timestamps arrive as text.
      scheduledAt: new Date(r.scheduled_at),
    }));
  }

  /**
   * Who the 24-hour reminder e-mails: the talebe who hold an active seat
   * (ENROLLED), with a verified address and lesson invitations not turned
   * off on Hesap, the setting that governs every lesson e-mail.
   */
  async reminderRecipients(
    courseId: string
  ): Promise<IExamReminderRecipient[]> {
    const result = await this.db.execute<{
      email: string;
      locale: string | null;
      time_zone: string;
    }>(sql`
      select u.email, u.locale, coalesce(u.time_zone, c.time_zone) as time_zone
        from enrollments e
        join users u on u.id = e.user_id
        join courses c on c.id = e.course_id
       where e.course_id = ${courseId}
         and e.status = ${EnrollmentStatus.ENROLLED}
         and u.email is not null and u.email_verified
         and u.lesson_invitation_emails`);
    return result.rows.map((r) => ({
      email: r.email,
      locale: r.locale,
      timeZone: r.time_zone,
    }));
  }
}
