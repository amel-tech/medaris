import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  lessons,
} from "../../src/database/schema/course.schema";
import { koskManagers, kosks } from "../../src/database/schema/kosk.schema";
import {
  madrasahNazirs,
  madrasahs,
} from "../../src/database/schema/madrasah.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-106. Built with `createTestApp()` and no `authUserId`, so the REAL
 * AuthGuard verifies a minted token: the stubbed guard only ever sets `sub`,
 * and creating a medrese hinges on the `realm_access` claim, which is what
 * `AuthzService` reads for the SYSTEM_ADMIN bypass.
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
    await databaseService.db
      .insert(madrasahNazirs)
      .values({ madrasahId, userId: NAZIR_ID });

    const [kosk] = await databaseService.db
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Hadis Köşkü" })
      .returning();
    koskId = kosk.id;
    // Managing is `kosk_managers` since MDRS-126, which `POST /kosks` fills
    // and a direct insert does not.
    await databaseService.db
      .insert(koskManagers)
      .values({ koskId, userId: MANAGER_ID, addedBy: MANAGER_ID });
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

    it("lets the nazır affiliate and detach a köşk; a non-nazır gets 403", async () => {
      await http()
        .post(`/madrasahs/${madrasahId}/kosks/${koskId}`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(403);
      // The köşk's own manager is not a nazır either.
      await http()
        .post(`/madrasahs/${madrasahId}/kosks/${koskId}`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(403);
      expect((await koskRow(koskId)).madrasahId).toBeNull();

      const affiliated = await http()
        .post(`/madrasahs/${madrasahId}/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(201);
      expect(affiliated.body.madrasah).toEqual({
        id: madrasahId,
        name: "Hadis ve Siyer Medresesi",
        handle: "hadis-ve-siyer",
      });

      // Köşk reads carry the medrese too.
      const shown = await http()
        .get(`/kosks/${koskId}`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(200);
      expect(shown.body.madrasah).toMatchObject({ id: madrasahId });

      await http()
        .delete(`/madrasahs/${madrasahId}/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(200);
      expect((await koskRow(koskId)).madrasahId).toBeNull();
    });

    it("refuses to take a köşk that belongs to another medrese (409)", async () => {
      const [other] = await databaseService.db
        .insert(madrasahs)
        .values({ handle: "diger", name: "Diğer", createdBy: ADMIN_ID })
        .returning();
      await databaseService.db
        .update(kosks)
        .set({ madrasahId: other.id })
        .where(eq(kosks.id, koskId));

      const res = await http()
        .post(`/madrasahs/${madrasahId}/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(409);
      expect(res.body.code).toBe("KOSK_ALREADY_AFFILIATED");
      await http()
        .delete(`/madrasahs/${madrasahId}/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(404);
      expect((await koskRow(koskId)).madrasahId).toBe(other.id);
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
    });

    it("does not let a nazır delete the medrese; SYSTEM_ADMIN can, and its köşks stand alone", async () => {
      await databaseService.db
        .update(kosks)
        .set({ madrasahId })
        .where(eq(kosks.id, koskId));

      await http()
        .delete(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(403);

      await http()
        .delete(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);

      const kosk = await koskRow(koskId);
      expect(kosk).toBeDefined();
      expect(kosk.madrasahId).toBeNull();
      const nazirs = await databaseService.db
        .select()
        .from(madrasahNazirs)
        .where(eq(madrasahNazirs.madrasahId, madrasahId));
      expect(nazirs).toHaveLength(0);
    });
  });

  describe("a nazır over an affiliated köşk", () => {
    beforeEach(async () => {
      await databaseService.db
        .update(kosks)
        .set({ madrasahId })
        .where(eq(kosks.id, koskId));
    });

    it("gets EDIT on the köşk", async () => {
      const res = await http()
        .patch(`/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .send({ name: "Hadis Köşkü (yeni)" })
        .expect(200);
      expect(res.body.name).toBe("Hadis Köşkü (yeni)");
    });

    it("gets no EDIT on a köşk outside their medrese", async () => {
      const [standalone] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: MANAGER_ID, name: "Bağımsız Köşk" })
        .returning();
      await http()
        .patch(`/kosks/${standalone.id}`)
        .set("Authorization", auth(NAZIR_ID))
        .send({ name: "Ele geçirildi" })
        .expect(403);
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

    it("still does not get DELETE on the köşk", async () => {
      await http()
        .delete(`/kosks/${koskId}`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(403);
      expect(await koskRow(koskId)).toBeDefined();
    });

    it("lets the köşk's own manager take it out of the medrese; a stranger gets 403", async () => {
      await http()
        .delete(`/kosks/${koskId}/madrasah`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(403);
      expect((await koskRow(koskId)).madrasahId).toBe(madrasahId);

      const res = await http()
        .delete(`/kosks/${koskId}/madrasah`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      expect(res.body.madrasah).toBeNull();
      expect((await koskRow(koskId)).madrasahId).toBeNull();

      const again = await http()
        .delete(`/kosks/${koskId}/madrasah`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(404);
      expect(again.body.code).toBe("KOSK_NOT_AFFILIATED");
    });

    it("leaves the köşk manager's own EDIT alone", () =>
      http()
        .patch(`/kosks/${koskId}`)
        .set("Authorization", auth(MANAGER_ID))
        .send({ name: "Yöneticinin adı" })
        .expect(200));
  });
});
