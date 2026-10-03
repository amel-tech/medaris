import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  min,
  type SQL,
  sql,
} from "drizzle-orm";
import { CourseStatus } from "../../course/domain/course-status.enum";
import { EnrollmentStatus } from "../../course/domain/enrollment-status.enum";
import { LessonType } from "../../course/domain/lesson-type.enum";
import { DatabaseService } from "../../database/database.service";
import { holdsIn, isHeld } from "../../database/role-assignments";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../database/schema/course.schema";
import { kosks } from "../../database/schema/kosk.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../database/schema/role-assignment.schema";
import { users } from "../../database/schema/user.schema";
import type {
  IDashboardApplication,
  IDashboardSession,
  IDecidingScopes,
  IMadrasahStudent,
  IMadrasahStudentFilter,
  IMadrasahStudentPage,
} from "./madrasah-portal.repository.interface";

/** The enrollment states that make someone a medrese's talebe (MDRS-133). */
const TALEBE_STATES = [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED];

const fullName = (given: string | null, family: string | null) =>
  [given, family].filter(Boolean).join(" ").trim() || null;

/** The host of a meeting link; null when there is no link or it does not parse. */
export function hostOf(url: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * What the nazır portal's own pages read about a medrese: its talebe
 * (nazir/10) and the Pano (nazir/01). Reads only; the writes these pages lead
 * to are the course, ban and enrollment routes'.
 */
@Injectable()
export class MadrasahPortalRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The seats that make someone a talebe of the medrese: its shown courses' enrolled and completed ones. */
  private seatsOf(madrasahId: string): SQL {
    return and(
      eq(courses.madrasahId, madrasahId),
      isNull(courses.archivedAt),
      inArray(enrollments.status, TALEBE_STATES)
    ) as SQL;
  }

  /**
   * The medrese's talebe, a page of them (nazir/10): everyone with an enrolled
   * or completed seat in one of its courses that is not hidden, derived on
   * every read like `MadrasahRepository.findTalebeIds`. Newest first by their
   * first enrollment. The filters pick the talebe; each row still lists all of
   * their courses in the medrese.
   */
  async findStudents(
    madrasahId: string,
    filter: IMadrasahStudentFilter,
    limit: number,
    offset: number
  ): Promise<IMadrasahStudentPage> {
    const like = filter.q?.trim()
      ? `%${filter.q.trim().replace(/[\\%_]/g, "\\$&")}%`
      : null;
    // On one seat each, so a talebe is picked by a course they attend in the
    // state asked for, not by a course here and a state there.
    const seat: (SQL | undefined)[] = [
      filter.courseId ? eq(enrollments.courseId, filter.courseId) : undefined,
      filter.status ? eq(enrollments.status, filter.status) : undefined,
      like
        ? sql`(concat_ws(' ', ${users.givenName}, ${users.familyName}) ilike ${like} or ${enrollments.studentName} ilike ${like} or coalesce(${users.email}, ${enrollments.studentEmail}) ilike ${like})`
        : undefined,
    ];
    const picked = and(...seat);
    const grouped = this.db
      .select({
        userId: enrollments.userId,
        firstEnrolledAt: min(enrollments.createdAt).as("first_enrolled_at"),
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .leftJoin(users, eq(users.id, enrollments.userId))
      .where(this.seatsOf(madrasahId))
      .groupBy(enrollments.userId)
      .having(picked ? sql`bool_or(${picked})` : undefined)
      .as("students");

    const [[total], page] = await Promise.all([
      this.db.select({ n: count() }).from(grouped),
      this.db
        .select()
        .from(grouped)
        .orderBy(desc(grouped.firstEnrolledAt), asc(grouped.userId))
        .limit(limit)
        .offset(offset),
    ]);
    if (page.length === 0) return { items: [], total: total?.n ?? 0 };

    const seats = await this.db
      .select({
        userId: enrollments.userId,
        courseId: courses.id,
        title: courses.title,
        status: enrollments.status,
        completedAt: enrollments.completedAt,
        studentName: enrollments.studentName,
        studentEmail: enrollments.studentEmail,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .leftJoin(users, eq(users.id, enrollments.userId))
      .where(
        and(
          this.seatsOf(madrasahId),
          inArray(
            enrollments.userId,
            page.map((p) => p.userId)
          )
        )
      )
      .orderBy(asc(courses.title), asc(courses.id));

    const items = page.map((p): IMadrasahStudent => {
      const own = seats.filter((s) => s.userId === p.userId);
      return {
        userId: p.userId,
        name:
          fullName(own[0]?.givenName ?? null, own[0]?.familyName ?? null) ??
          own.find((s) => s.studentName)?.studentName ??
          null,
        email:
          own[0]?.email ??
          own.find((s) => s.studentEmail)?.studentEmail ??
          null,
        firstEnrolledAt: p.firstEnrolledAt as Date,
        ongoing: own
          .filter((s) => s.status === EnrollmentStatus.ENROLLED)
          .map((s) => ({ id: s.courseId, title: s.title, completedAt: null })),
        completed: own
          .filter((s) => s.status === EnrollmentStatus.COMPLETED)
          .map((s) => ({
            id: s.courseId,
            title: s.title,
            completedAt: s.completedAt,
          })),
      };
    });
    return { items, total: total?.n ?? 0 };
  }

  /** The medrese nazırs held (MEDRESE_NAZIR); the başmüderris is not among them. */
  async countNazirs(madrasahId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(roleAssignments)
      .where(holdsIn(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasahId));
    return row?.n ?? 0;
  }

  /** The medrese's courses that are not hidden, drafts included. */
  async countCourses(madrasahId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(courses)
      .where(
        and(eq(courses.madrasahId, madrasahId), isNull(courses.archivedAt))
      );
    return row?.n ?? 0;
  }

  /**
   * The live sessions of the medrese's published courses between now and
   * `days` days ahead, soonest first. A cancelled or hidden session, a hidden
   * week and a hidden or draft course are not here; the database clock decides
   * what "now" is, as for the badge counts.
   */
  async findUpcomingSessions(
    madrasahId: string,
    days: number
  ): Promise<IDashboardSession[]> {
    const rows = await this.db
      .select({
        lessonId: lessons.id,
        courseId: courses.id,
        courseTitle: courses.title,
        courseCoverHue: courses.coverHue,
        koskId: kosks.id,
        koskName: kosks.name,
        weekNumber: courseWeeks.weekNumber,
        scheduledAt: lessons.scheduledAt,
        meetingUrl: lessons.meetingUrl,
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          eq(courses.status, CourseStatus.PUBLISHED),
          isNull(courses.archivedAt),
          isNull(courseWeeks.archivedAt),
          isNull(lessons.archivedAt),
          isNull(lessons.cancelledAt),
          eq(lessons.type, LessonType.LIVE),
          gte(lessons.scheduledAt, sql`now()`),
          lte(lessons.scheduledAt, sql`now() + make_interval(days => ${days})`)
        )
      )
      .orderBy(asc(lessons.scheduledAt), asc(lessons.id));
    return rows.map(({ meetingUrl, scheduledAt, ...row }) => ({
      ...row,
      scheduledAt: scheduledAt as Date,
      meetingHost: hostOf(meetingUrl),
    }));
  }

  /** The pending applications across the medrese's shown courses, newest first. */
  async findPendingApplications(
    madrasahId: string,
    limit: number
  ): Promise<IDashboardApplication[]> {
    const rows = await this.db
      .select({
        courseId: courses.id,
        courseTitle: courses.title,
        koskId: courses.koskId,
        userId: enrollments.userId,
        studentName: enrollments.studentName,
        studentEmail: enrollments.studentEmail,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
        appliedAt: enrollments.createdAt,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .leftJoin(users, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          isNull(courses.archivedAt),
          eq(enrollments.status, EnrollmentStatus.PENDING)
        )
      )
      .orderBy(desc(enrollments.createdAt), asc(enrollments.userId))
      .limit(limit);
    return rows.map((r) => ({
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      koskId: r.koskId,
      userId: r.userId,
      studentName: r.studentName ?? fullName(r.givenName, r.familyName),
      studentEmail: r.studentEmail ?? r.email,
      appliedAt: r.appliedAt,
    }));
  }

  /**
   * Where the caller holds the roles whose defaults decide an application
   * (`enrollment.decide`): MUDERRIS of a course, KOSK_NAZIM of a köşk. SYSTEM_ADMIN is the service's to add: it is a realm role.
   */
  async decidingScopes(userId: string): Promise<IDecidingScopes> {
    const rows = await this.db
      .select({
        role: roleAssignments.role,
        scopeId: roleAssignments.scopeId,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          inArray(roleAssignments.role, [
            ASSIGNED_ROLES.MUDERRIS,
            ASSIGNED_ROLES.KOSK_NAZIM,
          ]),
          isHeld()
        )
      );
    const scopes: IDecidingScopes = {
      courseIds: new Set(),
      koskIds: new Set(),
    };
    for (const r of rows) {
      if (!r.scopeId) continue;
      (r.role === ASSIGNED_ROLES.MUDERRIS
        ? scopes.courseIds
        : scopes.koskIds
      ).add(r.scopeId);
    }
    return scopes;
  }
}
