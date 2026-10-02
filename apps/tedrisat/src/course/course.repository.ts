import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DatabaseService } from "../database/database.service";
import {
  holdsIn,
  isHeld,
  syncMuderrisAssignments,
} from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseMuderris,
  courseResources,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import {
  ICourse,
  ICourseDetail,
  ICourseRef,
  ICourseRepository,
  ICourseSummary,
  ICreateCourse,
  ICreateLesson,
  ICreateSessionBatch,
  IEnrolledCourse,
  IEnrollment,
  IEnrollOptions,
  ILessonMutation,
  IMuderris,
  IPendingEnrollment,
  IRemovedEnrollment,
  IRemoveEnrollment,
  IReplaceCourse,
  ISessionBatchResult,
  ISessionBatchWeek,
  IUpdateCourse,
  IUpdateLesson,
} from "./course.repository.interface";
import { IPurgeCounts, purgeCourses, recordDeletion, Tx } from "./course-purge";
import { CourseStatus } from "./domain/course-status.enum";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";
import { LessonType } from "./domain/lesson-type.enum";
import {
  type IDatedWeek,
  localDateOf,
  placeInWeeks,
} from "./domain/weekly-pattern";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { CourseVersionConflictError } from "./errors/course-version-conflict.error";
import { LessonAlreadyCancelledError } from "./errors/lesson-already-cancelled.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { WeekNotFoundError } from "./errors/week-not-found.error";

/**
 * The deprecated free-text `duration`, kept in step with `durationMinutes`
 * (MDRS-110) so that rolling back past migration 0019 shows every lesson's
 * current length. Goes away with the migration that drops the column.
 */
const legacyDuration = (
  minutes: number | null | undefined
): string | null | undefined => (minutes == null ? minutes : `${minutes} dk`);

/**
 * The caller's own enrollment row, or none for a caller with no token
 * (MDRS-122) — said as `false` rather than left to how `user_id = NULL`
 * compares.
 */
const enrollmentOf = (
  column: typeof enrollments.userId,
  userId: string | null
) => (userId === null ? sql`false` : eq(column, userId));

/**
 * The earliest session still ahead that stands (a cancelled one does not
 * count), with the number of the week it falls in (MDRS-159).
 */
export function nextSessionOf(
  weeks: {
    weekNumber: number;
    lessons: { scheduledAt: Date | null; cancelledAt: Date | null }[];
  }[],
  now: Date
): { at: Date; weekNumber: number } | null {
  let next: { at: Date; weekNumber: number } | null = null;
  for (const week of weeks) {
    for (const lesson of week.lessons) {
      const at = lesson.scheduledAt;
      if (at === null || lesson.cancelledAt !== null || at <= now) continue;
      if (next === null || at < next.at) {
        next = { at, weekNumber: week.weekNumber };
      }
    }
  }
  return next;
}

@Injectable()
export class CourseRepository implements ICourseRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * The medrese each course is opened by, by id, and the courses' imams as
   * `courseId:userId` keys (MDRS-159): two small reads over the course ids,
   * not a wider join.
   */
  private async madrasahsAndImamsOf(
    rows: { id: string; madrasahId: string | null }[]
  ): Promise<{ madrasahName: Map<string, string>; imamKeys: Set<string> }> {
    const madrasahIds = [
      ...new Set(rows.flatMap((r) => (r.madrasahId ? [r.madrasahId] : []))),
    ];
    const [madrasahRows, imamRows]: [
      { id: string; name: string }[],
      { courseId: string | null; userId: string }[],
    ] = await Promise.all([
      madrasahIds.length === 0
        ? Promise.resolve([])
        : this.db
            .select({ id: madrasahs.id, name: madrasahs.name })
            .from(madrasahs)
            .where(inArray(madrasahs.id, madrasahIds)),
      rows.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              courseId: roleAssignments.scopeId,
              userId: roleAssignments.userId,
            })
            .from(roleAssignments)
            .where(
              and(
                eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
                eq(roleAssignments.isImam, true),
                inArray(
                  roleAssignments.scopeId,
                  rows.map((r) => r.id)
                ),
                isHeld()
              )
            ),
    ]);
    return {
      madrasahName: new Map(madrasahRows.map((m) => [m.id, m.name])),
      imamKeys: new Set(imamRows.map((i) => `${i.courseId}:${i.userId}`)),
    };
  }

  async findSummariesByKosk(
    koskId: string,
    userId: string | null,
    includeDrafts: boolean,
    archived = false
  ): Promise<ICourseSummary[]> {
    const rows = await this.db.query.courses.findMany({
      // DRAFT courses are only visible to the köşk owner. `archived` picks
      // the list: live courses, or the hidden ones for the "Arşiv" view
      // (MDRS-124) — never both, so a hidden course is in no ordinary list.
      where: and(
        eq(courses.koskId, koskId),
        archived ? isNotNull(courses.archivedAt) : isNull(courses.archivedAt),
        includeDrafts ? undefined : eq(courses.status, CourseStatus.PUBLISHED)
      ),
      with: {
        weeks: {
          where: (w, { isNull }) => isNull(w.archivedAt),
          with: { lessons: { where: (l, { isNull }) => isNull(l.archivedAt) } },
        },
        muderris: { orderBy: (m, { asc }) => [asc(m.orderIndex), asc(m.id)] },
        resources: true,
        enrollments: { where: (e) => enrollmentOf(e.userId, userId) },
      },
    });

    const { madrasahName, imamKeys } = await this.madrasahsAndImamsOf(rows);
    const now = new Date();

    return rows.map((row) => {
      const { weeks, resources, enrollments: enr, ...course } = row;
      return {
        ...course,
        weekCount: weeks.length,
        lessonCount: weeks.reduce((sum, w) => sum + w.lessons.length, 0),
        resourceCount: resources.length,
        muderris: row.muderris.map((m) => ({
          ...m,
          isImam: m.userId !== null && imamKeys.has(`${row.id}:${m.userId}`),
        })),
        enrollment: enr[0] ?? null,
        madrasah:
          row.madrasahId && madrasahName.has(row.madrasahId)
            ? {
                id: row.madrasahId,
                name: madrasahName.get(row.madrasahId) as string,
              }
            : null,
        nextSessionAt: nextSessionOf(weeks, now)?.at ?? null,
      };
    });
  }

  async findDetailById(
    id: string,
    userId: string | null
  ): Promise<ICourseDetail | null> {
    const row = await this.db.query.courses.findFirst({
      where: eq(courses.id, id),
      with: {
        weeks: {
          columns: { archivedAt: false },
          where: (w, { isNull }) => isNull(w.archivedAt),
          orderBy: (w, { asc }) => [asc(w.weekNumber)],
          with: {
            lessons: {
              // `duration` is the deprecated free text (MDRS-110).
              columns: { archivedAt: false, duration: false },
              where: (l, { isNull }) => isNull(l.archivedAt),
              orderBy: (l, { asc }) => [asc(l.orderIndex)],
            },
          },
        },
        muderris: { orderBy: (m, { asc }) => [asc(m.orderIndex), asc(m.id)] },
        resources: { orderBy: (r, { asc }) => [asc(r.orderIndex)] },
        enrollments: { where: (e) => enrollmentOf(e.userId, userId) },
      },
    });

    if (!row) return null;
    const { enrollments: enr, ...course } = row;
    const { madrasahName, imamKeys } = await this.madrasahsAndImamsOf([row]);
    return {
      ...course,
      muderris: row.muderris.map((m) => ({
        ...m,
        isImam: m.userId !== null && imamKeys.has(`${row.id}:${m.userId}`),
      })),
      enrollment: enr[0] ?? null,
      madrasah:
        row.madrasahId && madrasahName.has(row.madrasahId)
          ? {
              id: row.madrasahId,
              name: madrasahName.get(row.madrasahId) as string,
            }
          : null,
    };
  }

  async findEnrolledByUser(
    userId: string,
    includePending = false
  ): Promise<IEnrolledCourse[]> {
    const now = new Date();
    const rows = await this.db.query.enrollments.findMany({
      where: and(
        eq(enrollments.userId, userId),
        // A revoked seat is not a course the talebe is in (MDRS-161).
        includePending
          ? ne(enrollments.status, EnrollmentStatus.REVOKED)
          : notInArray(enrollments.status, [
              EnrollmentStatus.PENDING,
              EnrollmentStatus.REVOKED,
            ])
      ),
      with: {
        course: {
          with: {
            kosk: { columns: { name: true } },
            weeks: {
              where: (w, { isNull }) => isNull(w.archivedAt),
              with: {
                lessons: {
                  columns: { id: true, scheduledAt: true, cancelledAt: true },
                  where: (l, { isNull }) => isNull(l.archivedAt),
                },
              },
            },
            muderris: {
              orderBy: (m, { asc }) => [asc(m.orderIndex), asc(m.id)],
            },
          },
        },
      },
      orderBy: (e, { asc }) => [asc(e.createdAt)],
    });

    // A hidden course drops out of its talebe's list too (MDRS-124); the
    // enrollment row stays, so restoring the course brings it back.
    const live = rows.filter((row) => row.course.archivedAt === null);
    const { madrasahName, imamKeys } = await this.madrasahsAndImamsOf(
      live.map((row) => row.course)
    );
    return live.map((row) => {
      const { kosk, weeks, muderris, ...course } = row.course;
      return {
        ...course,
        koskName: kosk.name,
        madrasahName: course.madrasahId
          ? (madrasahName.get(course.madrasahId) ?? null)
          : null,
        weekCount: weeks.length,
        lessonCount: weeks.reduce((sum, w) => sum + w.lessons.length, 0),
        muderris: muderris.map((m) => ({
          ...m,
          isImam: m.userId !== null && imamKeys.has(`${course.id}:${m.userId}`),
        })),
        nextSession: nextSessionOf(weeks, now),
        enrollment: {
          userId: row.userId,
          courseId: row.courseId,
          studentName: row.studentName,
          studentEmail: row.studentEmail,
          progress: row.progress,
          status: row.status,
          completedAt: row.completedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      };
    });
  }

  async create(course: ICreateCourse): Promise<ICourseDetail> {
    const { weeks, muderris, resources, ...courseData } = course;

    const courseId = await this.db.transaction(async (tx) => {
      const [createdCourse] = await tx
        .insert(courses)
        .values(courseData)
        .returning();

      if (muderris?.length) {
        await tx.insert(courseMuderris).values(
          muderris.map((m, i) => ({
            courseId: createdCourse.id,
            userId: m.userId,
            name: m.name,
            title: m.title,
            bio: m.bio,
            avatarHue: m.avatarHue,
            orderIndex: i,
          }))
        );
        await syncMuderrisAssignments(tx, createdCourse.id, course.authorId);
      }

      if (resources?.length) {
        await tx.insert(courseResources).values(
          resources.map((r, i) => ({
            courseId: createdCourse.id,
            name: r.name,
            meta: r.meta,
            type: r.type,
            url: r.url,
            orderIndex: i,
          }))
        );
      }

      for (const [wi, week] of (weeks ?? []).entries()) {
        const [createdWeek] = await tx
          .insert(courseWeeks)
          .values({
            courseId: createdCourse.id,
            weekNumber: week.weekNumber,
            title: week.title,
            summary: week.summary,
            orderIndex: wi,
          })
          .returning();

        if (week.lessons?.length) {
          await tx.insert(lessons).values(
            week.lessons.map((l, li) => ({
              weekId: createdWeek.id,
              title: l.title,
              type: l.type,
              durationMinutes: l.durationMinutes,
              duration: legacyDuration(l.durationMinutes),
              kaynak: l.kaynak,
              scheduledAt: l.scheduledAt,
              meetingUrl: l.meetingUrl,
              agenda: l.agenda,
              isPreview: l.isPreview ?? false,
              orderIndex: li,
            }))
          );
        }
      }

      return createdCourse.id;
    });

    // authorId is the creator; enrollment is irrelevant at creation time.
    const detail = await this.findDetailById(courseId, course.authorId);
    return detail as ICourseDetail;
  }

  async replace(
    id: string,
    userId: string,
    data: IReplaceCourse
  ): Promise<ICourseDetail> {
    const {
      weeks = [],
      muderris = [],
      resources = [],
      version: expectedVersion,
      ...courseData
    } = data;

    await this.db.transaction(async (tx) => {
      // The version check and the bump are one conditional UPDATE, so the
      // row lock it takes serialises concurrent saves: of two PUTs carrying
      // the same version, the second re-evaluates its WHERE after the first
      // commits, matches nothing, and is refused before it writes anything.
      await this.bumpVersion(tx, id, expectedVersion, courseData);

      // ---- müderris: upsert by id, delete the rest ----
      const existingMuderris = await tx
        .select({ id: courseMuderris.id })
        .from(courseMuderris)
        .where(eq(courseMuderris.courseId, id));
      const muderrisKeep = new Set(
        muderris.map((m) => m.id).filter((x): x is string => Boolean(x))
      );
      const muderrisToDelete = existingMuderris
        .filter((e) => !muderrisKeep.has(e.id))
        .map((e) => e.id);
      if (muderrisToDelete.length) {
        await tx
          .delete(courseMuderris)
          .where(inArray(courseMuderris.id, muderrisToDelete));
      }
      const existingMuderrisIds = new Set(existingMuderris.map((e) => e.id));
      for (const [i, m] of muderris.entries()) {
        const values = {
          courseId: id,
          userId: m.userId,
          name: m.name,
          title: m.title,
          bio: m.bio,
          avatarHue: m.avatarHue,
          orderIndex: i,
        };
        if (m.id && existingMuderrisIds.has(m.id)) {
          await tx
            .update(courseMuderris)
            .set(values)
            .where(eq(courseMuderris.id, m.id));
        } else {
          await tx.insert(courseMuderris).values(values);
        }
      }
      await syncMuderrisAssignments(tx, id, userId);

      // ---- resources: upsert by id, delete the rest ----
      const existingResources = await tx
        .select({ id: courseResources.id })
        .from(courseResources)
        .where(eq(courseResources.courseId, id));
      const resourcesKeep = new Set(
        resources.map((r) => r.id).filter((x): x is string => Boolean(x))
      );
      const resourcesToDelete = existingResources
        .filter((e) => !resourcesKeep.has(e.id))
        .map((e) => e.id);
      if (resourcesToDelete.length) {
        await tx
          .delete(courseResources)
          .where(inArray(courseResources.id, resourcesToDelete));
      }
      const existingResourceIds = new Set(existingResources.map((e) => e.id));
      for (const [i, r] of resources.entries()) {
        const values = {
          courseId: id,
          name: r.name,
          meta: r.meta,
          type: r.type,
          url: r.url,
          orderIndex: i,
        };
        if (r.id && existingResourceIds.has(r.id)) {
          await tx
            .update(courseResources)
            .set(values)
            .where(eq(courseResources.id, r.id));
        } else {
          await tx.insert(courseResources).values(values);
        }
      }

      // ---- weeks + lessons (MDRS-95) ----
      // Nothing below deletes a week or a lesson. A lesson's id must survive
      // every edit that keeps the lesson — recordings and calendar events
      // point at it and the foreign keys under a lesson cascade — so:
      //   * existing lessons are matched against the whole course, not per
      //     week, and a lesson that moves weeks is UPDATEd with a new weekId;
      //   * a lesson missing from the payload is archived, not deleted;
      //   * a week missing from the payload is archived after its lessons
      //     have been moved out, so the cascade from `course_weeks` never
      //     fires either.
      const now = new Date();
      const existingWeeks = await tx
        .select({ id: courseWeeks.id })
        .from(courseWeeks)
        .where(
          and(eq(courseWeeks.courseId, id), isNull(courseWeeks.archivedAt))
        );
      const existingWeekIds = new Set(existingWeeks.map((w) => w.id));

      const existingLessons = await tx
        .select({ id: lessons.id })
        .from(lessons)
        .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
        .where(and(eq(courseWeeks.courseId, id), isNull(lessons.archivedAt)));
      const unclaimedLessonIds = new Set(existingLessons.map((l) => l.id));

      const keptWeekIds = new Set<string>();
      for (const [wi, week] of weeks.entries()) {
        const weekValues = {
          courseId: id,
          weekNumber: week.weekNumber,
          title: week.title,
          summary: week.summary,
          orderIndex: wi,
        };

        let weekId: string;
        // `keptWeekIds` guards against the same week id appearing twice in
        // one payload: the second occurrence becomes a new week.
        if (
          week.id &&
          existingWeekIds.has(week.id) &&
          !keptWeekIds.has(week.id)
        ) {
          await tx
            .update(courseWeeks)
            .set({ ...weekValues, updatedAt: now })
            .where(eq(courseWeeks.id, week.id));
          weekId = week.id;
        } else {
          const [createdWeek] = await tx
            .insert(courseWeeks)
            .values(weekValues)
            .returning({ id: courseWeeks.id });
          weekId = createdWeek.id;
        }
        keptWeekIds.add(weekId);

        for (const [li, l] of (week.lessons ?? []).entries()) {
          const lessonValues = {
            weekId,
            title: l.title,
            type: l.type,
            // A full replace: a lesson sent without a length has none, rather
            // than keeping the one it had (an undefined key is not SET).
            durationMinutes: l.durationMinutes ?? null,
            duration: legacyDuration(l.durationMinutes ?? null),
            kaynak: l.kaynak,
            scheduledAt: l.scheduledAt,
            meetingUrl: l.meetingUrl,
            agenda: l.agenda,
            isPreview: l.isPreview ?? false,
            orderIndex: li,
          };
          // Deleting from the set as ids are claimed does two jobs: what is
          // left afterwards is exactly the set to archive, and a lesson id
          // repeated within the payload is only reused once.
          if (l.id && unclaimedLessonIds.delete(l.id)) {
            await tx
              .update(lessons)
              .set({ ...lessonValues, updatedAt: now })
              .where(eq(lessons.id, l.id));
          } else {
            await tx.insert(lessons).values(lessonValues);
          }
        }
      }

      if (unclaimedLessonIds.size) {
        await tx
          .update(lessons)
          .set({ archivedAt: now, archivedBy: userId, updatedAt: now })
          .where(inArray(lessons.id, [...unclaimedLessonIds]));
      }

      const weeksToArchive = [...existingWeekIds].filter(
        (weekId) => !keptWeekIds.has(weekId)
      );
      if (weeksToArchive.length) {
        await tx
          .update(courseWeeks)
          .set({ archivedAt: now, archivedBy: userId, updatedAt: now })
          .where(inArray(courseWeeks.id, weeksToArchive));
      }
    });

    return (await this.findDetailById(id, userId)) as ICourseDetail;
  }

  /**
   * Bumps the course's `version` (and applies `set`, if any) and returns the
   * new value. With `expectedVersion`, only a course still at that version is
   * written; anything else is a conflict. Without it the bump is
   * unconditional — used by the session-level writes that take no token, so
   * that a whole-course PUT loaded before them is still refused afterwards.
   *
   * Callers run this FIRST in their transaction: it takes the course row's
   * lock, which is what serialises every syllabus write against every other.
   */
  private async bumpVersion(
    tx: Tx,
    courseId: string,
    expectedVersion: number | undefined,
    set: Partial<typeof courses.$inferInsert> = {}
  ): Promise<number> {
    const [row] = await tx
      .update(courses)
      .set({
        ...set,
        version: sql`${courses.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        expectedVersion === undefined
          ? eq(courses.id, courseId)
          : and(eq(courses.id, courseId), eq(courses.version, expectedVersion))
      )
      .returning({ version: courses.version });
    if (row) return row.version;

    if (expectedVersion !== undefined) {
      const [exists] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);
      if (exists) {
        throw new CourseVersionConflictError(courseId, expectedVersion);
      }
    }
    throw new CourseNotFoundError(courseId);
  }

  /** Throws unless `weekId` is a live (unarchived) week of `courseId`. */
  private async assertLiveWeek(
    tx: Tx,
    courseId: string,
    weekId: string
  ): Promise<void> {
    const [week] = await tx
      .select({ id: courseWeeks.id })
      .from(courseWeeks)
      .where(
        and(
          eq(courseWeeks.id, weekId),
          eq(courseWeeks.courseId, courseId),
          isNull(courseWeeks.archivedAt)
        )
      )
      .limit(1);
    if (!week) throw new WeekNotFoundError(weekId, courseId);
  }

  /** The order index that places a lesson after every live one in the week. */
  private async nextOrderIndex(tx: Tx, weekId: string): Promise<number> {
    const [row] = await tx
      .select({ last: max(lessons.orderIndex) })
      .from(lessons)
      .where(and(eq(lessons.weekId, weekId), isNull(lessons.archivedAt)));
    return (row?.last ?? -1) + 1;
  }

  /** The course of a live (unarchived) lesson; throws if there is none. */
  private async findLiveLessonCourseId(
    tx: Tx,
    lessonId: string
  ): Promise<string> {
    const [row] = await tx
      .select({ courseId: courseWeeks.courseId })
      .from(lessons)
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .where(and(eq(lessons.id, lessonId), isNull(lessons.archivedAt)))
      .limit(1);
    if (!row) throw new LessonNotFoundError(lessonId);
    return row.courseId;
  }

  private toLessonMutation(
    row: typeof lessons.$inferSelect,
    courseVersion: number
  ): ILessonMutation {
    return {
      id: row.id,
      weekId: row.weekId,
      title: row.title,
      type: row.type,
      durationMinutes: row.durationMinutes,
      kaynak: row.kaynak,
      scheduledAt: row.scheduledAt,
      meetingUrl: row.meetingUrl,
      agenda: row.agenda,
      isPreview: row.isPreview,
      orderIndex: row.orderIndex,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      replacementLessonId: row.replacementLessonId,
      courseVersion,
    };
  }

  async findLessonCourseId(lessonId: string): Promise<string | null> {
    const rows = await this.db
      .select({ courseId: courseWeeks.courseId })
      .from(lessons)
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .where(eq(lessons.id, lessonId))
      .limit(1);
    return rows[0]?.courseId ?? null;
  }

  async createLesson(
    courseId: string,
    weekId: string,
    data: ICreateLesson
  ): Promise<ILessonMutation> {
    return this.db.transaction(async (tx) => {
      const courseVersion = await this.bumpVersion(tx, courseId, undefined);
      await this.assertLiveWeek(tx, courseId, weekId);
      const [row] = await tx
        .insert(lessons)
        .values({
          weekId,
          title: data.title,
          type: data.type,
          durationMinutes: data.durationMinutes,
          duration: legacyDuration(data.durationMinutes),
          kaynak: data.kaynak,
          scheduledAt: data.scheduledAt,
          meetingUrl: data.meetingUrl,
          agenda: data.agenda,
          isPreview: data.isPreview ?? false,
          orderIndex: await this.nextOrderIndex(tx, weekId),
        })
        .returning();
      return this.toLessonMutation(row, courseVersion);
    });
  }

  async cancelLesson(
    lessonId: string,
    expectedVersion: number,
    reason: string | null,
    actorId: string
  ): Promise<ILessonMutation> {
    return this.db.transaction(async (tx) => {
      const courseId = await this.findLiveLessonCourseId(tx, lessonId);
      const courseVersion = await this.bumpVersion(
        tx,
        courseId,
        expectedVersion
      );
      const now = new Date();
      const [row] = await tx
        .update(lessons)
        .set({
          cancelledAt: now,
          cancelReason: reason,
          updatedAt: now,
        })
        .where(and(eq(lessons.id, lessonId), isNull(lessons.cancelledAt)))
        .returning();
      if (!row) throw new LessonAlreadyCancelledError(lessonId);
      await tx.insert(auditLog).values({
        actorId,
        action: "lesson.cancel",
        entity: "lesson",
        entityId: lessonId,
        details: { courseId, reason },
      });
      return this.toLessonMutation(row, courseVersion);
    });
  }

  async setMuderris(
    courseId: string,
    expectedVersion: number,
    list: { userId: string; name: string; title?: string }[],
    imamUserId: string,
    actorId: string
  ): Promise<{ muderris: IMuderris[]; courseVersion: number }> {
    return this.db.transaction(async (tx) => {
      const courseVersion = await this.bumpVersion(
        tx,
        courseId,
        expectedVersion
      );
      const existing = await tx
        .select()
        .from(courseMuderris)
        .where(eq(courseMuderris.courseId, courseId));
      const keep = new Set(list.map((m) => m.userId.toLowerCase()));
      const dropped = existing.filter(
        (e) => e.userId === null || !keep.has(e.userId.toLowerCase())
      );
      if (dropped.length) {
        await tx.delete(courseMuderris).where(
          inArray(
            courseMuderris.id,
            dropped.map((d) => d.id)
          )
        );
      }
      for (const [i, m] of list.entries()) {
        const row = existing.find(
          (e) => e.userId?.toLowerCase() === m.userId.toLowerCase()
        );
        if (row) {
          await tx
            .update(courseMuderris)
            .set({ orderIndex: i })
            .where(eq(courseMuderris.id, row.id));
        } else {
          await tx.insert(courseMuderris).values({
            courseId,
            userId: m.userId,
            name: m.name,
            title: m.title ?? null,
            orderIndex: i,
          });
        }
      }
      await syncMuderrisAssignments(tx, courseId, actorId);
      const seat = holdsIn(ASSIGNED_ROLES.MUDERRIS, courseId);
      await tx
        .update(roleAssignments)
        .set({ isImam: false })
        .where(and(seat, eq(roleAssignments.isImam, true)));
      await tx
        .update(roleAssignments)
        .set({ isImam: true })
        .where(and(seat, eq(roleAssignments.userId, imamUserId)));
      await tx.insert(auditLog).values({
        actorId,
        action: "course.muderris_update",
        entity: "course",
        entityId: courseId,
        details: {
          before: existing.map((e) => e.userId),
          after: list.map((m) => m.userId),
          imamUserId,
        },
      });
      const rows = await tx
        .select()
        .from(courseMuderris)
        .where(eq(courseMuderris.courseId, courseId))
        .orderBy(courseMuderris.orderIndex, courseMuderris.id);
      return {
        muderris: rows.map((r) => ({
          ...r,
          isImam:
            r.userId !== null &&
            r.userId.toLowerCase() === imamUserId.toLowerCase(),
        })),
        courseVersion,
      };
    });
  }

  async updateLesson(
    lessonId: string,
    expectedVersion: number,
    data: IUpdateLesson
  ): Promise<ILessonMutation> {
    return this.db.transaction(async (tx) => {
      const courseId = await this.findLiveLessonCourseId(tx, lessonId);
      // Every write that could archive or move this lesson bumps the version
      // under the same row lock, so once this succeeds the lesson read above
      // is still live and still in `courseId`.
      const courseVersion = await this.bumpVersion(
        tx,
        courseId,
        expectedVersion
      );
      const { weekId, orderIndex, ...fields } = data;
      const set: Partial<typeof lessons.$inferInsert> = {
        ...fields,
        updatedAt: new Date(),
      };
      if (fields.durationMinutes !== undefined) {
        set.duration = legacyDuration(fields.durationMinutes);
      }
      const [current] = await tx
        .select({ weekId: lessons.weekId })
        .from(lessons)
        .where(eq(lessons.id, lessonId));
      if (weekId !== undefined && weekId !== current.weekId) {
        // A move is an UPDATE of weekId — never a delete plus insert — so the
        // lesson keeps its id and everything that points at it.
        await this.assertLiveWeek(tx, courseId, weekId);
        set.weekId = weekId;
        set.orderIndex = orderIndex ?? (await this.nextOrderIndex(tx, weekId));
      } else if (orderIndex !== undefined) {
        set.orderIndex = orderIndex;
      }
      const [row] = await tx
        .update(lessons)
        .set(set)
        .where(eq(lessons.id, lessonId))
        .returning();
      return this.toLessonMutation(row, courseVersion);
    });
  }

  async archiveLesson(
    lessonId: string,
    actorId: string | null = null
  ): Promise<ILessonMutation> {
    return this.db.transaction(async (tx) => {
      const courseId = await this.findLiveLessonCourseId(tx, lessonId);
      const courseVersion = await this.bumpVersion(tx, courseId, undefined);
      const now = new Date();
      const [row] = await tx
        .update(lessons)
        .set({ archivedAt: now, archivedBy: actorId, updatedAt: now })
        .where(and(eq(lessons.id, lessonId), isNull(lessons.archivedAt)))
        .returning();
      // Archived by a concurrent request between the read and the lock.
      if (!row) throw new LessonNotFoundError(lessonId);
      return this.toLessonMutation(row, courseVersion);
    });
  }

  async findTimeZone(courseId: string): Promise<string | null> {
    const rows = await this.db
      .select({ timeZone: courses.timeZone })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    return rows[0]?.timeZone ?? null;
  }

  /**
   * The weeks that already hold dated sessions, each with its earliest
   * session's date in the course's zone (nizam/55). Shared by the preview and
   * the write so both number a session the same way.
   */
  async datedWeeks(
    courseId: string,
    timeZone: string,
    executor?: Pick<DatabaseService["db"], "select">
  ): Promise<IDatedWeek[]> {
    const dated = await (executor ?? this.db)
      .select({
        weekNumber: courseWeeks.weekNumber,
        scheduledAt: lessons.scheduledAt,
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          isNull(courseWeeks.archivedAt),
          isNull(lessons.archivedAt),
          isNull(lessons.cancelledAt),
          isNotNull(lessons.scheduledAt)
        )
      );
    const firstDay = new Map<number, string>();
    for (const row of dated) {
      const day = localDateOf(row.scheduledAt as Date, timeZone);
      const held = firstDay.get(row.weekNumber);
      if (held === undefined || day < held) firstDay.set(row.weekNumber, day);
    }
    return [...firstDay].map(([weekNumber, from]) => ({ weekNumber, from }));
  }

  /**
   * A weekly pattern's sessions (MDRS-109), through the same session-level
   * path as `createLesson`: one transaction that bumps the course version
   * first, so a whole-course PUT loaded before it is refused rather than
   * archiving what it added. Each session goes into the live week with its
   * `weekNumber`; a missing week is created as "Hafta N" after the last one.
   */
  async createSessionBatch(
    courseId: string,
    batch: ICreateSessionBatch
  ): Promise<ISessionBatchResult> {
    return this.db.transaction(async (tx) => {
      const courseVersion = await this.bumpVersion(tx, courseId, undefined);
      const [course] = await tx
        .select({ timeZone: courses.timeZone })
        .from(courses)
        .where(eq(courses.id, courseId));
      const drafted = batch.plan(course.timeZone);
      const liveWeeks = await tx
        .select({
          id: courseWeeks.id,
          weekNumber: courseWeeks.weekNumber,
          title: courseWeeks.title,
          orderIndex: courseWeeks.orderIndex,
        })
        .from(courseWeeks)
        .where(
          and(
            eq(courseWeeks.courseId, courseId),
            isNull(courseWeeks.archivedAt)
          )
        )
        .orderBy(courseWeeks.weekNumber, courseWeeks.orderIndex);

      // A session goes into the week its date falls in (nizam/55), counted
      // from the weeks that already hold dated sessions; the pattern's own
      // numbering applies only when the course has none.
      const numbers = placeInWeeks(
        drafted,
        await this.datedWeeks(courseId, course.timeZone, tx)
      );
      const planned = drafted.map((s, i) => ({
        ...s,
        weekNumber: numbers[i],
      }));

      // Two live weeks may share a number; the first in syllabus order wins.
      const byNumber = new Map<number, ISessionBatchWeek>();
      for (const w of liveWeeks) {
        if (!byNumber.has(w.weekNumber)) {
          byNumber.set(w.weekNumber, {
            id: w.id,
            weekNumber: w.weekNumber,
            title: w.title,
            created: false,
          });
        }
      }
      let lastOrder = liveWeeks.reduce((m, w) => Math.max(m, w.orderIndex), -1);
      const needed = [...new Set(planned.map((s) => s.weekNumber))].sort(
        (a, b) => a - b
      );
      const touched: ISessionBatchWeek[] = [];
      for (const weekNumber of needed) {
        let week = byNumber.get(weekNumber);
        if (!week) {
          lastOrder += 1;
          const [row] = await tx
            .insert(courseWeeks)
            .values({
              courseId,
              weekNumber,
              title: `Hafta ${weekNumber}`,
              orderIndex: lastOrder,
            })
            .returning();
          week = {
            id: row.id,
            weekNumber,
            title: row.title,
            created: true,
          };
          byNumber.set(weekNumber, week);
        }
        touched.push(week);
      }

      const nextOrder = new Map<string, number>();
      for (const week of touched) {
        // A week created above is empty; only an existing one needs a lookup.
        nextOrder.set(
          week.id,
          week.created ? 0 : await this.nextOrderIndex(tx, week.id)
        );
      }
      const sessions = [...planned].sort(
        (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
      );
      const values = sessions.map((s, i) => {
        const weekId = (byNumber.get(s.weekNumber) as ISessionBatchWeek).id;
        const orderIndex = nextOrder.get(weekId) as number;
        nextOrder.set(weekId, orderIndex + 1);
        return {
          weekId,
          title: batch.title,
          type: LessonType.LIVE,
          durationMinutes: batch.durationMinutes,
          duration: legacyDuration(batch.durationMinutes),
          scheduledAt: s.scheduledAt,
          // Links change every week (MDRS-109): only the first gets one.
          meetingUrl: i === 0 ? batch.meetingUrl : undefined,
          isPreview: false,
          orderIndex,
        };
      });
      const rows = await tx.insert(lessons).values(values).returning();
      const weekNumberOf = new Map(touched.map((w) => [w.id, w.weekNumber]));
      return {
        courseVersion,
        weeks: touched,
        lessons: rows
          .map((row) => {
            const { courseVersion: _version, ...lesson } =
              this.toLessonMutation(row, courseVersion);
            return {
              ...lesson,
              weekNumber: weekNumberOf.get(row.weekId) as number,
            };
          })
          .sort(
            (a, b) =>
              (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0)
          ),
      };
    });
  }

  async findKoskId(id: string): Promise<string | null> {
    const rows = await this.db
      .select({ koskId: courses.koskId })
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    return rows[0]?.koskId ?? null;
  }

  /**
   * What decides whether a caller with no token may see the course
   * (MDRS-122): its status, whether it is hidden, and whether its köşk is
   * unlisted. One row, one join; null when the course is not there.
   */
  async findPublicVisibility(id: string): Promise<{
    status: CourseStatus;
    archived: boolean;
    koskIsPrivate: boolean;
    koskHidden: boolean;
  } | null> {
    const rows = await this.db
      .select({
        status: courses.status,
        archivedAt: courses.archivedAt,
        koskIsPrivate: kosks.isPrivate,
        koskArchivedAt: kosks.archivedAt,
      })
      .from(courses)
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(eq(courses.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      status: row.status,
      archived: row.archivedAt !== null,
      koskIsPrivate: row.koskIsPrivate,
      koskHidden: row.koskArchivedAt !== null,
    };
  }

  async update(id: string, updates: IUpdateCourse): Promise<ICourse | null> {
    return this.db
      .update(courses)
      .set({
        ...updates,
        version: sql`${courses.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, id))
      .returning()
      .then((result) => result[0] || null);
  }

  /**
   * Hides the course (MDRS-124): stamps `archived_at`/`archived_by` and bumps
   * the version, so an editor still holding the old one cannot save over the
   * hide unawares. Hiding a hidden course changes nothing — not the first
   * stamp, not the version. Null when no such course exists.
   */
  async archive(id: string, userId: string): Promise<ICourse | null> {
    const now = new Date();
    const [row] = await this.db
      .update(courses)
      .set({
        archivedAt: now,
        archivedBy: userId,
        version: sql`${courses.version} + 1`,
        updatedAt: now,
      })
      .where(and(eq(courses.id, id), isNull(courses.archivedAt)))
      .returning();
    return row ?? this.findCourseRow(id);
  }

  /** Brings a hidden course back; a no-op on a live one. Null if missing. */
  async restore(id: string): Promise<ICourse | null> {
    const [row] = await this.db
      .update(courses)
      .set({
        archivedAt: null,
        archivedBy: null,
        version: sql`${courses.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(courses.id, id), isNotNull(courses.archivedAt)))
      .returning();
    return row ?? this.findCourseRow(id);
  }

  private async findCourseRow(id: string): Promise<ICourse | null> {
    const [row] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * SYSTEM_ADMIN's real delete (MDRS-124): the course and every row under it,
   * children first, plus one `audit_log` entry naming what went — all in one
   * transaction. Null when there is no such course.
   */
  async purge(id: string, actorId: string): Promise<IPurgeCounts | null> {
    return this.db.transaction(async (tx) => {
      // FOR UPDATE: a concurrent syllabus write takes the same row lock
      // (`bumpVersion`), so nothing can add a child between the reads below
      // and the delete.
      const [course] = await tx
        .select({ title: courses.title, koskId: courses.koskId })
        .from(courses)
        .where(eq(courses.id, id))
        .for("update");
      if (!course) return null;

      const removed = await purgeCourses(tx, [id]);
      await recordDeletion(tx, {
        actorId,
        entity: "course",
        entityId: id,
        details: { title: course.title, koskId: course.koskId, removed },
      });
      return removed;
    });
  }

  async enroll(
    userId: string,
    courseId: string,
    options: IEnrollOptions = {}
  ): Promise<IEnrollment> {
    const [enrollment] = await this.db
      .insert(enrollments)
      .values({
        userId,
        courseId,
        status: options.status,
        studentName: options.studentName,
        studentEmail: options.studentEmail,
      })
      .onConflictDoNothing()
      .returning();

    if (enrollment) return enrollment;

    // Already enrolled — return the existing row.
    return (await this.findEnrollment(userId, courseId)) as IEnrollment;
  }

  async findPendingByKosk(koskId: string): Promise<IPendingEnrollment[]> {
    const rows = await this.db
      .select({
        userId: enrollments.userId,
        courseId: enrollments.courseId,
        studentName: enrollments.studentName,
        studentEmail: enrollments.studentEmail,
        progress: enrollments.progress,
        status: enrollments.status,
        createdAt: enrollments.createdAt,
        updatedAt: enrollments.updatedAt,
        courseTitle: courses.title,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(
        and(
          eq(courses.koskId, koskId),
          isNull(courses.archivedAt),
          eq(enrollments.status, EnrollmentStatus.PENDING)
        )
      )
      .orderBy(enrollments.createdAt);
    return rows;
  }

  async setEnrollmentStatus(
    userId: string,
    courseId: string,
    status: EnrollmentStatus
  ): Promise<IEnrollment | null> {
    return this.db
      .update(enrollments)
      .set({
        status,
        // Kept when it is already completed, so marking it again does not
        // move the date the team gave (MDRS-159).
        completedAt:
          status === EnrollmentStatus.COMPLETED
            ? sql`coalesce(${enrollments.completedAt}, now())`
            : null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
      )
      .returning()
      .then((result) => result[0] || null);
  }

  async deleteEnrollment(
    userId: string,
    courseId: string,
    onlyStatus?: EnrollmentStatus
  ): Promise<boolean> {
    const deleted = await this.db
      .delete(enrollments)
      .where(
        and(
          eq(enrollments.userId, userId),
          eq(enrollments.courseId, courseId),
          onlyStatus ? eq(enrollments.status, onlyStatus) : undefined
        )
      )
      .returning();
    return deleted.length > 0;
  }

  /**
   * The course's imam among its müderrisler (MDRS-133): the holder of the one
   * held MUDERRIS grant flagged `is_imam`, which the partial unique index
   * allows at most once per course.
   */
  async findImamUserId(courseId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(
        and(
          holdsIn(ASSIGNED_ROLES.MUDERRIS, courseId),
          eq(roleAssignments.isImam, true)
        )
      )
      .limit(1);
    return row?.userId ?? null;
  }

  /** True if `userId` holds MUDERRIS on the course (MDRS-134). */
  async isMuderris(courseId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          holdsIn(ASSIGNED_ROLES.MUDERRIS, courseId)
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * The courses `userId` holds MUDERRIS on (MDRS-134), by title. One row per
   * course: a person holds a role in a scope once at a time.
   */
  async findTaughtBy(userId: string): Promise<ICourseRef[]> {
    return (
      this.db
        .select({
          id: courses.id,
          title: courses.title,
          koskId: courses.koskId,
        })
        .from(roleAssignments)
        .innerJoin(courses, holdsIn(ASSIGNED_ROLES.MUDERRIS, courses.id))
        // A hidden course is not in anyone's `GET /me` either (MDRS-124).
        .where(
          and(eq(roleAssignments.userId, userId), isNull(courses.archivedAt))
        )
        .orderBy(courses.title, courses.id)
    );
  }

  /**
   * A read of a course's content by someone who is neither its enrolled
   * talebe nor one of its müderrisler (MDRS-103) — the köşk manager, or
   * SYSTEM_ADMIN through the realm bypass. Same table as the deletions
   * (MDRS-124); `action` tells the two apart.
   */
  async recordContentRead(entry: {
    actorId: string;
    courseId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: "course.content_read",
      entity: "course",
      entityId: entry.courseId,
      details: entry.details,
    });
  }

  async findEnrollment(
    userId: string,
    courseId: string
  ): Promise<IEnrollment | null> {
    return this.db
      .select()
      .from(enrollments)
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
      )
      .limit(1)
      .then((result) => result[0] || null);
  }

  /** The course's müderris rows in display order (MDRS-105). */
  async findMuderris(courseId: string): Promise<IMuderris[]> {
    const { imamKeys } = await this.madrasahsAndImamsOf([
      { id: courseId, madrasahId: null },
    ]);
    const rows = await this.db
      .select()
      .from(courseMuderris)
      .where(eq(courseMuderris.courseId, courseId))
      .orderBy(courseMuderris.orderIndex, courseMuderris.id);
    return rows.map((m) => ({
      ...m,
      isImam: m.userId !== null && imamKeys.has(`${courseId}:${m.userId}`),
    }));
  }

  /**
   * Which of `ids` have a `users` row, i.e. have signed in at least once
   * (MDRS-104). Lowercased, like the ids Postgres returns for a `uuid`.
   */
  async findKnownUserIds(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [...ids]));
    return rows.map((r) => r.id.toLowerCase());
  }

  /**
   * Every enrollment in the course — requests, active seats and completions
   * — for the course team's roster (MDRS-105). Requests first, then active
   * seats, then completions, each by when they joined.
   */
  async findEnrollmentsByCourse(courseId: string): Promise<IEnrollment[]> {
    return (
      this.db
        .select()
        .from(enrollments)
        .where(eq(enrollments.courseId, courseId))
        // A Postgres enum sorts in declaration order: PENDING, ENROLLED,
        // COMPLETED (migrations 0008 and 0010).
        .orderBy(enrollments.status, enrollments.createdAt, enrollments.userId)
    );
  }

  /**
   * Takes a talebe out of a course with the team's reason (MDRS-105): the
   * enrollment turns REVOKED (MDRS-161, design tedris/13) and one
   * `enrollment.remove` row lands in `audit_log`, in one transaction, so the
   * reason cannot be lost while the seat is. The row stays so the talebe's
   * page can say so; progress is kept. Not a ban — a ban is MDRS-177's.
   * Only an enrollment still in `expectedStatus` is revoked; false when there
   * was none (a concurrent leave, reject or completion got there first).
   */
  async removeEnrollment(entry: IRemoveEnrollment): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.userId, entry.userId),
            eq(enrollments.courseId, entry.courseId),
            eq(enrollments.status, entry.expectedStatus)
          )
        )
        .for("update");
      if (!before) return false;
      await tx
        .update(enrollments)
        .set({
          status: EnrollmentStatus.REVOKED,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(enrollments.userId, entry.userId),
            eq(enrollments.courseId, entry.courseId)
          )
        );
      await tx.insert(auditLog).values({
        actorId: entry.actorId,
        action: "enrollment.remove",
        entity: "course",
        entityId: entry.courseId,
        details: {
          userId: before.userId,
          studentName: before.studentName,
          studentEmail: before.studentEmail,
          reason: entry.reason,
          status: before.status,
          progress: before.progress,
          enrolledAt: before.createdAt.toISOString(),
        },
      });
      return true;
    });
  }

  /**
   * The talebe the team took out of a course, newest first (MDRS-178,
   * "Erişimi kaldırılanlar"): the `enrollment.remove` rows of the audit log.
   * Names come from the row itself when it kept them, else from `users`.
   */
  async findRemovedEnrollments(
    courseId: string
  ): Promise<IRemovedEnrollment[]> {
    const target = alias(users, "removed_target");
    const actor = alias(users, "removed_actor");
    const rows = await this.db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        details: auditLog.details,
        createdAt: auditLog.createdAt,
        targetGiven: target.givenName,
        targetFamily: target.familyName,
        targetEmail: target.email,
        actorGiven: actor.givenName,
        actorFamily: actor.familyName,
      })
      .from(auditLog)
      .leftJoin(
        target,
        sql`${target.id}::text = ${auditLog.details}->>'userId'`
      )
      .leftJoin(actor, eq(actor.id, auditLog.actorId))
      .where(
        and(
          eq(auditLog.action, "enrollment.remove"),
          eq(auditLog.entityId, courseId)
        )
      )
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id));
    const full = (g: string | null, f: string | null) =>
      [g, f].filter(Boolean).join(" ").trim() || null;
    return rows.map((r) => {
      const d = r.details as Record<string, unknown>;
      const text = (v: unknown) => (typeof v === "string" ? v : null);
      return {
        userId: String(d.userId ?? ""),
        name: text(d.studentName) ?? full(r.targetGiven, r.targetFamily),
        email: text(d.studentEmail) ?? r.targetEmail,
        reason: text(d.reason) ?? "",
        progress: typeof d.progress === "number" ? d.progress : 0,
        removedAt: r.createdAt,
        removedBy: {
          id: r.actorId,
          name: full(r.actorGiven, r.actorFamily),
        },
      };
    });
  }

  async updateProgress(
    userId: string,
    courseId: string,
    progress: number,
    status: EnrollmentStatus
  ): Promise<IEnrollment | null> {
    return this.db
      .update(enrollments)
      .set({ progress, status, updatedAt: new Date() })
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
      )
      .returning()
      .then((result) => result[0] || null);
  }
}
