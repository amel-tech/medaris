import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-170, nizam/07 and nizam/08: the platform's medrese table, opening a
 * medrese with its başmüderris, appointing one, bringing a hidden one back —
 * against a real Postgres, with a minted SYSTEM_ADMIN token.
 */
const ADMIN_ID = "d0000000-0000-4000-8000-000000000001";
const HEAD_A = "d0000000-0000-4000-8000-000000000002";
const HEAD_B = "d0000000-0000-4000-8000-000000000003";
const STRANGER = "d0000000-0000-4000-8000-000000000004";
const MANAGER = "d0000000-0000-4000-8000-000000000005";
const MEDARIS = "d0000000-0000-4000-8000-000000000006";

// Every request syncs the caller's profile from the token (MDRS-104); only
// rows for people who never call stay as seeded.
const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Medrese directory (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let active: string;
  let passive: string;
  let hidden: string;
  let koskId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const heads = (madrasahId: string) =>
    db()
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.scopeId, madrasahId),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS)
        )
      )
      .orderBy(roleAssignments.createdAt, roleAssignments.id);

  const audit = (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await db()
      .insert(users)
      .values([
        {
          id: HEAD_A,
          email: "a@example.com",
          givenName: "Mehmet Emin",
          familyName: "Işıkoğlu",
        },
        {
          id: HEAD_B,
          email: "b@example.com",
          givenName: "Hüseyin Avni",
          familyName: "Karamustafa",
        },
      ]);
    const [a, p, h] = await db()
      .insert(madrasahs)
      .values([
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        },
        {
          handle: "zeyrek",
          name: "Zeyrek Medresesi",
          createdBy: ADMIN_ID,
          passiveSince: new Date("2026-09-27T09:00:00Z"),
          passiveReason: "TERM_ENDED",
        },
        {
          handle: "vefa",
          name: "Vefa Medresesi",
          createdBy: ADMIN_ID,
          archivedAt: new Date("2026-09-24T09:00:00Z"),
          archivedBy: ADMIN_ID,
        },
      ])
      .returning();
    active = a.id;
    passive = p.id;
    hidden = h.id;
    await assignRole(db(), {
      userId: HEAD_A,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: active,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: HEAD_B,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: hidden,
      grantedBy: ADMIN_ID,
    });
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    await db()
      .insert(madrasahKoskHosting)
      .values({ madrasahId: active, koskId, grantedBy: ADMIN_ID });
    await db()
      .insert(courses)
      .values([
        { koskId, authorId: MANAGER, title: "Bina", madrasahId: active },
        { koskId, authorId: MANAGER, title: "Maksûd", madrasahId: active },
        {
          koskId,
          authorId: MANAGER,
          title: "Gizli ders",
          madrasahId: active,
          archivedAt: new Date(),
        },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
  });

  describe("GET /madrasahs/directory", () => {
    it("lists every medrese with its başmüderris, course count, hosting köşks and status", async () => {
      const res = await http()
        .get("/madrasahs/directory")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.counts).toEqual({
        all: 3,
        active: 1,
        passive: 1,
        hidden: 1,
      });
      expect(res.body.total).toBe(3);
      expect(res.body.items.map((i: { handle: string }) => i.handle)).toEqual([
        "suleymaniye",
        "vefa",
        "zeyrek",
      ]);
      const [suleymaniye, vefa, zeyrek] = res.body.items;
      expect(suleymaniye).toMatchObject({
        status: "ACTIVE",
        since: null,
        courseCount: 2,
        headMuderris: { id: HEAD_A, name: "Mehmet Emin Işıkoğlu" },
        hostingKosks: [{ id: koskId, name: "Nûruosmaniye Köşkü" }],
      });
      expect(vefa).toMatchObject({
        status: "HIDDEN",
        courseCount: 0,
        hostingKosks: [],
        headMuderris: { id: HEAD_B, name: "Hüseyin Avni Karamustafa" },
      });
      expect(vefa.since).toBe("2026-09-24T09:00:00.000Z");
      expect(zeyrek).toMatchObject({ status: "PASSIVE", headMuderris: null });
      expect(zeyrek.since).toBe("2026-09-27T09:00:00.000Z");
      expect(res.body.passive).toEqual([
        {
          id: passive,
          name: "Zeyrek Medresesi",
          since: "2026-09-27T09:00:00.000Z",
        },
      ]);
    });

    it.each([
      ["ACTIVE", ["suleymaniye"]],
      ["PASSIVE", ["zeyrek"]],
      ["HIDDEN", ["vefa"]],
    ])("filters by status %s and keeps the counts whole", async (status, handles) => {
      const res = await http()
        .get(`/madrasahs/directory?status=${status}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.items.map((i: { handle: string }) => i.handle)).toEqual(
        handles
      );
      expect(res.body.total).toBe(1);
      expect(res.body.counts.all).toBe(3);
    });

    it("searches the name, the handle and the başmüderris's name, ignoring case", async () => {
      const byName = await http()
        .get("/madrasahs/directory?q=zeyr")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(byName.body.items).toHaveLength(1);
      const byHead = await http()
        .get(`/madrasahs/directory?q=${encodeURIComponent("karamustafa")}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(
        byHead.body.items.map((i: { handle: string }) => i.handle)
      ).toEqual(["vefa"]);
      const none = await http()
        .get("/madrasahs/directory?q=%25")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(none.body.items).toHaveLength(0);
    });

    it("reads a repeated q as no search instead of failing", async () => {
      const res = await http()
        .get("/madrasahs/directory?q=zeyr&q=vefa")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.total).toBe(3);
    });

    it("pages", async () => {
      const res = await http()
        .get("/madrasahs/directory?limit=2&page=2")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(3);
    });

    it("rejects an unknown status", () =>
      http()
        .get("/madrasahs/directory?status=BOGUS")
        .set("Authorization", auth(ADMIN_ID))
        .expect(400));

    it.each([
      ["a başmüderris", HEAD_A],
      ["a köşk nazımı", MANAGER],
      ["a stranger", STRANGER],
    ])("refuses %s with 403", (_who, sub) =>
      http()
        .get("/madrasahs/directory")
        .set("Authorization", auth(sub))
        .expect(403));

    it("refuses a caller with no token with 401", () =>
      http().get("/madrasahs/directory").expect(401));

    it("opens to a Medaris nazımı by each permission the page acts on, and by no other (MDRS-108)", async () => {
      await db().insert(roleAssignments).values({
        userId: MEDARIS,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
      const holding = async (permission: string) => {
        await db().delete(permissionGrants);
        await db().insert(permissionGrants).values({
          userId: MEDARIS,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          permission,
          grantedBy: ADMIN_ID,
        });
        return http()
          .get("/madrasahs/directory")
          .set("Authorization", auth(MEDARIS));
      };
      for (const permission of [
        PERMISSIONS.PLATFORM_MADRASAH_CREATE,
        PERMISSIONS.PLATFORM_MADRASAH_EDIT,
        // "Başmüderris ata" lives on this page alone.
        PERMISSIONS.PLATFORM_HEAD_MUDERRIS_MANAGE,
      ]) {
        expect((await holding(permission)).status).toBe(200);
      }
      // Nothing on the page is a nazır grant: neither the page nor its menu item opens.
      expect(
        (await holding(PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT)).status
      ).toBe(403);
    });

    it("leaves a hidden medrese out of the open list and closes its page", async () => {
      const list = await http().get("/madrasahs").expect(200);
      expect(list.body.items.map((i: { handle: string }) => i.handle)).toEqual([
        "suleymaniye",
        "zeyrek",
      ]);
      expect(list.body.total).toBe(2);
      await http().get(`/madrasahs/${hidden}/overview`).expect(404);
      await http().get(`/madrasahs/${active}/overview`).expect(200);
    });

    it("closes a hidden medrese's own read to a caller with no token and keeps it open to the başnazım (MDRS-143)", async () => {
      await http().get(`/madrasahs/${hidden}`).expect(404);
      await http()
        .get(`/madrasahs/${hidden}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      await http().get(`/madrasahs/${active}`).expect(200);
      await http().get(`/madrasahs/${passive}`).expect(200);
    });
  });

  describe("POST /madrasahs — a medrese opens with its başmüderris", () => {
    it("makes the handle from the name and grants the başmüderris in one go", async () => {
      const res = await http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ name: "Atik Ali Paşa Medresesi", headMuderrisUserId: HEAD_B })
        .expect(201);
      expect(res.body).toMatchObject({
        handle: "atik-ali-pasa-medresesi",
        nazirIds: [HEAD_B],
      });
      const [row] = await heads(res.body.id);
      expect(row).toMatchObject({ userId: HEAD_B, grantedBy: ADMIN_ID });
      const [entry] = await audit("madrasah.create");
      expect(entry).toMatchObject({
        actorId: ADMIN_ID,
        entityId: res.body.id,
        details: { headMuderrisUserId: HEAD_B },
      });
    });

    it("numbers a generated handle that two medreses would share", async () => {
      const first = await http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ name: "Süleymaniye Medresesi!", headMuderrisUserId: HEAD_B })
        .expect(201);
      expect(first.body.handle).toBe("suleymaniye-medresesi");
      const second = await http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ name: "Süleymaniye Medresesi", headMuderrisUserId: HEAD_B })
        .expect(201);
      expect(second.body.handle).toBe("suleymaniye-medresesi-2");
    });

    it("writes neither the medrese nor an audit row when the handle is taken", async () => {
      await http()
        .post("/madrasahs")
        .set("Authorization", auth(ADMIN_ID))
        .send({ handle: "zeyrek", name: "Başka", headMuderrisUserId: HEAD_B })
        .expect(409);
      expect(await db().select().from(madrasahs)).toHaveLength(3);
      expect(await audit("madrasah.create")).toHaveLength(0);
    });
  });

  describe("PUT /madrasahs/:id/head-muderris", () => {
    it("appoints one to a passive medrese, which is active again", async () => {
      const res = await http()
        .put(`/madrasahs/${passive}/head-muderris`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ userId: HEAD_B })
        .expect(200);
      expect(res.body).toMatchObject({
        id: passive,
        status: "ACTIVE",
        since: null,
        headMuderris: { id: HEAD_B, name: "Hüseyin Avni Karamustafa" },
      });
      const [row] = await db()
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.id, passive));
      expect(row.passiveSince).toBeNull();
      expect(row.passiveReason).toBeNull();
      const [entry] = await audit("madrasah.head_muderris.set");
      expect(entry.details).toMatchObject({
        headMuderrisUserId: HEAD_B,
        previous: [],
      });
    });

    it("replaces the one who heads it, revoking their grant instead of deleting it", async () => {
      await http()
        .put(`/madrasahs/${active}/head-muderris`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ userId: HEAD_B })
        .expect(200);
      const rows = await heads(active);
      expect(rows).toHaveLength(2);
      const old = rows.find((r) => r.userId === HEAD_A);
      expect(old?.revokedAt).not.toBeNull();
      expect(old?.revokedBy).toBe(ADMIN_ID);
      expect(rows.find((r) => r.userId === HEAD_B)?.revokedAt).toBeNull();
    });

    it("appointing the one who already heads it changes nothing but the audit trail", async () => {
      await http()
        .put(`/madrasahs/${active}/head-muderris`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ userId: HEAD_A })
        .expect(200);
      const rows = await heads(active);
      expect(rows).toHaveLength(1);
      expect(rows[0].revokedAt).toBeNull();
    });

    it("answers 404 for a missing medrese, 400 for a bad user id, 403 for a başmüderris", async () => {
      await http()
        .put("/madrasahs/d0000000-0000-4000-8000-0000000000ff/head-muderris")
        .set("Authorization", auth(ADMIN_ID))
        .send({ userId: HEAD_B })
        .expect(404);
      await http()
        .put(`/madrasahs/${passive}/head-muderris`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ userId: "nobody" })
        .expect(400);
      await http()
        .put(`/madrasahs/${active}/head-muderris`)
        .set("Authorization", auth(HEAD_A))
        .send({ userId: HEAD_B })
        .expect(403);
    });
  });

  describe("POST /madrasahs/:id/restore", () => {
    it("brings a hidden medrese back and writes it down", async () => {
      const res = await http()
        .post(`/madrasahs/${hidden}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body).toMatchObject({
        id: hidden,
        status: "ACTIVE",
        since: null,
      });
      const [row] = await db()
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.id, hidden));
      expect(row.archivedAt).toBeNull();
      expect(row.archivedBy).toBeNull();
      const [entry] = await audit("madrasah.restore");
      expect(entry).toMatchObject({ actorId: ADMIN_ID, entityId: hidden });
      const list = await http().get("/madrasahs").expect(200);
      expect(list.body.total).toBe(3);
    });

    it("answers 409 for a medrese that is not hidden, 404 for a missing one, 403 for anyone else", async () => {
      const res = await http()
        .post(`/madrasahs/${active}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(409);
      expect(res.body.code).toBe("MADRASAH_NOT_HIDDEN");
      await http()
        .post("/madrasahs/d0000000-0000-4000-8000-0000000000ff/restore")
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      // Someone with no part in the medrese, another medrese's başmüderris and a köşk's
      // nazımı do not bring it back.
      for (const sub of [HEAD_A, STRANGER, MANAGER]) {
        await http()
          .post(`/madrasahs/${hidden}/restore`)
          .set("Authorization", auth(sub))
          .expect(403);
      }
    });

    // By kademe (MDRS-135, d-1003-07): the level that hid it, or one above. A medrese hidden
    // before the level was recorded counts as the medrese's own, so its başmüderris may bring it
    // back; once the level says the platform hid it, the başmüderris may not.
    it("lets the başmüderris bring back a medrese hidden before levels were recorded, not one the platform hid", async () => {
      await db()
        .update(madrasahs)
        .set({ archivedLevel: SCOPE_TYPES.PLATFORM })
        .where(eq(madrasahs.id, hidden));
      const refused = await http()
        .post(`/madrasahs/${hidden}/restore`)
        .set("Authorization", auth(HEAD_B))
        .expect(403);
      expect(refused.body.code).toBe("ARCHIVE_RESTORE_LEVEL");

      await db()
        .update(madrasahs)
        .set({ archivedLevel: null })
        .where(eq(madrasahs.id, hidden));
      await http()
        .post(`/madrasahs/${hidden}/restore`)
        .set("Authorization", auth(HEAD_B))
        .expect(200);
    });

    it("restores a medrese that is both hidden and passive as passive", async () => {
      await db()
        .update(madrasahs)
        .set({ passiveSince: new Date("2026-09-20T09:00:00Z") })
        .where(eq(madrasahs.id, hidden));
      const res = await http()
        .post(`/madrasahs/${hidden}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.status).toBe("PASSIVE");
    });
  });
});
