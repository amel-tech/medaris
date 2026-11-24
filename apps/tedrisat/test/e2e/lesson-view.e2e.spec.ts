import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { bans } from "../../src/database/schema/ban.schema";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { lessonViews } from "../../src/database/schema/lesson-view.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-248 — "sayaç çalışmıyor": how far a talebe has watched each celse, and
 * the course progress worked out from it. Covers the record and its read-back,
 * the watched mark (ended, or nine tenths) and that it stays, the progress the
 * enrollment gets (hidden and cancelled celses left out), who may write (an
 * active enrollment no ban bars), and that nobody reads another's records.
 */

const MANAGER_ID = "e2480000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e2480000-0000-4000-8000-000000000002";
const TALEBE_ID = "e2480000-0000-4000-8000-000000000003";
const OTHER_TALEBE_ID = "e2480000-0000-4000-8000-000000000004";
const PENDING_ID = "e2480000-0000-4000-8000-000000000006";
const REVOKED_ID = "e2480000-0000-4000-8000-000000000007";
const BARRED_ID = "e2480000-0000-4000-8000-000000000008";
const STRANGER_ID = "e2480000-0000-4000-8000-000000000009";
const ADMIN_ID = "e2480000-0000-4000-8000-00000000000a";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

describe("a talebe's watch records (MDRS-248, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let firstId: string;
  let secondId: string;
  let thirdId: string;
  let cancelledId: string;
  let foreignLessonId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) =>
    sub === ADMIN_ID
      ? bearerFor({
          sub,
          claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
        })
      : bearerFor({ sub });

  const report = (lessonId: string, sub: string, body: unknown) =>
    http()
      .put(`/lessons/${lessonId}/view`)
      .set("Authorization", as(sub))
      .send(body as object);
  const list = (id: string, sub: string) =>
    http().get(`/courses/${id}/lesson-views`).set("Authorization", as(sub));
  const progressOf = async (userId: string) => {
    const [row] = await db()
      .select({ progress: enrollments.progress })
      .from(enrollments)
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
      );
    return row?.progress;
  };

  const clean = () =>
    dbUtils.cleanTables("bans", ...COURSE_TREE_TABLES, "users");

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
    });
    const [course, foreignCourse] = await db()
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Nahiv",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    courseId = course.id;
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
    });
    const [week, foreignWeek] = await db()
      .insert(courseWeeks)
      .values([
        { courseId, weekNumber: 1, title: "Emsile", orderIndex: 0 },
        {
          courseId: foreignCourse.id,
          weekNumber: 1,
          title: "Nahiv",
          orderIndex: 0,
        },
      ])
      .returning();
    const celse = (title: string, orderIndex: number) => ({
      weekId: week.id,
      title,
      type: LessonType.VIDEO,
      orderIndex,
    });
    [
      { id: firstId },
      { id: secondId },
      { id: thirdId },
      { id: cancelledId },
      { id: foreignLessonId },
    ] = await db()
      .insert(lessons)
      .values([
        celse("Birinci celse", 0),
        celse("İkinci celse", 1),
        celse("Üçüncü celse", 2),
        {
          ...celse("İptal edilen celse", 3),
          cancelledAt: new Date(),
          cancelReason: "Hoca rahatsız.",
        },
        {
          weekId: foreignWeek.id,
          title: "Başka dersin celsesi",
          type: LessonType.VIDEO,
          orderIndex: 0,
        },
      ])
      .returning();

    const status = (userId: string, s: EnrollmentStatus) => ({
      userId,
      courseId,
      status: s,
    });
    await db()
      .insert(enrollments)
      .values([
        status(TALEBE_ID, EnrollmentStatus.ENROLLED),
        status(OTHER_TALEBE_ID, EnrollmentStatus.ENROLLED),
        status(PENDING_ID, EnrollmentStatus.PENDING),
        status(REVOKED_ID, EnrollmentStatus.REVOKED),
        status(BARRED_ID, EnrollmentStatus.ENROLLED),
      ]);
    await db().insert(bans).values({
      userId: BARRED_ID,
      koskId: kosk.id,
      courseId,
      scope: "COURSE",
      reason: "Düzeni bozdu.",
      bannedBy: MUDERRIS_ID,
      bannedRole: "MUDERRIS",
      bannedTier: 1,
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("the record", () => {
    it("keeps where the player is and reads it back", async () => {
      const saved = await report(firstId, TALEBE_ID, {
        positionSeconds: 754,
        durationSeconds: 3480,
      }).expect(200);
      expect(saved.body).toEqual({
        lessonId: firstId,
        positionSeconds: 754,
        durationSeconds: 3480,
        completedAt: null,
        updatedAt: expect.any(String),
      });

      // A later report without a length keeps the stored one.
      await report(firstId, TALEBE_ID, { positionSeconds: 900 }).expect(200);

      const listed = await list(courseId, TALEBE_ID).expect(200);
      expect(listed.headers["cache-control"]).toBe("private, no-store");
      expect(listed.body).toEqual([
        {
          lessonId: firstId,
          positionSeconds: 900,
          durationSeconds: 3480,
          completedAt: null,
          updatedAt: expect.any(String),
        },
      ]);
      expect(await progressOf(TALEBE_ID)).toBe(0);
    });

    it("marks a celse watched at nine tenths, and keeps the mark", async () => {
      const short = await report(firstId, TALEBE_ID, {
        positionSeconds: 3131,
        durationSeconds: 3480,
      }).expect(200);
      expect(short.body.completedAt).toBeNull();

      const reached = await report(firstId, TALEBE_ID, {
        positionSeconds: 3132,
        durationSeconds: 3480,
      }).expect(200);
      expect(reached.body.completedAt).toEqual(expect.any(String));

      // Watching it again from the start does not take the mark away.
      const again = await report(firstId, TALEBE_ID, {
        positionSeconds: 10,
      }).expect(200);
      expect(again.body).toMatchObject({
        positionSeconds: 10,
        completedAt: reached.body.completedAt,
      });
    });

    it("marks a celse watched when the player ended, length or not", async () => {
      const ended = await report(secondId, TALEBE_ID, {
        positionSeconds: 0,
        ended: true,
      }).expect(200);
      expect(ended.body.completedAt).toEqual(expect.any(String));
    });

    it("refuses what is not a position", async () => {
      for (const body of [
        {},
        { positionSeconds: -1 },
        { positionSeconds: 1.5 },
        { positionSeconds: 360_000 },
        { positionSeconds: 10, durationSeconds: 0 },
        { positionSeconds: 10, ended: "yes" },
      ]) {
        await report(firstId, TALEBE_ID, body).expect(400);
      }
      expect(await db().select().from(lessonViews)).toEqual([]);
    });
  });

  describe("the course progress", () => {
    it("is the share of the course's celses watched, cancelled ones left out", async () => {
      await db()
        .update(enrollments)
        .set({ progress: 80 })
        .where(eq(enrollments.userId, TALEBE_ID));

      // Three celses count: the cancelled one does not.
      await report(firstId, TALEBE_ID, { positionSeconds: 60, ended: true });
      expect(await progressOf(TALEBE_ID)).toBe(33);

      await report(secondId, TALEBE_ID, {
        positionSeconds: 3400,
        durationSeconds: 3480,
      });
      expect(await progressOf(TALEBE_ID)).toBe(67);

      // A report that does not complete a celse leaves the progress as it is.
      await report(thirdId, TALEBE_ID, { positionSeconds: 30 });
      expect(await progressOf(TALEBE_ID)).toBe(67);

      // Watching a cancelled celse adds nothing.
      await report(cancelledId, TALEBE_ID, { positionSeconds: 1, ended: true });
      expect(await progressOf(TALEBE_ID)).toBe(67);

      await report(thirdId, TALEBE_ID, { positionSeconds: 30, ended: true });
      expect(await progressOf(TALEBE_ID)).toBe(100);

      // Another talebe's progress is their own.
      expect(await progressOf(OTHER_TALEBE_ID)).toBe(0);
    });

    it("leaves a hidden celse out of the share and of the list", async () => {
      await db()
        .update(lessons)
        .set({ archivedAt: new Date() })
        .where(eq(lessons.id, thirdId));
      await report(firstId, TALEBE_ID, { positionSeconds: 5, ended: true });
      expect(await progressOf(TALEBE_ID)).toBe(50);

      await db()
        .insert(lessonViews)
        .values({ userId: TALEBE_ID, lessonId: thirdId, positionSeconds: 3 });
      const listed = await list(courseId, TALEBE_ID).expect(200);
      expect(listed.body.map((v: { lessonId: string }) => v.lessonId)).toEqual([
        firstId,
      ]);
    });
  });

  describe("who keeps a record", () => {
    it("refuses everyone but an active talebe", async () => {
      for (const sub of [
        PENDING_ID,
        REVOKED_ID,
        BARRED_ID,
        STRANGER_ID,
        MUDERRIS_ID,
        ADMIN_ID,
      ]) {
        const res = await report(firstId, sub, { positionSeconds: 10 });
        expect([sub, res.status, res.body.code]).toEqual([
          sub,
          403,
          "LESSON_VIEW_FORBIDDEN",
        ]);
      }
      expect(await db().select().from(lessonViews)).toEqual([]);
    });

    it("answers a celse that is not there as not found", async () => {
      await report(ABSENT_ID, TALEBE_ID, { positionSeconds: 1 }).expect(404);
      await list(ABSENT_ID, TALEBE_ID).expect(404);
    });

    it("gives nobody another talebe's records", async () => {
      await report(firstId, TALEBE_ID, { positionSeconds: 754 }).expect(200);
      for (const sub of [OTHER_TALEBE_ID, MUDERRIS_ID, ADMIN_ID]) {
        const res = await list(courseId, sub).expect(200);
        expect(res.body).toEqual([]);
      }
    });

    it("keeps a record per course: another course's celse is not listed", async () => {
      await db()
        .insert(enrollments)
        .values({
          userId: TALEBE_ID,
          courseId: (
            await db()
              .select({ courseId: courseWeeks.courseId })
              .from(lessons)
              .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
              .where(eq(lessons.id, foreignLessonId))
          )[0].courseId,
          status: EnrollmentStatus.ENROLLED,
        });
      await report(foreignLessonId, TALEBE_ID, {
        positionSeconds: 5,
      }).expect(200);
      const listed = await list(courseId, TALEBE_ID).expect(200);
      expect(listed.body).toEqual([]);
    });
  });
});
