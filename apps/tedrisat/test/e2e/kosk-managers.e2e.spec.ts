import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { courses } from "../../src/database/schema/course.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { openKosk, seedAccounts } from "../helpers/open-scopes.helper";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
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

  /** The köşk's KOSK_NAZIM rows (MDRS-134), revoked ones included. */
  const managerRows = () =>
    databaseService.db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.scopeId, koskId),
          eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM)
        )
      )
      .orderBy(roleAssignments.createdAt, roleAssignments.id);

  const managersInDb = async () =>
    (
      await databaseService.db
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, koskId),
            eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM),
            isNull(roleAssignments.revokedAt)
          )
        )
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
    // Only someone who has signed in (a `users` row, MDRS-104) can be made a
    // manager; these are the people the tests add. The başnazım opens the
    // köşk for FIRST_ID and is not one of its managers (MDRS-136).
    await seedAccounts(app, [SECOND_ID, NAZIR_ID, STRANGER_ID]);
    const res = await openKosk(
      app,
      { managerUserIds: [FIRST_ID] },
      { as: ADMIN_ID }
    );
    koskId = res.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    await app.close();
  });

  // MDRS-136: the köşk is opened for the nazım the başnazım names, and the
  // başnazım who opens it is not one (it used to make the caller the first
  // manager, which let a Medaris nazımı seat themselves by leaving the list out).
  it("opens the köşk for the manager named, not for the one who opened it", async () => {
    const res = await http()
      .get(`/kosks/${koskId}`)
      .set("Authorization", auth(STRANGER_ID))
      .expect(200);
    expect(res.body).toMatchObject({
      ownerId: ADMIN_ID,
      managerIds: [FIRST_ID],
    });
    expect(await managersInDb()).toEqual([FIRST_ID]);
  });

  describe("two managers of the same köşk can both manage it", () => {
    beforeEach(async () => {
      const res = await addManager(ADMIN_ID, SECOND_ID).expect(201);
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

    // MDRS-136, d-1004-12: adding is decided by `platform.kosk_nazim_manage`,
    // which the köşk's nazımı does not hold, so a manager no longer adds peers.
    it("lets the başnazım add a third, and adding twice is a no-op", async () => {
      await addManager(ADMIN_ID, STRANGER_ID).expect(201);
      const res = await addManager(ADMIN_ID, STRANGER_ID).expect(201);
      expect(res.body.managerIds).toEqual([FIRST_ID, SECOND_ID, STRANGER_ID]);
    });
  });

  describe("removing one manager leaves the other in place", () => {
    beforeEach(async () => {
      await addManager(ADMIN_ID, SECOND_ID).expect(201);
    });

    it("keeps the second manager when the first is removed", async () => {
      const res = await removeManager(ADMIN_ID, FIRST_ID).expect(200);
      expect(res.body.managerIds).toEqual([SECOND_ID]);
      expect(await managersInDb()).toEqual([SECOND_ID]);

      await rename(SECOND_ID, "Hâlâ yönetiyor").expect(200);
      await rename(FIRST_ID, "Artık yönetmiyor").expect(403);
    });

    // MDRS-134: a removal revokes the KOSK_NAZIM row in the remover's name
    // instead of deleting it, and adding the person again opens a new row.
    it("revokes rather than deletes, and a second grant opens a new row", async () => {
      await removeManager(ADMIN_ID, SECOND_ID).expect(200);
      let rows = await managerRows();
      expect(rows.map((r) => [r.userId, r.grantedBy, r.revokedBy])).toEqual([
        [FIRST_ID, ADMIN_ID, null],
        [SECOND_ID, ADMIN_ID, ADMIN_ID],
      ]);
      expect(rows[1].revokedAt).toBeInstanceOf(Date);

      const res = await addManager(ADMIN_ID, SECOND_ID).expect(201);
      expect(res.body.managerIds).toEqual([FIRST_ID, SECOND_ID]);
      rows = await managerRows();
      expect(rows).toHaveLength(3);
      expect(rows[2]).toMatchObject({ userId: SECOND_ID, revokedAt: null });
    });

    // A grant that lapsed by `expires_at` is no management, and granting the
    // same person again revokes the lapsed row so the new one can open.
    it("treats a lapsed grant as none, and re-granting replaces it", async () => {
      await databaseService.db
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(
          and(
            eq(roleAssignments.scopeId, koskId),
            eq(roleAssignments.userId, SECOND_ID)
          )
        );
      await rename(SECOND_ID, "Süresi doldu").expect(403);

      await addManager(ADMIN_ID, SECOND_ID).expect(201);
      await rename(SECOND_ID, "Yeniden yönetiyor").expect(200);
      const lapsed = (await managerRows()).filter(
        (r) => r.userId === SECOND_ID
      );
      expect(lapsed.map((r) => r.revokedBy)).toEqual([ADMIN_ID, null]);
    });

    // MDRS-136, d-1004-12: resigning is a removal, decided by the permission
    // and not by being a manager, so a manager cannot resign.
    it("refuses a manager removing themselves or a peer, and removes nobody", async () => {
      await removeManager(SECOND_ID, SECOND_ID).expect(403);
      await removeManager(FIRST_ID, SECOND_ID).expect(403);
      expect(await managersInDb()).toEqual([FIRST_ID, SECOND_ID].sort());
    });

    it("answers 404 for a user who is not a manager", async () => {
      const res = await removeManager(ADMIN_ID, STRANGER_ID).expect(404);
      expect(res.body.code).toBe("KOSK_MANAGER_NOT_FOUND");
      expect(await managersInDb()).toEqual([FIRST_ID, SECOND_ID].sort());
    });
  });

  describe("the last manager cannot be removed", () => {
    it("refuses SYSTEM_ADMIN with 409 when no successor is named", async () => {
      const res = await removeManager(ADMIN_ID, FIRST_ID).expect(409);
      expect(res.body.code).toBe("KOSK_LAST_MANAGER");
      expect(await managersInDb()).toEqual([FIRST_ID]);
      await rename(FIRST_ID, "Hâlâ yönetici").expect(200);
    });

    it("keeps exactly one when the last two are removed at once", async () => {
      await addManager(ADMIN_ID, SECOND_ID).expect(201);
      const [a, b] = await Promise.all([
        removeManager(ADMIN_ID, SECOND_ID),
        removeManager(ADMIN_ID, FIRST_ID),
      ]);
      // Whichever removal went second finds no one else to leave in charge
      // and is refused (409).
      expect([a.status, b.status].sort()).toEqual([200, 409]);
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

    // MDRS-106 gave a nazır of the köşk's medrese EDIT on the köşk; MDRS-134
    // replaced that affiliation with a hosting right, which gives the medrese
    // no power over the köşk (MDRS-133). Fails if the nazır path returns.
    it("refuses a başmüderris of a medrese hosted in the köşk", async () => {
      const [madrasah] = await databaseService.db
        .insert(madrasahs)
        .values({
          handle: "hadis",
          name: "Hadis Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      await assignRole(databaseService.db, {
        userId: NAZIR_ID,
        role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
        scopeId: madrasah.id,
        grantedBy: ADMIN_ID,
      });
      await databaseService.db
        .insert(madrasahKoskHosting)
        .values({ madrasahId: madrasah.id, koskId, grantedBy: ADMIN_ID });

      await rename(NAZIR_ID, "Nazır düzenledi").expect(403);
      await addManager(NAZIR_ID, NAZIR_ID).expect(403);
      expect(await managersInDb()).toEqual([FIRST_ID]);
    });

    it("answers 404 for a köşk that does not exist", async () => {
      await addManager(ADMIN_ID, SECOND_ID, MISSING_UUID).expect(404);
      await removeManager(ADMIN_ID, SECOND_ID, MISSING_UUID).expect(404);
    });

    it("refuses to add someone who has never signed in", async () => {
      const res = await addManager(ADMIN_ID, UNKNOWN_ID).expect(404);
      expect(res.body.code).toBe("KOSK_MANAGER_UNKNOWN_USER");
      expect(await managersInDb()).toEqual([FIRST_ID]);
    });

    it("stores an upper-case user id as the same manager, and removes it", async () => {
      await addManager(ADMIN_ID, SECOND_ID.toUpperCase()).expect(201);
      expect(await managersInDb()).toEqual([FIRST_ID, SECOND_ID]);
      const res = await removeManager(ADMIN_ID, SECOND_ID.toUpperCase()).expect(
        200
      );
      expect(res.body.managerIds).toEqual([FIRST_ID]);
    });

    it("answers 400 for a malformed user id", async () => {
      await http()
        .post(`/kosks/${koskId}/managers/not-a-uuid`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(400);
    });
  });
});
