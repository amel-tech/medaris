import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { courses } from "../../src/database/schema/course.schema";
import { koskManagers, kosks } from "../../src/database/schema/kosk.schema";
import {
  madrasahNazirs,
  madrasahs,
} from "../../src/database/schema/madrasah.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-126: a köşk has managers, not an owner. Built with `createTestApp()`
 * and no `authUserId`, so the REAL AuthGuard verifies a minted token per
 * caller — the acceptance criteria need two managers acting in turn.
 */
const ADMIN_ID = "c0000000-0000-4000-8000-000000000001";
const FIRST_ID = "c0000000-0000-4000-8000-000000000002";
const SECOND_ID = "c0000000-0000-4000-8000-000000000003";
const NAZIR_ID = "c0000000-0000-4000-8000-000000000004";
const STRANGER_ID = "c0000000-0000-4000-8000-000000000005";
const UNKNOWN_ID = "c0000000-0000-4000-8000-000000000006";
const MISSING_UUID = "00000000-0000-4000-8000-000000000000";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Köşk managers (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  const http = () => request(app.getHttpServer());

  const addManager = (as: string, userId: string, id = koskId) =>
    http()
      .post(`/kosks/${id}/managers/${userId}`)
      .set("Authorization", auth(as));

  const removeManager = (as: string, userId: string, id = koskId) =>
    http()
      .delete(`/kosks/${id}/managers/${userId}`)
      .set("Authorization", auth(as));

  const rename = (as: string, name: string) =>
    http()
      .patch(`/kosks/${koskId}`)
      .set("Authorization", auth(as))
      .send({ name });

  const managersInDb = async () =>
    (
      await databaseService.db
        .select({ userId: koskManagers.userId })
        .from(koskManagers)
        .where(eq(koskManagers.koskId, koskId))
    )
      .map((r) => r.userId)
      .sort();

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    const res = await http()
      .post("/kosks")
      .set("Authorization", auth(FIRST_ID))
      .send({ name: "Süleymaniye Köşkü" })
      .expect(201);
    koskId = res.body.id;
    // Only someone who has signed in (a `users` row, MDRS-104) can be made a
    // manager; these are the people the tests add.
    await databaseService.db
      .insert(users)
      .values([SECOND_ID, NAZIR_ID, STRANGER_ID].map((id) => ({ id })))
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    await app.close();
  });

  it("makes the creator the köşk's first manager", async () => {
    const res = await http()
      .get(`/kosks/${koskId}`)
      .set("Authorization", auth(STRANGER_ID))
      .expect(200);
    expect(res.body).toMatchObject({
      ownerId: FIRST_ID,
      managerIds: [FIRST_ID],
    });
    expect(await managersInDb()).toEqual([FIRST_ID]);
  });

  describe("two managers of the same köşk can both manage it", () => {
    beforeEach(async () => {
      const res = await addManager(FIRST_ID, SECOND_ID).expect(201);
      expect(res.body.managerIds).toEqual([FIRST_ID, SECOND_ID]);
    });

    it.each([
      ["the first", FIRST_ID],
      ["the second", SECOND_ID],
    ])("lets %s edit the köşk", async (_who, sub) => {
      const res = await rename(sub, `Yeni ad ${sub}`).expect(200);
      expect(res.body.name).toBe(`Yeni ad ${sub}`);
    });

    it.each([
      ["the first", FIRST_ID],
      ["the second", SECOND_ID],
    ])("lets %s see pending enrollments and draft courses", async (_who, sub) => {
      await databaseService.db.insert(courses).values({
        koskId,
        authorId: FIRST_ID,
        title: "Taslak",
        status: CourseStatus.DRAFT,
      });
      await http()
        .get(`/kosks/${koskId}/enrollments/pending`)
        .set("Authorization", auth(sub))
        .expect(200);
      const list = await http()
        .get(`/kosks/${koskId}/courses`)
        .set("Authorization", auth(sub))
        .expect(200);
      expect(list.body.map((c: { title: string }) => c.title)).toEqual([
        "Taslak",
      ]);
    });

    it("reports the köşk under each manager's GET /me", async () => {
      for (const sub of [FIRST_ID, SECOND_ID]) {
        const res = await http()
          .get("/me")
          .set("Authorization", auth(sub))
          .expect(200);
        expect(res.body.roles.manages).toEqual([
          { id: koskId, name: "Süleymaniye Köşkü" },
        ]);
      }
    });

    it("lets the second manager add a third, and adding twice is a no-op", async () => {
      await addManager(SECOND_ID, STRANGER_ID).expect(201);
      const res = await addManager(SECOND_ID, STRANGER_ID).expect(201);
      expect(res.body.managerIds).toEqual([FIRST_ID, SECOND_ID, STRANGER_ID]);
    });
  });

  describe("removing one manager leaves the other in place", () => {
    beforeEach(async () => {
      await addManager(FIRST_ID, SECOND_ID).expect(201);
    });

    it("keeps the second manager when the first is removed", async () => {
      const res = await removeManager(SECOND_ID, FIRST_ID).expect(200);
      expect(res.body.managerIds).toEqual([SECOND_ID]);
      expect(await managersInDb()).toEqual([SECOND_ID]);

      await rename(SECOND_ID, "Hâlâ yönetiyor").expect(200);
      await rename(FIRST_ID, "Artık yönetmiyor").expect(403);
    });

    it("lets a manager remove themselves while another remains", async () => {
      const res = await removeManager(SECOND_ID, SECOND_ID).expect(200);
      expect(res.body.managerIds).toEqual([FIRST_ID]);
      await rename(FIRST_ID, "Yine tek").expect(200);
    });

    it("answers 404 for a user who is not a manager", async () => {
      const res = await removeManager(FIRST_ID, STRANGER_ID).expect(404);
      expect(res.body.code).toBe("KOSK_MANAGER_NOT_FOUND");
      expect(await managersInDb()).toEqual([FIRST_ID, SECOND_ID].sort());
    });
  });

  describe("the last manager cannot be removed", () => {
    it.each([
      ["by themselves", FIRST_ID],
      ["by SYSTEM_ADMIN", ADMIN_ID],
    ])("refuses %s with 409", async (_who, sub) => {
      const res = await removeManager(sub, FIRST_ID).expect(409);
      expect(res.body.code).toBe("KOSK_LAST_MANAGER");
      expect(await managersInDb()).toEqual([FIRST_ID]);
      await rename(FIRST_ID, "Hâlâ yönetici").expect(200);
    });

    it("keeps exactly one when the last two remove each other at once", async () => {
      await addManager(FIRST_ID, SECOND_ID).expect(201);
      const [a, b] = await Promise.all([
        removeManager(FIRST_ID, SECOND_ID),
        removeManager(SECOND_ID, FIRST_ID),
      ]);
      // Whichever removal went second finds no one else to leave in charge.
      // It is refused (409), or — if the first removal took its caller's
      // right away before its guard ran — denied (403). Either way exactly
      // one manager remains.
      const statuses = [a.status, b.status].sort();
      expect([
        [200, 403],
        [200, 409],
      ]).toContainEqual(statuses);
      expect(await managersInDb()).toHaveLength(1);
    });
  });

  describe("who may add or remove managers", () => {
    it("lets SYSTEM_ADMIN add one", async () => {
      const res = await addManager(ADMIN_ID, SECOND_ID).expect(201);
      expect(res.body.managerIds).toEqual([FIRST_ID, SECOND_ID]);
    });

    it("refuses a stranger", async () => {
      await addManager(STRANGER_ID, STRANGER_ID).expect(403);
      await removeManager(STRANGER_ID, FIRST_ID).expect(403);
      expect(await managersInDb()).toEqual([FIRST_ID]);
    });

    // A nazır has EDIT on the köşks of their medrese (MDRS-106). Adding
    // managers is not EDIT: a nazır who made themselves a manager would get
    // KOSK_MANAGER on the köşk's courses, which PRD §4.1 keeps from them.
    it("refuses a nazır of the köşk's medrese", async () => {
      const [madrasah] = await databaseService.db
        .insert(madrasahs)
        .values({
          handle: "hadis",
          name: "Hadis Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      await databaseService.db
        .insert(madrasahNazirs)
        .values({ madrasahId: madrasah.id, userId: NAZIR_ID });
      await databaseService.db
        .update(kosks)
        .set({ madrasahId: madrasah.id })
        .where(eq(kosks.id, koskId));

      await rename(NAZIR_ID, "Nazır düzenledi").expect(200);
      await addManager(NAZIR_ID, NAZIR_ID).expect(403);
      expect(await managersInDb()).toEqual([FIRST_ID]);
    });

    it("answers 404 for a köşk that does not exist", async () => {
      await addManager(ADMIN_ID, SECOND_ID, MISSING_UUID).expect(404);
      await removeManager(ADMIN_ID, SECOND_ID, MISSING_UUID).expect(404);
    });

    it("refuses to add someone who has never signed in", async () => {
      const res = await addManager(FIRST_ID, UNKNOWN_ID).expect(404);
      expect(res.body.code).toBe("KOSK_MANAGER_UNKNOWN_USER");
      expect(await managersInDb()).toEqual([FIRST_ID]);
    });

    it("stores an upper-case user id as the same manager, and removes it", async () => {
      await addManager(FIRST_ID, SECOND_ID.toUpperCase()).expect(201);
      expect(await managersInDb()).toEqual([FIRST_ID, SECOND_ID]);
      const res = await removeManager(FIRST_ID, SECOND_ID.toUpperCase()).expect(
        200
      );
      expect(res.body.managerIds).toEqual([FIRST_ID]);
    });

    it("answers 400 for a malformed user id", async () => {
      await http()
        .post(`/kosks/${koskId}/managers/not-a-uuid`)
        .set("Authorization", auth(FIRST_ID))
        .expect(400);
    });
  });
});
