import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { enrolledCourseIds } from "../database/enrolled-courses";
import { isHeld } from "../database/role-assignments";
import { calendarFeedTokens } from "../database/schema/calendar-feed.schema";
import {
  courses,
  courseWeeks,
  lessons,
} from "../database/schema/course.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";

/** One session as the feed needs it — and nothing else (no meeting link). */
export interface IFeedSession {
  courseId: string;
  courseTitle: string;
  courseVersion: number;
  lessonId: string;
  lessonTitle: string;
  scheduledAt: Date;
  durationMinutes: number | null;
  /**
   * The lesson, or the week holding it, was removed (MDRS-95), or the
   * session was cancelled and keeps its slot (MDRS-158).
   */
  cancelled: boolean;
}

/**
 * Enrollment states that put a course's sessions in the talebe's feed.
 * Listed positively, so a pending request and any state added later — a ban
 * (MDRS-113) — stay out until someone decides otherwise here.
 */
const FEED_ENROLLMENT_STATES = [
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.COMPLETED,
];

@Injectable()
export class CalendarFeedRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Stores the hash of a new token for `userId`, replacing any old one. */
  async replaceToken(userId: string, tokenHash: string): Promise<Date> {
    const createdAt = new Date();
    await this.db
      .insert(calendarFeedTokens)
      .values({ userId, tokenHash, createdAt })
      .onConflictDoUpdate({
        target: calendarFeedTokens.userId,
        set: { tokenHash, createdAt },
      });
    return createdAt;
  }

  async findCreatedAt(userId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ createdAt: calendarFeedTokens.createdAt })
      .from(calendarFeedTokens)
      .where(eq(calendarFeedTokens.userId, userId))
      .limit(1);
    return row?.createdAt ?? null;
  }

  async findUserIdByHash(tokenHash: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: calendarFeedTokens.userId })
      .from(calendarFeedTokens)
      .where(eq(calendarFeedTokens.tokenHash, tokenHash))
      .limit(1);
    return row?.userId ?? null;
  }

  /** The user's own locale setting (MDRS-104), if they have a row. */
  async findUserLocale(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.locale ?? null;
  }

  /**
   * Every scheduled session between `from` and `to` of every course
   * `userId` is enrolled in, teaches or manages (MDRS-120).
   *
   * Visibility follows `GET /courses/:id` (`CourseService.getDetail`): a
   * hidden course is in no one's feed, and a draft only in its köşk
   * manager's. Removed lessons stay in, marked cancelled, so a subscribed
   * calendar learns that the session is off rather than keeping it.
   */
  async findSessions(
    userId: string,
    from: Date,
    to: Date
  ): Promise<IFeedSession[]> {
    const enrolledIn = enrolledCourseIds(
      this.db,
      userId,
      FEED_ENROLLMENT_STATES,
      // A passive course is closed even to its talebe: no live link in a feed.
      { excludePassive: true }
    );
    // The courses the user holds MUDERRIS on, and the köşks they hold
    // KOSK_NAZIM in (MDRS-126, MDRS-134).
    const heldBy = (
      role: typeof ASSIGNED_ROLES.MUDERRIS | typeof ASSIGNED_ROLES.KOSK_NAZIM
    ) =>
      this.db
        .select({ id: roleAssignments.scopeId })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, userId),
            eq(roleAssignments.role, role),
            isHeld()
          )
        );
    const teaches = heldBy(ASSIGNED_ROLES.MUDERRIS);
    const manages = heldBy(ASSIGNED_ROLES.KOSK_NAZIM);

    const rows = await this.db
      .select({
        courseId: courses.id,
        courseTitle: courses.title,
        courseVersion: courses.version,
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        scheduledAt: lessons.scheduledAt,
        durationMinutes: lessons.durationMinutes,
        lessonArchivedAt: lessons.archivedAt,
        lessonCancelledAt: lessons.cancelledAt,
        weekArchivedAt: courseWeeks.archivedAt,
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .where(
        and(
          isNull(courses.archivedAt),
          gte(lessons.scheduledAt, from),
          lte(lessons.scheduledAt, to),
          or(
            inArray(courses.koskId, manages),
            and(
              eq(courses.status, CourseStatus.PUBLISHED),
              or(inArray(courses.id, enrolledIn), inArray(courses.id, teaches))
            )
          )
        )
      )
      .orderBy(asc(lessons.scheduledAt), asc(lessons.id));

    return rows.flatMap(
      ({
        scheduledAt,
        lessonArchivedAt,
        lessonCancelledAt,
        weekArchivedAt,
        ...row
      }) =>
        // Never null here — the range predicate excludes NULL — but the
        // column type does not know that.
        scheduledAt
          ? [
              {
                ...row,
                scheduledAt,
                cancelled:
                  lessonArchivedAt !== null ||
                  lessonCancelledAt !== null ||
                  weekArchivedAt !== null,
              },
            ]
          : []
    );
  }
}
