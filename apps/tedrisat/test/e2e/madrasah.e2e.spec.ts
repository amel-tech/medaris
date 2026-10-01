import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
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
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { MadrasahNotFoundError } from "../../src/madrasah/errors/madrasah-not-found.error";
import { MadrasahRepository } from "../../src/madrasah/madrasah.repository";
import { MadrasahService } from "../../src/madrasah/madrasah.service";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-106, reshaped by MDRS-134. Built with `createTestApp()` and no
 * `authUserId`, so the REAL AuthGuard verifies a minted token: the stubbed
 * guard only ever sets `sub`, and creating a medrese hinges on the
 * `realm_access` claim, which is what `AuthzService` reads for the
 * SYSTEM_ADMIN bypass.
 *
 * The API still says "nazır"; since MDRS-134 that is a MEDRESE_BASMUDERRIS
 * row in `role_assignments` (MDRS-144 renames the API).
 */
const ADMIN_ID = "b0000000-0000-4000-8000-000000000001";
const NAZIR_ID = "b0000000-0000-4000-8000-000000000002";
const STRANGER_ID = "b0000000-0000-4000-8000-000000000003";
const MANAGER_ID = "b0000000-0000-4000-8000-000000000004";
const OTHER_NAZIR_ID = "b0000000-0000-4000-8000-000000000005";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Madrasahs (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let koskId: string;
  let courseId: string;
  let weekId: string;
  let lessonId: string;

  const http = () => request(app.getHttpServer());

  const koskRow = async (id: string) =>
    (await databaseService.db.select().from(kosks).where(eq(kosks.id, id)))[0];

  const nazirRows = () =>
    databaseService.db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.scopeId, madrasahId),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS)
        )
      )
      .orderBy(roleAssignments.createdAt, roleAssignments.id);

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    const [madrasah] = await databaseService.db
      .insert(madrasahs)
      .values({
        handle: "hadis-ve-siyer",
        name: "Hadis ve Siyer Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    await assignRole(databaseService.db, {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN_ID,
    });

    const [kosk] = await databaseService.db
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Hadis Köşkü" })
      .returning();
    koskId = kosk.id;
    // Managing is a KOSK_NAZIM role since MDRS-134, which `POST /kosks`
    // grants and a direct insert does not.
    await assignRole(databaseService.db, {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    const [course] = await databaseService.db
      .insert(courses)
      .values({ koskId, authorId: MANAGER_ID, title: "Usûl-i Hadis" })
      .returning();
    courseId = course.id;
    const [week] = await databaseService.db
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Giriş" })
      .returning();
    weekId = week.id;
    const [lesson] = await databaseService.db
      .insert(lessons)
      .values({ weekId, title: "Hadis nedir", type: LessonType.VIDEO })
      .returning();
    lessonId = lesson.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    await app.close();
  });

  describe("creating a medrese — SYSTEM_ADMIN only", () => {
    const body = { handle: "amel-tech", name: "Amel Tech Medresesi" };

    it("lets SYSTEM_ADMIN create one, with no nazırs yet", async () => {
      const res = await http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send(body)
        .expect(201);
      expect(res.body).toMatchObject({
        handle: "amel-tech",
        name: "Amel Tech Medresesi",
        createdBy: ADMIN_ID,
        nazirIds: [],
      });
    });

    it.each([
      ["a nazır of another medrese", NAZIR_ID],
      ["a köşk manager", MANAGER_ID],
      ["a stranger", STRANGER_ID],
    ])("refuses %s with 403", async (_who, sub) => {
      await http()
        .post("/madrasahs")
        .set("Authorization", auth(sub))
        .send(body)
        .expect(403);
      const rows = await databaseService.db
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.handle, "amel-tech"));
      expect(rows).toHaveLength(0);
    });

    it("answers a taken handle with 409", async () => {
      const res = await http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ handle: "hadis-ve-siyer", name: "İkinci" })
        .expect(409);
      expect(res.body.code).toBe("MADRASAH_HANDLE_TAKEN");
    });

    it("rejects a handle that is not a lower-case slug", () =>
      http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ handle: "Amel Tech", name: "Amel Tech Medresesi" })
        .expect(400));
  });

  describe("reading — anyone signed in", () => {
    it("lists and shows a medrese to a stranger", async () => {
      const list = await http()
        .get("/madrasahs")
        .set("Authorization", auth(STRANGER_ID))
        .expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toMatchObject({
        id: madrasahId,
        nazirIds: [NAZIR_ID],
      });

      await http()
        .get(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(200);
    });

    it("answers an unknown or malformed id with 404, not 403", async () => {
      await http()
        .get("/madrasahs/b0000000-0000-4000-8000-00000000ffff")
        .set("Authorization", auth(STRANGER_ID))
        .expect(404);
      await http()
        .patch("/madrasahs/not-a-uuid")
        .set("Authorization", auth(STRANGER_ID))
        .send({ name: "x" })
        .expect(404);
    });
  });

  describe("a nazır governs their medrese", () => {
    it("lets the nazır edit it; a non-nazır gets 403", async () => {
      await http()
        .patch(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(STRANGER_ID))
        .send({ name: "Ele geçirildi" })
        .expect(403);

      const res = await http()
        .patch(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(NAZIR_ID))
        .send({ name: "Hadis ve Siyer Araştırmaları Medresesi" })
        .expect(200);
      expect(res.body.name).toBe("Hadis ve Siyer Araştırmaları Medresesi");
    });

    it("lets the nazır invite and remove nazırs; a non-nazır gets 403", async () => {
      await http()
        .post(`/madrasahs/${madrasahId}/nazirs/${STRANGER_ID}`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(403);

      const invited = await http()
        .post(`/madrasahs/${madrasahId}/nazirs/${OTHER_NAZIR_ID}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(201);
      expect(invited.body.nazirIds).toEqual([NAZIR_ID, OTHER_NAZIR_ID]);

      // The invited nazır now governs too: they can edit.
      await http()
        .patch(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(OTHER_NAZIR_ID))
        .send({ coverHue: 30 })
        .expect(200);

      const removed = await http()
        .delete(`/madrasahs/${madrasahId}/nazirs/${OTHER_NAZIR_ID}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(200);
      expect(removed.body.nazirIds).toEqual([NAZIR_ID]);

      await http()
        .delete(`/madrasahs/${madrasahId}/nazirs/${OTHER_NAZIR_ID}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(404);

      // MDRS-134: the grant and the revocation are both on record, in the
      // name of the nazır who made them.
      const rows = await nazirRows();
      expect(rows.map((r) => [r.userId, r.grantedBy, r.revokedBy])).toEqual([
        [NAZIR_ID, ADMIN_ID, null],
        [OTHER_NAZIR_ID, NAZIR_ID, NAZIR_ID],
      ]);
    });

    it("does not let a nazır delete the medrese; SYSTEM_ADMIN can, and its courses stay in their köşks", async () => {
      await databaseService.db
        .update(courses)
        .set({ madrasahId })
        .where(eq(courses.id, courseId));
      await databaseService.db
        .insert(madrasahKoskHosting)
        .values({ madrasahId, koskId, grantedBy: ADMIN_ID });

      await http()
        .delete(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(403);

      await http()
        .delete(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);

      expect(await koskRow(koskId)).toBeDefined();
      const [course] = await databaseService.db
        .select()
        .from(courses)
        .where(eq(courses.id, courseId));
      expect(course.madrasahId).toBeNull();
      expect(await nazirRows()).toHaveLength(0);
      const hosting = await databaseService.db
        .select()
        .from(madrasahKoskHosting)
        .where(eq(madrasahKoskHosting.koskId, koskId));
      expect(hosting).toHaveLength(0);
    });

    it("answers 404 when SYSTEM_ADMIN deletes a medrese that does not exist, and removes no role row", async () => {
      const missing = "b0000000-0000-4000-8000-00000000ffff";
      await http()
        .delete(`/madrasahs/${missing}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      // The route's resolver answers first; the repository's own answer is
      // what a delete racing another delete gets.
      expect(await app.get(MadrasahRepository).delete(missing)).toBe(false);
      // Nor does a grant land in a medrese that is gone: the row is locked
      // and read first, so nothing is written.
      await expect(
        app.get(MadrasahService).addNazir(missing, STRANGER_ID, ADMIN_ID)
      ).rejects.toBeInstanceOf(MadrasahNotFoundError);
      const orphans = await databaseService.db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.scopeId, missing));
      expect(orphans).toEqual([]);
      expect(await nazirRows()).toHaveLength(1);
    });
  });

  // MDRS-134 replaced MDRS-106's köşk affiliation with a hosting right,
  // which gives the medrese no power over the köşk (MDRS-133).
  describe("a nazır of a medrese hosted in a köşk", () => {
    beforeEach(async () => {
      await databaseService.db
        .insert(madrasahKoskHosting)
        .values({ madrasahId, koskId, grantedBy: ADMIN_ID });
    });

    it("gets no EDIT on the köşk", async () => {
      await http()
        .patch(`/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .send({ name: "Ele geçirildi" })
        .expect(403);
      expect((await koskRow(koskId)).name).toBe("Hadis Köşkü");
    });

    it("gets nothing on its courses' content", async () => {
      await http()
        .patch(`/courses/${courseId}`)
        .set("Authorization", auth(NAZIR_ID))
        .send({ title: "Ele geçirildi" })
        .expect(403);
      await http()
        .post(`/courses/${courseId}/weeks/${weekId}/lessons`)
        .set("Authorization", auth(NAZIR_ID))
        .send({ title: "Yeni ders", type: LessonType.VIDEO })
        .expect(403);
      await http()
        .patch(`/lessons/${lessonId}`)
        .set("Authorization", auth(NAZIR_ID))
        .send({ title: "Ele geçirildi", version: 1 })
        .expect(403);
      await http()
        .delete(`/lessons/${lessonId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(403);

      const [course] = await databaseService.db
        .select()
        .from(courses)
        .where(eq(courses.id, courseId));
      expect(course.title).toBe("Usûl-i Hadis");
    });

    it("does not get DELETE on the köşk", async () => {
      await http()
        .delete(`/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(403);
      expect(await koskRow(koskId)).toBeDefined();
    });

    it("leaves the köşk manager's own EDIT alone", () =>
      http()
        .patch(`/kosks/${koskId}`)
        .set("Authorization", auth(MANAGER_ID))
        .send({ name: "Yöneticinin adı" })
        .expect(200));

    it("no longer offers the affiliation routes, and köşk reads carry no medrese", async () => {
      await http()
        .post(`/madrasahs/${madrasahId}/kosks/${koskId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      await http()
        .delete(`/kosks/${koskId}/madrasah`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      const shown = await http()
        .get(`/kosks/${koskId}`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(200);
      expect(shown.body).not.toHaveProperty("madrasah");
      expect(shown.body).not.toHaveProperty("madrasahId");
    });
  });

  // MDRS-134 §7: a medrese's talebe are derived from enrollments in its
  // courses, never stored.
  describe("a medrese's talebe", () => {
    const ENROLLED = "b0000000-0000-4000-8000-0000000000e1";
    const COMPLETED = "b0000000-0000-4000-8000-0000000000e2";
    const PENDING = "b0000000-0000-4000-8000-0000000000e3";
    const ELSEWHERE = "b0000000-0000-4000-8000-0000000000e4";

    it("are everyone ENROLLED or COMPLETED in one of its courses", async () => {
      await databaseService.db
        .update(courses)
        .set({ madrasahId })
        .where(eq(courses.id, courseId));
      const [second] = await databaseService.db
        .insert(courses)
        .values({ koskId, authorId: MANAGER_ID, title: "Siyer", madrasahId })
        .returning();
      const [plain] = await databaseService.db
        .insert(courses)
        .values({ koskId, authorId: MANAGER_ID, title: "Köşk dersi" })
        .returning();
      await databaseService.db.insert(enrollments).values([
        { userId: ENROLLED, courseId, status: EnrollmentStatus.ENROLLED },
        // Enrolled in both medrese courses: counted once.
        {
          userId: ENROLLED,
          courseId: second.id,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: COMPLETED,
          courseId: second.id,
          status: EnrollmentStatus.COMPLETED,
        },
        { userId: PENDING, courseId, status: EnrollmentStatus.PENDING },
        {
          userId: ELSEWHERE,
          courseId: plain.id,
          status: EnrollmentStatus.ENROLLED,
        },
      ]);

      const repo = app.get(MadrasahRepository);
      expect(await repo.findTalebeIds(madrasahId)).toEqual([
        ENROLLED,
        COMPLETED,
      ]);
    });
  });
});
