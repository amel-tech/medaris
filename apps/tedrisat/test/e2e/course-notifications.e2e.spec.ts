import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-213: the course team's actions reach the talebe as notifications.
 *
 * In the dev test of 2026-10-03 a köşk nazımı approved an enrolment in nizam
 * and the talebe was told nothing: no module produced the course types of
 * MDRS-167. Each case here makes the change through the real route, as nizam
 * does, and reads what was written — the row in the table, and once the
 * talebe's own `GET /notifications`.
 *
 * Bans (COURSE_ACCESS_REMOVED) are covered in `ban.e2e.spec.ts`, beside the
 * nazım's own notification of the same ban.
 */
const MANAGER_ID = "f2130000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "f2130000-0000-4000-8000-000000000002";
const TALEBE_ID = "f2130000-0000-4000-8000-000000000003";
const SECOND_TALEBE_ID = "f2130000-0000-4000-8000-000000000004";
const PENDING_ID = "f2130000-0000-4000-8000-000000000005";
const COMPLETED_ID = "f2130000-0000-4000-8000-000000000006";

const auth = (sub: string) => bearerFor({ sub });
const HOUR = 3_600_000;

describe("Course notifications (MDRS-213, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let courseId: string;
  let sessionId: string;
  let sessionAt: Date;

  const TABLES = [...COURSE_TREE_TABLES, "audit_log", "notifications", "users"];
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) => ({
    get: (url: string) => http().get(url).set("Authorization", auth(sub)),
    post: (url: string) => http().post(url).set("Authorization", auth(sub)),
    patch: (url: string) => http().patch(url).set("Authorization", auth(sub)),
    delete: (url: string) => http().delete(url).set("Authorization", auth(sub)),
  });
  const toldTo = (userId: string) =>
    db().select().from(notifications).where(eq(notifications.userId, userId));
  const courseVersion = async (): Promise<number> => {
    const [row] = await db()
      .select({ version: courses.version })
      .from(courses)
      .where(eq(courses.id, courseId));
    return row.version;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db()
      .insert(users)
      .values(
        [
          MANAGER_ID,
          MUDERRIS_ID,
          TALEBE_ID,
          SECOND_TALEBE_ID,
          PENDING_ID,
          COMPLETED_ID,
        ].map((id) => ({ id }))
      );
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Beyazıt Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
      grantedBy: MANAGER_ID,
    });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId: kosk.id,
        authorId: MANAGER_ID,
        title: "Siyer okumaları",
        status: CourseStatus.PUBLISHED,
        requiresApproval: true,
      })
      .returning();
    courseId = course.id;
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Birinci hafta" })
      .returning();
    sessionAt = new Date(Math.ceil((Date.now() + 48 * HOUR) / 60_000) * 60_000);
    const [session] = await db()
      .insert(lessons)
      .values({
        weekId: week.id,
        title: "Mekke yılları",
        type: LessonType.LIVE,
        durationMinutes: 60,
        scheduledAt: sessionAt,
      })
      .returning();
    sessionId = session.id;
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId, status: EnrollmentStatus.ENROLLED },
        {
          userId: SECOND_TALEBE_ID,
          courseId,
          status: EnrollmentStatus.ENROLLED,
        },
        { userId: PENDING_ID, courseId, status: EnrollmentStatus.PENDING },
        { userId: COMPLETED_ID, courseId, status: EnrollmentStatus.COMPLETED },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("enrolment", () => {
    it("tells the talebe their request was approved, and they read it from their own list", async () => {
      await as(MANAGER_ID)
        .post(`/courses/${courseId}/enrollments/${PENDING_ID}/approve`)
        .expect(201);

      const rows = await toldTo(PENDING_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: "ENROLLMENT_APPROVED",
        targetType: "COURSE",
        targetId: courseId,
        readAt: null,
        params: { courseTitle: "Siyer okumaları", source: "Beyazıt Köşkü" },
      });
      expect(await toldTo(MANAGER_ID)).toHaveLength(0);

      const list = await as(PENDING_ID).get("/notifications").expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          type: "ENROLLMENT_APPROVED",
          targetType: "COURSE",
          targetId: courseId,
        }),
      ]);
    });

    it("says nothing when an active seat is approved again", async () => {
      await as(MANAGER_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/approve`)
        .expect(201);
      expect(await toldTo(TALEBE_ID)).toHaveLength(0);
    });

    it("tells the talebe their request was rejected, with the reason the team wrote", async () => {
      await as(MUDERRIS_ID)
        .delete(`/courses/${courseId}/enrollments/${PENDING_ID}`)
        .send({ reason: "  Kontenjan doldu  " })
        .expect(200);

      const [row] = await toldTo(PENDING_ID);
      expect(row).toMatchObject({
        type: "ENROLLMENT_REJECTED",
        targetType: "COURSE",
        targetId: courseId,
        params: {
          courseTitle: "Siyer okumaları",
          source: "Beyazıt Köşkü",
          reason: "Kontenjan doldu",
        },
      });
    });

    it("leaves the reason out of a rejection that has none", async () => {
      await as(MUDERRIS_ID)
        .delete(`/courses/${courseId}/enrollments/${PENDING_ID}`)
        .expect(200);
      const [row] = await toldTo(PENDING_ID);
      expect(row.type).toBe("ENROLLMENT_REJECTED");
      expect(row.params).not.toHaveProperty("reason");
    });

    it("tells the talebe they were removed from the course, with the reason", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
        .send({ reason: "Celselere katılmadı." })
        .expect(200);

      const [row] = await toldTo(TALEBE_ID);
      expect(row).toMatchObject({
        type: "REMOVED_FROM_COURSE",
        targetType: "COURSE",
        targetId: courseId,
        params: {
          courseTitle: "Siyer okumaları",
          reason: "Celselere katılmadı.",
        },
      });
    });

    it("tells a removed talebe their seat was given back when it is approved again", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
        .send({ reason: "Yanlışlıkla." })
        .expect(200);
      await as(MANAGER_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/approve`)
        .expect(201);
      const types = (await toldTo(TALEBE_ID)).map((n) => n.type).sort();
      expect(types).toEqual(["ENROLLMENT_APPROVED", "REMOVED_FROM_COURSE"]);
    });
  });

  describe("sessions", () => {
    it("tells every active seat of a cancelled session, and nobody else", async () => {
      await as(MUDERRIS_ID)
        .post(`/lessons/${sessionId}/cancel`)
        .send({ version: await courseVersion(), reason: "Müderris hasta" })
        .expect(200);

      for (const userId of [TALEBE_ID, SECOND_TALEBE_ID]) {
        const rows = await toldTo(userId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          type: "SESSION_CANCELLED",
          targetType: "SESSION",
          targetId: sessionId,
          params: {
            courseId,
            courseTitle: "Siyer okumaları",
            source: "Beyazıt Köşkü",
            sessionAt: sessionAt.toISOString(),
          },
        });
      }
      for (const userId of [PENDING_ID, COMPLETED_ID, MUDERRIS_ID]) {
        expect(await toldTo(userId)).toHaveLength(0);
      }
    });

    it("does not tell of a session cancelled after it was over", async () => {
      await db()
        .update(lessons)
        .set({ scheduledAt: new Date(Date.now() - 5 * HOUR) })
        .where(eq(lessons.id, sessionId));
      await as(MUDERRIS_ID)
        .post(`/lessons/${sessionId}/cancel`)
        .send({ version: await courseVersion() })
        .expect(200);
      expect(await db().select().from(notifications)).toHaveLength(0);
    });

    it("tells every active seat of a session moved to another time, with both times", async () => {
      const movedTo = new Date(sessionAt.getTime() + 24 * HOUR);
      await as(MUDERRIS_ID)
        .patch(`/lessons/${sessionId}`)
        .send({ version: await courseVersion(), scheduledAt: movedTo })
        .expect(200);

      const rows = await db().select().from(notifications);
      expect(rows.map((n) => n.userId).sort()).toEqual(
        [TALEBE_ID, SECOND_TALEBE_ID].sort()
      );
      expect(rows[0]).toMatchObject({
        type: "SESSION_RESCHEDULED",
        targetType: "SESSION",
        targetId: sessionId,
        params: {
          courseId,
          courseTitle: "Siyer okumaları",
          sessionAt: movedTo.toISOString(),
          previousAt: sessionAt.toISOString(),
        },
      });
    });

    it("says nothing for an edit that leaves the time where it was", async () => {
      await as(MUDERRIS_ID)
        .patch(`/lessons/${sessionId}`)
        .send({
          version: await courseVersion(),
          meetingUrl: "https://meet.example.org/siyer",
        })
        .expect(200);
      await as(MUDERRIS_ID)
        .patch(`/lessons/${sessionId}`)
        .send({ version: await courseVersion(), scheduledAt: sessionAt })
        .expect(200);
      expect(await db().select().from(notifications)).toHaveLength(0);
    });

    it("says nothing when a session is given its first time", async () => {
      await db()
        .update(lessons)
        .set({ scheduledAt: null })
        .where(eq(lessons.id, sessionId));
      await as(MUDERRIS_ID)
        .patch(`/lessons/${sessionId}`)
        .send({ version: await courseVersion(), scheduledAt: sessionAt })
        .expect(200);
      expect(await db().select().from(notifications)).toHaveLength(0);
    });
  });
});
