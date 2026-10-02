import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courseResources,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import {
  koskFollowers,
  koskManagers,
  kosks,
} from "../../src/database/schema/kosk.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-124 acceptance: nobody who runs things deletes — they hide, and only
 * SYSTEM_ADMIN deletes for real.
 *
 * Built with `createTestApp()` and no `authUserId`, so the REAL AuthGuard
 * verifies minted tokens: the SYSTEM_ADMIN bypass hinges on the
 * `realm_access` claim, which the stubbed guard never sets.
 */
const ADMIN_ID = "d0000000-0000-4000-8000-000000000001";
const MANAGER_ID = "d0000000-0000-4000-8000-000000000002";
const TALEBE_ID = "d0000000-0000-4000-8000-000000000003";
const MUDERRIS_ID = "d0000000-0000-4000-8000-000000000004";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Hide instead of delete (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let courseId: string;
  let weekId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "audit_log", "users");
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Süleymaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    // Managing is `kosk_managers` since MDRS-126, which `POST /kosks` fills
    // and a direct insert does not.
    await db()
      .insert(koskManagers)
      .values({ koskId, userId: MANAGER_ID, addedBy: MANAGER_ID });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: MANAGER_ID,
        title: "Usûl-i Fıkıh",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Giriş" })
      .returning();
    weekId = week.id;
    await db()
      .insert(lessons)
      .values([
        { weekId, title: "Fıkıh nedir", type: LessonType.VIDEO },
        { weekId, title: "Usûl nedir", type: LessonType.VIDEO },
      ]);
    await db()
      .insert(courseMuderris)
      .values({ courseId, userId: MUDERRIS_ID, name: "Musa Müderris" });
    await db()
      .insert(courseResources)
      .values({ courseId, name: "Metin", type: "pdf" });
    await db().insert(enrollments).values({ userId: TALEBE_ID, courseId });
    await db().insert(koskFollowers).values({ userId: TALEBE_ID, koskId });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "audit_log", "users");
    await app.close();
  });

  const courseIdsIn = (res: request.Response) =>
    (res.body as { id: string }[]).map((c) => c.id);

  describe("DELETE is SYSTEM_ADMIN's alone", () => {
    it("answers 403 to the köşk manager on DELETE /kosks/:id and DELETE /courses/:id", async () => {
      await http()
        .delete(`/kosks/${koskId}`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(403);
      await http()
        .delete(`/courses/${courseId}`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(403);

      const [course] = await db()
        .select()
        .from(courses)
        .where(eq(courses.id, courseId));
      expect(course).toBeDefined();
      const [kosk] = await db()
        .select()
        .from(kosks)
        .where(eq(kosks.id, koskId));
      expect(kosk).toBeDefined();
    });

    it("answers 403 to the müderris on DELETE /courses/:id", async () => {
      await http()
        .delete(`/courses/${courseId}`)
        .set("Authorization", auth(MUDERRIS_ID))
        .expect(403);
    });

    it("answers 404 to the admin for a course that does not exist", async () => {
      await http()
        .delete("/courses/00000000-0000-4000-8000-000000000000")
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
    });
  });

  describe("hiding and restoring a course", () => {
    it("lets the köşk manager hide their course: 404 for talebe and in no list, until restored", async () => {
      const hidden = await http()
        .post(`/courses/${courseId}/archive`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      expect(hidden.body.archivedAt).not.toBeNull();
      expect(hidden.body.archivedBy).toBe(MANAGER_ID);

      // Nothing was deleted.
      const kept = await db()
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.weekId, weekId));
      expect(kept).toHaveLength(2);

      // The talebe: 404 on the course, and it is in none of their lists.
      await http()
        .get(`/courses/${courseId}`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(404);
      await http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(404);
      const list = await http()
        .get(`/kosks/${koskId}/courses`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(courseIdsIn(list)).not.toContain(courseId);
      const enrolled = await http()
        .get("/courses/enrolled")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(courseIdsIn(enrolled)).not.toContain(courseId);
      const kosk = await http()
        .get(`/kosks/${koskId}`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(kosk.body.courseCount).toBe(0);
      expect(kosk.body.studentCount).toBe(0);
      const kosksList = await http()
        .get("/kosks")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(kosksList.body.items[0].courseCount).toBe(0);

      // The müderris of a hidden course does not see it in GET /me either.
      const me = await http()
        .get("/me")
        .set("Authorization", auth(MUDERRIS_ID))
        .expect(200);
      expect(me.body.roles.teaches).toEqual([]);

      // The manager still sees it — in the Arşiv view, not the normal list.
      await http()
        .get(`/courses/${courseId}`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      const managerList = await http()
        .get(`/kosks/${koskId}/courses`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      expect(courseIdsIn(managerList)).not.toContain(courseId);
      const archive = await http()
        .get(`/kosks/${koskId}/courses?archived=true`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      expect(courseIdsIn(archive)).toEqual([courseId]);

      // Restore: back for everyone, enrollment intact.
      const restored = await http()
        .post(`/courses/${courseId}/restore`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      expect(restored.body.archivedAt).toBeNull();
      await http()
        .get(`/courses/${courseId}`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      const enrolledAgain = await http()
        .get("/courses/enrolled")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(courseIdsIn(enrolledAgain)).toEqual([courseId]);
    });

    it("does not let a talebe or the müderris hide, restore or open the Arşiv", async () => {
      for (const who of [TALEBE_ID, MUDERRIS_ID]) {
        await http()
          .post(`/courses/${courseId}/archive`)
          .set("Authorization", auth(who))
          .expect(403);
        await http()
          .post(`/courses/${courseId}/restore`)
          .set("Authorization", auth(who))
          .expect(403);
        await http()
          .get(`/kosks/${koskId}/courses?archived=true`)
          .set("Authorization", auth(who))
          .expect(403);
      }
    });

    it("lets SYSTEM_ADMIN see a hidden course; hiding it again changes nothing", async () => {
      const first = await http()
        .post(`/courses/${courseId}/archive`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      const again = await http()
        .post(`/courses/${courseId}/archive`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(again.body.archivedBy).toBe(MANAGER_ID);
      expect(again.body.archivedAt).toBe(first.body.archivedAt);
      expect(again.body.version).toBe(first.body.version);
      await http()
        .get(`/courses/${courseId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      const archive = await http()
        .get(`/kosks/${koskId}/courses?archived=true`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(courseIdsIn(archive)).toEqual([courseId]);
    });
  });

  describe("ON DELETE RESTRICT", () => {
    it("refuses a raw SQL DELETE of a course that still has children", async () => {
      // Drizzle may wrap the driver error; the details are on it or its cause.
      type PgError = { code?: string; constraint?: string };
      const error = await db()
        .execute(`DELETE FROM courses WHERE id = '${courseId}'`)
        .then(
          () => null,
          (e: PgError & { cause?: PgError }) => e.cause ?? e
        );
      // Postgres reports a RESTRICT refusal as foreign_key_violation (23503);
      // the constraint it names is one of the six MDRS-124 moved to RESTRICT.
      expect(error?.code).toBe("23503");
      const { rows } = await db().execute(
        `SELECT confdeltype FROM pg_constraint WHERE conname = '${error?.constraint}'`
      );
      expect(rows).toEqual([{ confdeltype: "r" }]);

      const [course] = await db()
        .select()
        .from(courses)
        .where(eq(courses.id, courseId));
      expect(course).toBeDefined();
    });
  });

  describe("SYSTEM_ADMIN's delete", () => {
    it("removes the course and its children and records an audit entry", async () => {
      await http()
        .delete(`/courses/${courseId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);

      expect(
        await db().select().from(courses).where(eq(courses.id, courseId))
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(courseWeeks)
          .where(eq(courseWeeks.courseId, courseId))
      ).toHaveLength(0);
      expect(
        await db().select().from(lessons).where(eq(lessons.weekId, weekId))
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(enrollments)
          .where(eq(enrollments.courseId, courseId))
      ).toHaveLength(0);

      const entries = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, courseId));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorId: ADMIN_ID,
        action: "course.delete",
        entity: "course",
        details: {
          title: "Usûl-i Fıkıh",
          koskId,
          removed: {
            courses: 1,
            weeks: 1,
            lessons: 2,
            muderris: 1,
            resources: 1,
            enrollments: 1,
          },
        },
      });

      // The köşk is untouched.
      expect(
        await db().select().from(kosks).where(eq(kosks.id, koskId))
      ).toHaveLength(1);
    });

    it("removes a köşk with every course under it, hidden ones included, and records an audit entry", async () => {
      const [second] = await db()
        .insert(courses)
        .values({
          koskId,
          authorId: MANAGER_ID,
          title: "Gizli Kurs",
          archivedAt: new Date(),
          archivedBy: MANAGER_ID,
        })
        .returning();

      await http()
        .delete(`/kosks/${koskId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);

      expect(
        await db().select().from(kosks).where(eq(kosks.id, koskId))
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(courses)
          .where(inArray(courses.id, [courseId, second.id]))
      ).toHaveLength(0);

      const [entry] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, koskId));
      expect(entry).toMatchObject({
        actorId: ADMIN_ID,
        action: "kosk.delete",
        details: {
          name: "Süleymaniye Köşkü",
          removed: { courses: 2, lessons: 2, enrollments: 1, followers: 1 },
        },
      });
    });
  });
});
