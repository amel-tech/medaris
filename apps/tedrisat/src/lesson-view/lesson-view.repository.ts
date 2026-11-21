import { Injectable } from "@nestjs/common";
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import {
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import { lessonViews } from "../database/schema/lesson-view.schema";
import { LESSON_VIEW_COMPLETE_SHARE } from "./dto/lesson-view.dto";

/** A watch record as stored. */
export interface ILessonView {
  lessonId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  completedAt: Date | null;
  updatedAt: Date;
}

/** What the player reported. */
export interface ILessonViewReport {
  positionSeconds: number;
  durationSeconds?: number;
  ended?: boolean;
}

const columns = {
  lessonId: lessonViews.lessonId,
  positionSeconds: lessonViews.positionSeconds,
  durationSeconds: lessonViews.durationSeconds,
  completedAt: lessonViews.completedAt,
  updatedAt: lessonViews.updatedAt,
};

/**
 * Whether a report counts the celse watched: the player ended, or the
 * position reached nine tenths of the length.
 */
export const reachesCompletion = (
  report: ILessonViewReport,
  durationSeconds: number | null
): boolean =>
  report.ended === true ||
  (durationSeconds !== null &&
    report.positionSeconds >= durationSeconds * LESSON_VIEW_COMPLETE_SHARE);

/**
 * The course progress a talebe's watch records come to (MDRS-248): the share
 * of the course's celses they have watched, in whole percent. The celses are
 * the ones the programme shows: not hidden, not in a hidden week, not
 * cancelled. A course without any is at 0.
 */
export const progressOf = (watched: number, total: number): number =>
  total === 0 ? 0 : Math.min(100, Math.round((watched * 100) / total));

/**
 * Watch records are the talebe's own (MDRS-248): no method here reads or
 * writes one without a `userId`, as with notes.
 */
@Injectable()
export class LessonViewRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The talebe's records on the course's celses, hidden ones left out. */
  async findByCourse(userId: string, courseId: string): Promise<ILessonView[]> {
    return this.db
      .select(columns)
      .from(lessonViews)
      .innerJoin(lessons, eq(lessons.id, lessonViews.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          eq(lessonViews.userId, userId),
          eq(courseWeeks.courseId, courseId),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt)
        )
      );
  }

  /**
   * Stores where the player is. The first report that reaches completion
   * stamps `completed_at`, and that stamp is kept by every later write, so a
   * talebe who watches it again from the start keeps the mark. When this
   * write is the one that completed the celse, the enrollment's `progress` is
   * worked out again from the records, in the same transaction; an
   * enrollment that is not ENROLLED or COMPLETED is left as it is.
   */
  async record(
    userId: string,
    lessonId: string,
    courseId: string,
    report: ILessonViewReport
  ): Promise<ILessonView> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx
        .select(columns)
        .from(lessonViews)
        .where(
          and(
            eq(lessonViews.userId, userId),
            eq(lessonViews.lessonId, lessonId)
          )
        )
        .for("update");
      const durationSeconds =
        report.durationSeconds ?? before?.durationSeconds ?? null;
      const now = new Date();
      const completes =
        !before?.completedAt && reachesCompletion(report, durationSeconds);
      const [saved] = await tx
        .insert(lessonViews)
        .values({
          userId,
          lessonId,
          positionSeconds: report.positionSeconds,
          durationSeconds,
          completedAt: completes ? now : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [lessonViews.userId, lessonViews.lessonId],
          set: {
            positionSeconds: report.positionSeconds,
            durationSeconds,
            completedAt: sql`coalesce(${lessonViews.completedAt}, excluded.completed_at)`,
            updatedAt: now,
          },
        })
        .returning(columns);

      if (completes) {
        const shown = and(
          eq(courseWeeks.courseId, courseId),
          isNull(courseWeeks.archivedAt),
          isNull(lessons.archivedAt),
          isNull(lessons.cancelledAt)
        );
        const [{ total }] = await tx
          .select({ total: count() })
          .from(lessons)
          .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
          .where(shown);
        const [{ watched }] = await tx
          .select({ watched: count() })
          .from(lessonViews)
          .innerJoin(lessons, eq(lessons.id, lessonViews.lessonId))
          .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
          .where(
            and(
              shown,
              eq(lessonViews.userId, userId),
              isNotNull(lessonViews.completedAt)
            )
          );
        await tx
          .update(enrollments)
          .set({ progress: progressOf(watched, total), updatedAt: now })
          .where(
            and(
              eq(enrollments.userId, userId),
              eq(enrollments.courseId, courseId),
              inArray(enrollments.status, [
                EnrollmentStatus.ENROLLED,
                EnrollmentStatus.COMPLETED,
              ])
            )
          );
      }
      return saved;
    });
  }
}
