import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  courseMuderris,
  courseResources,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import {
  ICourse,
  ICourseDetail,
  ICourseRef,
  ICourseRepository,
  ICourseSummary,
  ICreateCourse,
  ICreateLesson,
  IEnrolledCourse,
  IEnrollment,
  IEnrollOptions,
  ILessonMutation,
  IPendingEnrollment,
  IReplaceCourse,
  IUpdateCourse,
  IUpdateLesson,
} from "./course.repository.interface";
import { CourseStatus } from "./domain/course-status.enum";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { CourseVersionConflictError } from "./errors/course-version-conflict.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { WeekNotFoundError } from "./errors/week-not-found.error";

type Tx = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

@Injectable()
export class CourseRepository implements ICourseRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findSummariesByKosk(
    koskId: string,
    userId: string,
    includeDrafts: boolean
  ): Promise<ICourseSummary[]> {
    const rows = await this.db.query.courses.findMany({
      // DRAFT courses are only visible to the köşk owner.
      where: includeDrafts
        ? eq(courses.koskId, koskId)
        : and(
            eq(courses.koskId, koskId),
            eq(courses.status, CourseStatus.PUBLISHED)
          ),
      with: {
        weeks: {
          where: (w, { isNull }) => isNull(w.archivedAt),
          with: { lessons: { where: (l, { isNull }) => isNull(l.archivedAt) } },
        },
        muderris: { orderBy: (m, { asc }) => [asc(m.orderIndex)] },
        resources: true,
        enrollments: { where: (e, { eq }) => eq(e.userId, userId) },
      },
    });

    return rows.map((row) => {
      const { weeks, resources, enrollments: enr, ...course } = row;
      return {
        ...course,
        weekCount: weeks.length,
        lessonCount: weeks.reduce((sum, w) => sum + w.lessons.length, 0),
        resourceCount: resources.length,
        muderris: row.muderris,
        enrollment: enr[0] ?? null,
      };
    });
  }

  async findDetailById(
    id: string,
    userId: string
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
              columns: { archivedAt: false },
              where: (l, { isNull }) => isNull(l.archivedAt),
              orderBy: (l, { asc }) => [asc(l.orderIndex)],
            },
          },
        },
        muderris: { orderBy: (m, { asc }) => [asc(m.orderIndex)] },
        resources: { orderBy: (r, { asc }) => [asc(r.orderIndex)] },
        enrollments: { where: (e, { eq }) => eq(e.userId, userId) },
      },
    });

    if (!row) return null;
    const { enrollments: enr, ...course } = row;
    return { ...course, enrollment: enr[0] ?? null };
  }

  async findEnrolledByUser(userId: string): Promise<IEnrolledCourse[]> {
    const rows = await this.db.query.enrollments.findMany({
      where: and(
        eq(enrollments.userId, userId),
        ne(enrollments.status, EnrollmentStatus.PENDING)
      ),
      with: {
        course: {
          with: {
            kosk: { columns: { name: true } },
            weeks: {
              where: (w, { isNull }) => isNull(w.archivedAt),
              with: {
                lessons: {
                  columns: { id: true },
                  where: (l, { isNull }) => isNull(l.archivedAt),
                },
              },
            },
            muderris: { orderBy: (m, { asc }) => [asc(m.orderIndex)] },
          },
        },
      },
    });

    return rows.map((row) => {
      const { kosk, weeks, muderris, ...course } = row.course;
      return {
        ...course,
        koskName: kosk.name,
        weekCount: weeks.length,
        lessonCount: weeks.reduce((sum, w) => sum + w.lessons.length, 0),
        muderris,
        enrollment: {
          userId: row.userId,
          courseId: row.courseId,
          studentName: row.studentName,
          studentEmail: row.studentEmail,
          progress: row.progress,
          status: row.status,
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
              duration: l.duration,
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
            duration: l.duration,
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
          .set({ archivedAt: now, updatedAt: now })
          .where(inArray(lessons.id, [...unclaimedLessonIds]));
      }

      const weeksToArchive = [...existingWeekIds].filter(
        (weekId) => !keptWeekIds.has(weekId)
      );
      if (weeksToArchive.length) {
        await tx
          .update(courseWeeks)
          .set({ archivedAt: now, updatedAt: now })
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
      duration: row.duration,
      kaynak: row.kaynak,
      scheduledAt: row.scheduledAt,
      meetingUrl: row.meetingUrl,
      agenda: row.agenda,
      isPreview: row.isPreview,
      orderIndex: row.orderIndex,
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
          duration: data.duration,
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

  async archiveLesson(lessonId: string): Promise<ILessonMutation> {
    return this.db.transaction(async (tx) => {
      const courseId = await this.findLiveLessonCourseId(tx, lessonId);
      const courseVersion = await this.bumpVersion(tx, courseId, undefined);
      const now = new Date();
      const [row] = await tx
        .update(lessons)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(lessons.id, lessonId), isNull(lessons.archivedAt)))
        .returning();
      // Archived by a concurrent request between the read and the lock.
      if (!row) throw new LessonNotFoundError(lessonId);
      return this.toLessonMutation(row, courseVersion);
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

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(courses)
      .where(eq(courses.id, id))
      .returning();
    return deleted.length > 0;
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
      .set({ status, updatedAt: new Date() })
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
      )
      .returning()
      .then((result) => result[0] || null);
  }

  async deleteEnrollment(userId: string, courseId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(enrollments)
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
      )
      .returning();
    return deleted.length > 0;
  }

  async isMuderris(courseId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: courseMuderris.id })
      .from(courseMuderris)
      .where(
        and(
          eq(courseMuderris.courseId, courseId),
          eq(courseMuderris.userId, userId)
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * The courses `userId` is listed on as müderris, by title. `selectDistinct`
   * because nothing stops the same account being listed twice on one course.
   */
  async findTaughtBy(userId: string): Promise<ICourseRef[]> {
    return this.db
      .selectDistinct({
        id: courses.id,
        title: courses.title,
        koskId: courses.koskId,
      })
      .from(courseMuderris)
      .innerJoin(courses, eq(courses.id, courseMuderris.courseId))
      .where(eq(courseMuderris.userId, userId))
      .orderBy(courses.title, courses.id);
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
