import type { ScopeRef } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { LessonType } from "../course/domain/lesson-type.enum";
import { DEFAULT_SESSION_MINUTES } from "../course/domain/session-view";
import { DatabaseService } from "../database/database.service";
import { enrolledCourseIds } from "../database/enrolled-courses";
import { passiveScopesOf } from "../database/passive-courses";
import { auditLog } from "../database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  lessons,
} from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";

/** One scheduled live session of an enrolled course, as the schedule reads it. */
export interface IScheduledSession {
  id: string;
  courseId: string;
  courseTitle: string;
  koskId: string;
  koskName: string;
  weekNumber: number;
  title: string;
  startsAt: Date;
  durationMinutes: number | null;
  cancelledAt: Date | null;
  meetingUrl: string | null;
}

@Injectable()
export class ScheduleRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * The live sessions of the courses `userId` is enrolled in (ENROLLED only:
   * a pending request, a completed course and a barred talebe's courses are
   * not here), starting in `[from, to)`, soonest first. A cancelled session is
   * kept and marked; a hidden one (lesson, week, course or köşk) is not here.
   */
  async findEnrolledSessions(
    userId: string,
    from: Date,
    to: Date
  ): Promise<IScheduledSession[]> {
    return this.query(userId, gte(lessons.scheduledAt, from), to);
  }

  /**
   * The next `limit` sessions that are running or still ahead at `now` and
   * stand (a cancelled one is skipped, as `SessionView.next` skips it): over
   * when `scheduled_at` plus the length, 60 minutes without one, has passed.
   */
  async findUpcoming(
    userId: string,
    now: Date,
    to: Date,
    limit: number
  ): Promise<IScheduledSession[]> {
    return this.query(
      userId,
      and(
        isNull(lessons.cancelledAt),
        sql`${lessons.scheduledAt} + make_interval(mins => coalesce(${lessons.durationMinutes}, ${DEFAULT_SESSION_MINUTES})) > ${now.toISOString()}::timestamptz`
      ),
      to,
      limit
    );
  }

  /** The passive scope each of these courses sits in, if any (MDRS-136). */
  passiveScopesOf(
    courseIds: readonly string[]
  ): Promise<Map<string, ScopeRef>> {
    return passiveScopesOf(this.db, courseIds);
  }

  /**
   * The opens of a passive course's live link this list made (MDRS-135): a
   * `scope.passive_open` and a `course.content_read` per course, as
   * `GET /courses/:id` writes for the same reader, in one statement.
   */
  async recordPassiveOpens(
    userId: string,
    opens: ReadonlyArray<{
      courseId: string;
      courseTitle: string;
      passiveScope: ScopeRef;
    }>,
    via: string
  ): Promise<void> {
    if (opens.length === 0) return;
    await this.db.insert(auditLog).values(
      opens.flatMap((open) => [
        {
          actorId: userId,
          action: "scope.passive_open",
          entity: "course",
          entityId: open.courseId,
          details: {
            passiveScope: open.passiveScope,
            permission: "session.live_link",
            via,
          },
        },
        {
          actorId: userId,
          action: "course.content_read",
          entity: "course",
          entityId: open.courseId,
          details: {
            title: open.courseTitle,
            via,
            systemAdmin: false,
            permission: "session.live_link",
          },
        },
      ])
    );
  }

  private async query(
    userId: string,
    startRule: SQL | undefined,
    to: Date,
    limit?: number
  ): Promise<IScheduledSession[]> {
    const query = this.db
      .select({
        id: lessons.id,
        courseId: courses.id,
        courseTitle: courses.title,
        koskId: kosks.id,
        koskName: kosks.name,
        weekNumber: courseWeeks.weekNumber,
        title: lessons.title,
        startsAt: lessons.scheduledAt,
        durationMinutes: lessons.durationMinutes,
        cancelledAt: lessons.cancelledAt,
        meetingUrl: lessons.meetingUrl,
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(
        and(
          eq(lessons.type, LessonType.LIVE),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt),
          isNull(courses.archivedAt),
          isNull(kosks.archivedAt),
          eq(courses.status, CourseStatus.PUBLISHED),
          inArray(
            courses.id,
            enrolledCourseIds(this.db, userId, [EnrollmentStatus.ENROLLED], {
              excludePassive: true,
            })
          ),
          startRule,
          lt(lessons.scheduledAt, to)
        )
      )
      .orderBy(asc(lessons.scheduledAt), asc(lessons.id));

    const rows = await (limit === undefined ? query : query.limit(limit));
    return rows.flatMap(({ startsAt, ...row }) =>
      // Never null here — the range predicate excludes NULL — but the column
      // type does not know that.
      startsAt ? [{ ...row, startsAt }] : []
    );
  }
}
