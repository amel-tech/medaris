import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
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
import { users } from "../../src/database/schema/user.schema";
import { MadrasahNotFoundError } from "../../src/madrasah/errors/madrasah-not-found.error";
import { MadrasahRepository } from "../../src/madrasah/madrasah.repository";
import { MadrasahNazirService } from "../../src/madrasah/nazir/madrasah-nazir.service";
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
 * A medrese's `nazirIds` are MEDRESE_BASMUDERRIS rows in `role_assignments`
 * since MDRS-134 (MDRS-144 renames the field). The medrese nazırs proper,
 * `/madrasahs/:id/nazirs`, are madrasah-nazir.e2e.spec.ts's.
 */
const ADMIN_ID = "b0000000-0000-4000-8000-000000000001";
const NAZIR_ID = "b0000000-0000-4000-8000-000000000002";
const STRANGER_ID = "b0000000-0000-4000-8000-000000000003";
const MANAGER_ID = "b0000000-0000-4000-8000-000000000004";

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
    const body = {
      handle: "amel-tech",
      name: "Amel Tech Medresesi",
      headMuderrisUserId: STRANGER_ID,
    };

    it("lets SYSTEM_ADMIN create one, headed by the person it names", async () => {
      const res = await http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send(body)
        .expect(201);
      expect(res.body).toMatchObject({
        handle: "amel-tech",
        name: "Amel Tech Medresesi",
        createdBy: ADMIN_ID,
        nazirIds: [STRANGER_ID],
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
        .send({
          handle: "hadis-ve-siyer",
          name: "İkinci",
          headMuderrisUserId: STRANGER_ID,
        })
        .expect(409);
      expect(res.body.code).toBe("MADRASAH_HANDLE_TAKEN");
    });

    it("rejects a handle that is not a lower-case slug", () =>
      http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ ...body, handle: "Amel Tech" })
        .expect(400));

    it("rejects a medrese opened with no başmüderris", () =>
      http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ handle: "amel-tech", name: "Amel Tech Medresesi" })
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
        app
          .get(MadrasahNazirService)
          .appoint(missing, STRANGER_ID, ADMIN_ID, "platform")
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
  describe("the medrese page's overview (MDRS-157)", () => {
    const TALEBE_ID = "b0000000-0000-4000-8000-000000000011";
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const later = new Date(Date.now() + 9 * 24 * 3600 * 1000);
    let unlistedKoskId: string;

    beforeEach(async () => {
      const db = databaseService.db;
      await db
        .update(courses)
        .set({ madrasahId, status: CourseStatus.PUBLISHED })
        .where(eq(courses.id, courseId));
      await db.insert(users).values({
        id: NAZIR_ID,
        givenName: "Mehmet Emin",
        familyName: "Işıkoğlu",
      });
      await db.insert(courseMuderris).values({
        courseId,
        userId: NAZIR_ID,
        name: "Mehmet Emin Işıkoğlu",
        title: "Dr.",
      });
      await assignRole(db, {
        userId: NAZIR_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: courseId,
        grantedBy: ADMIN_ID,
        isImam: true,
      });
      await db
        .update(lessons)
        .set({
          type: LessonType.LIVE,
          scheduledAt: later,
          meetingUrl: "https://meet.example/secret",
        })
        .where(eq(lessons.id, lessonId));
      await db.insert(lessons).values({
        weekId,
        title: "Yaklaşan",
        type: LessonType.LIVE,
        scheduledAt: future,
      });
      await db.insert(lessons).values({
        weekId,
        title: "Geçmiş",
        type: LessonType.LIVE,
        scheduledAt: new Date(Date.now() - 24 * 3600 * 1000),
      });
      const [unlisted] = await db
        .insert(kosks)
        .values({ ownerId: MANAGER_ID, name: "Gizli Köşk", isPrivate: true })
        .returning();
      unlistedKoskId = unlisted.id;
      await db.insert(courses).values({
        koskId: unlistedKoskId,
        authorId: MANAGER_ID,
        title: "Gizli ders",
        madrasahId,
        status: CourseStatus.PUBLISHED,
      });
      await db.insert(courses).values({
        koskId,
        authorId: MANAGER_ID,
        title: "Taslak ders",
        madrasahId,
      });
    });

    it("answers a caller with no token: courses, next session, head müderris, no enrollment, no meeting link", async () => {
      const res = await http()
        .get(`/madrasahs/${madrasahId}/overview`)
        .expect(200);
      expect(res.body.courses).toHaveLength(1);
      expect(res.body.courses[0]).toMatchObject({
        id: courseId,
        title: "Usûl-i Hadis",
        koskId,
        koskName: "Hadis Köşkü",
        enrollmentStatus: null,
        muderris: [
          { name: "Mehmet Emin Işıkoğlu", title: "Dr.", isImam: true },
        ],
      });
      expect(new Date(res.body.courses[0].nextSessionAt).getTime()).toBe(
        future.getTime()
      );
      expect(JSON.stringify(res.body)).not.toContain("meet.example");
      expect(res.body.kosks).toEqual([{ id: koskId, name: "Hadis Köşkü" }]);
      expect(res.body.headMuderris).toEqual({
        id: NAZIR_ID,
        name: "Mehmet Emin Işıkoğlu",
        courseCount: 1,
      });
    });

    it("carries the caller's own enrollment state", async () => {
      await databaseService.db.insert(enrollments).values({
        userId: TALEBE_ID,
        courseId,
        status: EnrollmentStatus.PENDING,
      });
      const mine = await http()
        .get(`/madrasahs/${madrasahId}/overview`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(mine.body.courses[0].enrollmentStatus).toBe("PENDING");
      const other = await http()
        .get(`/madrasahs/${madrasahId}/overview`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(200);
      expect(other.body.courses[0].enrollmentStatus).toBeNull();
    });

    it("answers 404 for an unknown or malformed id and an empty list for a medrese with no courses", async () => {
      await http()
        .get("/madrasahs/b0000000-0000-4000-8000-00000000ffff/overview")
        .expect(404);
      await http().get("/madrasahs/not-a-uuid/overview").expect(404);
      await databaseService.db
        .update(courses)
        .set({ madrasahId: null })
        .where(eq(courses.madrasahId, madrasahId));
      const res = await http()
        .get(`/madrasahs/${madrasahId}/overview`)
        .expect(200);
      expect(res.body.courses).toEqual([]);
      expect(res.body.kosks).toEqual([]);
      expect(res.body.headMuderris.courseCount).toBe(0);
    });
  });
});
