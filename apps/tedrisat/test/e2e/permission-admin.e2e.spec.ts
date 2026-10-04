import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  permissionGrants,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import {
  KEYCLOAK_ADMIN_FETCH,
  KeycloakAdminService,
} from "../../src/keycloak-admin/keycloak-admin.service";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-171 (nizam/11, 12, 13): Medaris nazımları, the permission catalog and
 * the permission groups, against a real Postgres. Only the realm directory is
 * replaced (a name for a person who never signed in).
 */
const ADMIN = "c0000000-0000-4000-8000-000000000001";
const HASAN = "c0000000-0000-4000-8000-000000000002";
const RABIA = "c0000000-0000-4000-8000-000000000003";
const NEWCOMER = "c0000000-0000-4000-8000-000000000004";
const TALEBE = "c0000000-0000-4000-8000-000000000005";
const KOSK_OWNER = "c0000000-0000-4000-8000-000000000006";

const claims: Record<string, Record<string, unknown>> = {
  [ADMIN]: {
    email: "basnazim@example.com",
    given_name: "Yusuf",
    family_name: "Ertuğrul",
    realm_access: { roles: [ROLES.SYSTEM_ADMIN] },
  },
  [HASAN]: { email: "h.gundogdu@example.com" },
  [RABIA]: { email: "r.tokatlioglu@example.com" },
  [TALEBE]: { email: "talebe@example.com" },
};
const auth = (sub: string) => bearerFor({ sub, claims: claims[sub] ?? {} });

function fakeFetch(input: unknown): Promise<Response> {
  const url = String(input);
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );
  if (url.endsWith("/protocol/openid-connect/token")) {
    return json({ access_token: "t", expires_in: 300 });
  }
  if (url.endsWith(`/admin/realms/r/users/${NEWCOMER}`)) {
    return json({
      id: NEWCOMER,
      email: "yeni@example.com",
      firstName: "Yeni",
      lastName: "Nazım",
      enabled: true,
    });
  }
  return json({}, 404);
}

const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

describe("Permission admin (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;

  const http = () => request(app.getHttpServer());
  const get = (path: string, sub = ADMIN) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (path: string, body: unknown, sub = ADMIN) =>
    http()
      .post(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const put = (path: string, body: unknown, sub = ADMIN) =>
    http()
      .put(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const del = (path: string, body: unknown = {}, sub = ADMIN) =>
    http()
      .delete(path)
      .set("Authorization", auth(sub))
      .send(body as object);

  const auditActions = async () =>
    (await db.select({ action: auditLog.action }).from(auditLog)).map(
      (r) => r.action
    );

  const makeGroup = async (
    name: string,
    permissions: string[],
    scope: "PLATFORM" | "ALL_COURSES" = "PLATFORM"
  ): Promise<string> => {
    const res = await post("/nizam/permission-groups", {
      name,
      scope,
      permissions,
    }).expect(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
    const config = (
      app.get(KeycloakAdminService) as unknown as {
        config: { get: (k: string) => unknown };
      }
    ).config;
    const original = config.get.bind(config);
    config.get = (key: string) =>
      key === "keycloak.admin"
        ? {
            adminUrl: "http://kc.test/admin/realms/r",
            tokenUrl: "http://kc.test/realms/r/protocol/openid-connect/token",
            clientId: "tedrisat-admin",
            clientSecret: "s",
          }
        : original(key);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "audit_log",
      "users"
    );
    await db.insert(users).values([
      {
        id: ADMIN,
        email: "basnazim@example.com",
        givenName: "Yusuf",
        familyName: "Ertuğrul",
      },
      {
        id: HASAN,
        email: "h.gundogdu@example.com",
        givenName: "Hasan Basri",
        familyName: "Gündoğdu",
      },
      {
        id: RABIA,
        email: "r.tokatlioglu@example.com",
        givenName: "Rabia",
        familyName: "Tokatlıoğlu",
      },
    ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "audit_log",
      "users"
    );
    await app.close();
  });

  describe("who may call", () => {
    it("answers anyone but the başnazım with 403, a Medaris nazımı included", async () => {
      await post("/nizam/medaris-nazims", {
        userId: HASAN,
        permissions: [],
      }).expect(201);
      for (const sub of [HASAN, TALEBE]) {
        await get("/nizam/medaris-nazims", sub).expect(403);
        await get("/nizam/permissions", sub).expect(403);
        await get("/nizam/permission-groups", sub).expect(403);
        await post(
          "/nizam/permission-groups",
          {
            name: "X",
            scope: "PLATFORM",
            permissions: ["platform.audit_read"],
          },
          sub
        ).expect(403);
        await put(
          `/nizam/medaris-nazims/${RABIA}/grants`,
          { permissions: [] },
          sub
        ).expect(403);
        await del(
          `/nizam/medaris-nazims/${HASAN}`,
          { decisions: [] },
          sub
        ).expect(403);
      }
    });

    it("needs a token", async () => {
      await http().get("/nizam/medaris-nazims").expect(401);
    });
  });

  describe("GET /nizam/permissions", () => {
    it("gives the platform's five sections and the course codes", async () => {
      const res = await get("/nizam/permissions").expect(200);
      expect(res.body.platform.map((s: { id: string }) => s.id)).toEqual([
        "kosks",
        "madrasahs",
        "requests",
        "bans",
        "audit",
      ]);
      expect(
        res.body.platform.map(
          (s: { permissions: string[] }) => s.permissions.length
        )
      ).toEqual([5, 4, 3, 2, 4]);
      // Platform management's course hide (MDRS-143) is one of the köşk section's.
      expect(res.body.platform[0].permissions).toContain(
        "platform.course_hide"
      );
      expect(res.body.course).toContain("course.edit");
      expect(res.body.course).not.toContain("user.lookup");
    });
  });

  describe("permission groups", () => {
    it("creates, lists with the scope and the count, and audits (criteria 1, 5)", async () => {
      const id = await makeGroup("Köşk işleri", [
        "platform.kosk_create",
        "platform.kosk_nazim_manage",
      ]);
      await makeGroup(
        "Ders denetimi",
        ["course.edit", "course.publish", "ban.course"],
        "ALL_COURSES"
      );
      const res = await get("/nizam/permission-groups").expect(200);
      expect(res.body).toHaveLength(2);
      const kosk = res.body.find((g: { id: string }) => g.id === id);
      expect(kosk).toMatchObject({
        name: "Köşk işleri",
        scope: "PLATFORM",
        userCount: 0,
      });
      expect(kosk.permissions).toEqual([
        "platform.kosk_create",
        "platform.kosk_nazim_manage",
      ]);
      expect(res.body.map((g: { scope: string }) => g.scope)).toEqual([
        "PLATFORM",
        "ALL_COURSES",
      ]);
      expect(await auditActions()).toEqual([
        "permission_group.create",
        "permission_group.create",
      ]);
    });

    it("creates a group for one course", async () => {
      const [kosk] = await db
        .insert(kosks)
        .values({ ownerId: KOSK_OWNER, name: "K" })
        .returning();
      const [course] = await db
        .insert(courses)
        .values({ koskId: kosk.id, authorId: KOSK_OWNER, title: "Bina" })
        .returning();
      const res = await post("/nizam/permission-groups", {
        name: "Bina denetimi",
        scope: "COURSE",
        courseId: course.id,
        permissions: ["course.edit"],
      }).expect(201);
      expect(res.body).toMatchObject({
        scope: "COURSE",
        courseId: course.id,
        courseTitle: "Bina",
      });
      await post("/nizam/permission-groups", {
        name: "Eksik",
        scope: "COURSE",
        permissions: ["course.edit"],
      }).expect(400);
      await post("/nizam/permission-groups", {
        name: "Yok",
        scope: "COURSE",
        courseId: "c0000000-0000-4000-8000-0000000000ff",
        permissions: ["course.edit"],
      }).expect(400);
    });

    it("refuses a blank or repeated name in any case, and a code outside the scope (criterion 4)", async () => {
      await makeGroup("Denetim", ["platform.audit_read"]);
      const dup = await post("/nizam/permission-groups", {
        name: "  denetim ",
        scope: "PLATFORM",
        permissions: ["platform.audit_read"],
      }).expect(409);
      expect(dup.body.code).toBe("PERMISSION_GROUP_NAME_TAKEN");
      await post("/nizam/permission-groups", {
        name: "   ",
        scope: "PLATFORM",
        permissions: ["platform.audit_read"],
      }).expect(400);
      const wrong = await post("/nizam/permission-groups", {
        name: "Yanlış",
        scope: "PLATFORM",
        permissions: ["course.edit"],
      }).expect(400);
      expect(wrong.body.code).toBe("PERMISSION_UNKNOWN");
      const courseWrong = await post("/nizam/permission-groups", {
        name: "Yanlış 2",
        scope: "ALL_COURSES",
        permissions: ["platform.audit_read"],
      }).expect(400);
      expect(courseWrong.body.code).toBe("PERMISSION_UNKNOWN");
      await post("/nizam/permission-groups", {
        name: "Boş",
        scope: "PLATFORM",
        permissions: [],
      }).expect(400);
    });

    it("renames and changes permissions of a group nobody holds without a question", async () => {
      const id = await makeGroup("Denetim", ["platform.audit_read"]);
      const res = await put(`/nizam/permission-groups/${id}`, {
        name: "Denetim ve ayar",
        permissions: ["platform.audit_read", "platform.policy_edit"],
      }).expect(200);
      expect(res.body.name).toBe("Denetim ve ayar");
      expect(res.body.permissions).toEqual([
        "platform.audit_read",
        "platform.policy_edit",
      ]);
      await makeGroup("Başka", ["platform.audit_read"]);
      await put(`/nizam/permission-groups/${id}`, {
        name: "BAŞKA",
        permissions: ["platform.audit_read"],
      }).expect(409);
      await put(
        "/nizam/permission-groups/c0000000-0000-4000-8000-0000000000ff",
        { name: "x", permissions: ["platform.audit_read"] }
      ).expect(404);
    });

    describe("a group somebody holds (criterion 3)", () => {
      let groupId: string;
      beforeEach(async () => {
        groupId = await makeGroup("Köşk işleri", [
          "platform.kosk_create",
          "platform.kosk_edit",
        ]);
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          groupId,
          permissions: ["platform.audit_read"],
        }).expect(201);
      });

      it("counts the holder and lists them with their end", async () => {
        const list = await get("/nizam/permission-groups").expect(200);
        expect(list.body[0].userCount).toBe(1);
        const users_ = await get(
          `/nizam/permission-groups/${groupId}/users`
        ).expect(200);
        expect(users_.body).toEqual([
          expect.objectContaining({
            userId: HASAN,
            name: "Hasan Basri Gündoğdu",
            email: "h.gundogdu@example.com",
            isMedarisNazim: true,
            expiresAt: null,
          }),
        ]);
      });

      it("asks what becomes of them before deleting or changing permissions", async () => {
        const r1 = await del(`/nizam/permission-groups/${groupId}`).expect(400);
        expect(r1.body.code).toBe("USERS_POLICY_REQUIRED");
        const r2 = await put(`/nizam/permission-groups/${groupId}`, {
          name: "Köşk işleri",
          permissions: ["platform.kosk_create"],
        }).expect(400);
        expect(r2.body.code).toBe("USERS_POLICY_REQUIRED");
        // a rename alone asks nothing
        await put(`/nizam/permission-groups/${groupId}`, {
          name: "Köşk işleri 2",
          permissions: ["platform.kosk_create", "platform.kosk_edit"],
        }).expect(200);
      });

      it("delete with keep turns the group into single permissions", async () => {
        await del(`/nizam/permission-groups/${groupId}`, {
          usersPolicy: "keep",
        }).expect(204);
        const list = await get("/nizam/permission-groups").expect(200);
        expect(list.body).toEqual([]);
        const nazims = await get("/nizam/medaris-nazims").expect(200);
        expect(nazims.body[0].groups).toEqual([]);
        expect(
          nazims.body[0].permissions.map((p: { code: string }) => p.code).sort()
        ).toEqual([
          "platform.audit_read",
          "platform.kosk_create",
          "platform.kosk_edit",
        ]);
        expect(await auditActions()).toContain("permission_group.delete");
      });

      it("delete with revoke takes the group's permissions away and nothing else", async () => {
        await del(`/nizam/permission-groups/${groupId}`, {
          usersPolicy: "revoke",
        }).expect(204);
        const nazims = await get("/nizam/medaris-nazims").expect(200);
        expect(nazims.body[0].groups).toEqual([]);
        expect(
          nazims.body[0].permissions.map((p: { code: string }) => p.code)
        ).toEqual(["platform.audit_read"]);
      });

      it("a change with keep leaves them the old permissions, with revoke none", async () => {
        await put(`/nizam/permission-groups/${groupId}`, {
          name: "Köşk işleri",
          permissions: ["platform.kosk_create"],
          usersPolicy: "keep",
        }).expect(200);
        const nazims = await get("/nizam/medaris-nazims").expect(200);
        expect(nazims.body[0].groups).toEqual([]);
        expect(
          nazims.body[0].permissions.map((p: { code: string }) => p.code).sort()
        ).toEqual([
          "platform.audit_read",
          "platform.kosk_create",
          "platform.kosk_edit",
        ]);
        const list = await get("/nizam/permission-groups").expect(200);
        expect(list.body[0]).toMatchObject({
          userCount: 0,
          permissions: ["platform.kosk_create"],
        });
      });

      it("a deleted group's name can be used again", async () => {
        await del(`/nizam/permission-groups/${groupId}`, {
          usersPolicy: "revoke",
        }).expect(204);
        await makeGroup("Köşk işleri", ["platform.kosk_edit"]);
      });
    });
  });

  describe("Medaris nazımları", () => {
    it("appoints with a group, single permissions and an end, and lists them in order (criteria 1, 2)", async () => {
      const groupId = await makeGroup("Köşk işleri", [
        "platform.kosk_create",
        "platform.kosk_edit",
      ]);
      const end = daysFromNow(40);
      const res = await post("/nizam/medaris-nazims", {
        userId: HASAN,
        groupId,
        // one of the group's own codes is listed again and dropped
        permissions: ["platform.kosk_edit", "platform.ban_account"],
        expiresAt: end,
      }).expect(201);
      expect(res.body.user).toMatchObject({
        id: HASAN,
        name: "Hasan Basri Gündoğdu",
      });
      expect(res.body.appointedBy).toMatchObject({
        id: ADMIN,
        name: "Yusuf Ertuğrul",
      });
      expect(res.body.groups).toEqual([
        expect.objectContaining({
          id: groupId,
          name: "Köşk işleri",
          scope: "PLATFORM",
        }),
      ]);
      expect(res.body.permissions.map((p: { code: string }) => p.code)).toEqual(
        ["platform.ban_account"]
      );
      expect(new Date(res.body.expiresAt).toISOString()).toBe(
        new Date(end).toISOString()
      );
      expect(res.body.assignmentExpiresAt).not.toBeNull();

      await post("/nizam/medaris-nazims", {
        userId: RABIA,
        permissions: [],
      }).expect(201);
      const list = await get("/nizam/medaris-nazims").expect(200);
      expect(list.body.map((n: { user: { id: string } }) => n.user.id)).toEqual(
        [HASAN, RABIA]
      );
      expect(list.body[1].expiresAt).toBeNull();
      expect(list.body[1].groups).toEqual([]);

      const actions = await auditActions();
      expect(actions.filter((a) => a === "medaris_nazim.appoint")).toHaveLength(
        2
      );
      expect(actions).toContain("permission.grant");
    });

    it("names a person who never signed in from the directory", async () => {
      const res = await post("/nizam/medaris-nazims", {
        userId: NEWCOMER,
        permissions: ["platform.audit_read"],
      }).expect(201);
      expect(res.body.user).toMatchObject({
        id: NEWCOMER,
        name: "Yeni Nazım",
        email: "yeni@example.com",
      });
    });

    it("refuses a second appointment, a past end, an unknown code and a non-platform group", async () => {
      await post("/nizam/medaris-nazims", {
        userId: HASAN,
        permissions: [],
      }).expect(201);
      const again = await post("/nizam/medaris-nazims", {
        userId: HASAN,
        permissions: [],
      }).expect(409);
      expect(again.body.code).toBe("MEDARIS_NAZIM_ALREADY_APPOINTED");
      await post("/nizam/medaris-nazims", {
        userId: RABIA,
        permissions: [],
        expiresAt: daysFromNow(-1),
      }).expect(400);
      const unknown = await post("/nizam/medaris-nazims", {
        userId: RABIA,
        permissions: ["platform.nope"],
      }).expect(400);
      expect(unknown.body.code).toBe("PERMISSION_UNKNOWN");
      const courseGroup = await makeGroup(
        "Ders",
        ["course.edit"],
        "ALL_COURSES"
      );
      const wrongScope = await post("/nizam/medaris-nazims", {
        userId: RABIA,
        groupId: courseGroup,
        permissions: [],
      }).expect(400);
      expect(wrongScope.body.code).toBe("PERMISSION_GROUP_SCOPE_INVALID");
      await post("/nizam/medaris-nazims", {
        userId: RABIA,
        groupId: "c0000000-0000-4000-8000-0000000000ff",
        permissions: [],
      }).expect(404);
      // nothing was half-written
      const rows = await db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, RABIA));
      expect(rows).toHaveLength(0);
    });

    it("a lapsed appointment is not listed, and the person can be appointed again (criterion 3)", async () => {
      await post("/nizam/medaris-nazims", {
        userId: HASAN,
        permissions: ["platform.audit_read"],
        expiresAt: daysFromNow(5),
      }).expect(201);
      await db
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(roleAssignments.userId, HASAN));
      await db
        .update(permissionGrants)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(permissionGrants.userId, HASAN));
      expect((await get("/nizam/medaris-nazims").expect(200)).body).toEqual([]);
      await post("/nizam/medaris-nazims", {
        userId: HASAN,
        permissions: [],
      }).expect(201);
    });

    describe("PUT …/grants", () => {
      it("changes the group and single permissions, leaving what stays alone (criteria 2, 4)", async () => {
        const first = await makeGroup("Köşk işleri", ["platform.kosk_create"]);
        const second = await makeGroup("Denetim", ["platform.audit_read"]);
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          groupId: first,
          permissions: ["platform.policy_edit", "platform.ban_account"],
        }).expect(201);
        const before = await db
          .select()
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.userId, HASAN),
              eq(permissionGrants.permission, "platform.policy_edit")
            )
          );

        const res = await put(`/nizam/medaris-nazims/${HASAN}/grants`, {
          groupId: second,
          permissions: ["platform.policy_edit"],
        }).expect(200);
        expect(res.body.groups.map((g: { id: string }) => g.id)).toEqual([
          second,
        ]);
        expect(
          res.body.permissions.map((p: { code: string }) => p.code)
        ).toEqual(["platform.policy_edit"]);
        const after = await db
          .select()
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.userId, HASAN),
              eq(permissionGrants.permission, "platform.policy_edit"),
              isNull(permissionGrants.revokedAt)
            )
          );
        expect(after[0].id).toBe(before[0].id);
        expect(after[0].createdAt).toEqual(before[0].createdAt);

        const revoked = await db
          .select()
          .from(permissionGrants)
          .where(eq(permissionGrants.permission, "platform.ban_account"));
        expect(revoked[0].revokedBy).toBe(ADMIN);

        const actions = await auditActions();
        expect(actions.filter((a) => a === "permission.grant")).toHaveLength(2);
        expect(actions).toContain("permission.revoke");
      });

      it("'Grup yok' and no single permissions empties the person without dismissing them", async () => {
        const groupId = await makeGroup("Denetim", ["platform.audit_read"]);
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          groupId,
          permissions: [],
        }).expect(201);
        const res = await put(`/nizam/medaris-nazims/${HASAN}/grants`, {
          groupId: null,
          permissions: [],
        }).expect(200);
        expect(res.body.groups).toEqual([]);
        expect(res.body.permissions).toEqual([]);
        expect(
          (await get("/nizam/medaris-nazims").expect(200)).body
        ).toHaveLength(1);
      });

      it("refuses an end after the appointment's, or in the past, and a stranger (criterion 3 of nizam/12)", async () => {
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          permissions: ["platform.audit_read"],
          expiresAt: daysFromNow(30),
        }).expect(201);
        const late = await put(`/nizam/medaris-nazims/${HASAN}/grants`, {
          permissions: ["platform.audit_read"],
          expiresAt: daysFromNow(31),
        }).expect(400);
        expect(late.body.code).toBe("GRANT_EXPIRY_INVALID");
        await put(`/nizam/medaris-nazims/${HASAN}/grants`, {
          permissions: ["platform.audit_read"],
          expiresAt: daysFromNow(-2),
        }).expect(400);
        await put(`/nizam/medaris-nazims/${RABIA}/grants`, {
          permissions: [],
        }).expect(404);
      });

      it("a shorter end shows in the list; an empty one falls back to the appointment's", async () => {
        const appointment = daysFromNow(30);
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          permissions: ["platform.audit_read"],
          expiresAt: appointment,
        }).expect(201);
        const short = daysFromNow(10);
        const res = await put(`/nizam/medaris-nazims/${HASAN}/grants`, {
          permissions: ["platform.audit_read"],
          expiresAt: short,
        }).expect(200);
        expect(new Date(res.body.expiresAt).toISOString()).toBe(
          new Date(short).toISOString()
        );
        expect(new Date(res.body.assignmentExpiresAt).toISOString()).toBe(
          new Date(appointment).toISOString()
        );
        const back = await put(`/nizam/medaris-nazims/${HASAN}/grants`, {
          permissions: ["platform.audit_read"],
          expiresAt: null,
        }).expect(200);
        expect(new Date(back.body.expiresAt).toISOString()).toBe(
          new Date(appointment).toISOString()
        );
      });
    });

    describe("dismissal (criterion 5)", () => {
      it("removes the person, revokes their permissions and audits it", async () => {
        const groupId = await makeGroup("Denetim", ["platform.audit_read"]);
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          groupId,
          permissions: ["platform.policy_edit"],
        }).expect(201);
        await post("/nizam/medaris-nazims", {
          userId: RABIA,
          permissions: [],
        }).expect(201);
        expect(
          (await get(`/nizam/medaris-nazims/${HASAN}/given`).expect(200)).body
        ).toEqual([]);

        await del(`/nizam/medaris-nazims/${HASAN}`, { decisions: [] }).expect(
          204
        );

        const list = await get("/nizam/medaris-nazims").expect(200);
        expect(
          list.body.map((n: { user: { id: string } }) => n.user.id)
        ).toEqual([RABIA]);
        const open = await db
          .select()
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.userId, HASAN),
              isNull(permissionGrants.revokedAt)
            )
          );
        expect(open).toEqual([]);
        expect(await auditActions()).toContain("medaris_nazim.dismiss");
        await del(`/nizam/medaris-nazims/${HASAN}`, { decisions: [] }).expect(
          404
        );
        // the group itself is untouched
        expect(
          (await get("/nizam/permission-groups").expect(200)).body[0].userCount
        ).toBe(0);
      });

      it("lists what the person handed on and demands one answer for each", async () => {
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          permissions: [],
        }).expect(201);
        const [kosk] = await db
          .insert(kosks)
          .values({ ownerId: KOSK_OWNER, name: "Nûruosmaniye Köşkü" })
          .returning();
        await assignRole(db, {
          userId: RABIA,
          role: ASSIGNED_ROLES.KOSK_NAZIM,
          scopeId: kosk.id,
          grantedBy: HASAN,
        });
        await db.insert(permissionGrants).values({
          userId: TALEBE,
          scopeType: "kosk",
          scopeId: kosk.id,
          permission: "course.edit",
          grantedBy: HASAN,
        });

        const given = (
          await get(`/nizam/medaris-nazims/${HASAN}/given`).expect(200)
        ).body;
        expect(given).toHaveLength(2);
        expect(given[0]).toMatchObject({
          kind: "ROLE",
          role: "KOSK_NAZIM",
          scopeName: "Nûruosmaniye Köşkü",
          to: { id: RABIA, name: "Rabia Tokatlıoğlu" },
        });
        expect(given[1]).toMatchObject({
          kind: "GRANT",
          permission: "course.edit",
        });

        for (const decisions of [
          [],
          [{ kind: "ROLE", id: given[0].id, action: "DROP" }],
          [
            { kind: "ROLE", id: given[0].id, action: "DROP" },
            { kind: "ROLE", id: given[0].id, action: "DROP" },
          ],
          [
            { kind: "ROLE", id: given[0].id, action: "DROP" },
            { kind: "GRANT", id: given[1].id, action: "DROP" },
            {
              kind: "GRANT",
              id: "c0000000-0000-4000-8000-0000000000ff",
              action: "DROP",
            },
          ],
        ]) {
          const r = await del(`/nizam/medaris-nazims/${HASAN}`, {
            decisions,
          }).expect(400);
          expect(r.body.code).toBe("DISMISS_DECISIONS_INCOMPLETE");
        }
        // nothing happened to the person
        expect(
          (await get("/nizam/medaris-nazims").expect(200)).body
        ).toHaveLength(1);

        await del(`/nizam/medaris-nazims/${HASAN}`, {
          decisions: [
            { kind: "ROLE", id: given[0].id, action: "TAKE_OVER" },
            { kind: "GRANT", id: given[1].id, action: "DROP" },
          ],
        }).expect(204);

        const [role] = await db
          .select()
          .from(roleAssignments)
          .where(eq(roleAssignments.id, given[0].id));
        expect(role.grantedBy).toBe(ADMIN);
        expect(role.revokedAt).toBeNull();
        const [grant] = await db
          .select()
          .from(permissionGrants)
          .where(eq(permissionGrants.id, given[1].id));
        expect(grant.revokedBy).toBe(ADMIN);
        expect(grant.revokedAt).not.toBeNull();
      });

      it("lists what the person made for themselves and revokes it with the appointment (review H4)", async () => {
        await post("/nizam/medaris-nazims", {
          userId: HASAN,
          permissions: [],
        }).expect(201);
        const [kosk] = await db
          .insert(kosks)
          .values({ ownerId: KOSK_OWNER, name: "Nûruosmaniye Köşkü" })
          .returning();
        // Rows no route lets a Medaris nazımı write any more (the self-grant
        // guard), as an older database or a script could have left them: a
        // köşk seat and a grant he gave himself, and a seat he gave Rabia.
        await assignRole(db, {
          userId: HASAN,
          role: ASSIGNED_ROLES.KOSK_NAZIM,
          scopeId: kosk.id,
          grantedBy: HASAN,
        });
        await db.insert(permissionGrants).values({
          userId: HASAN,
          scopeType: "kosk",
          scopeId: kosk.id,
          permission: "course.edit",
          grantedBy: HASAN,
        });
        await assignRole(db, {
          userId: RABIA,
          role: ASSIGNED_ROLES.KOSK_NAZIM,
          scopeId: kosk.id,
          grantedBy: HASAN,
        });

        const given = (
          await get(`/nizam/medaris-nazims/${HASAN}/given`).expect(200)
        ).body as Array<{ id: string; kind: string; to: { id: string } }>;
        expect(given).toHaveLength(3);
        expect(given.filter((g) => g.to.id === HASAN)).toHaveLength(2);

        // An answer is owed for what went to others only; the rest is revoked.
        const toRabia = given.find((g) => g.to.id === RABIA);
        await del(`/nizam/medaris-nazims/${HASAN}`, {
          decisions: [{ kind: "ROLE", id: toRabia?.id, action: "TAKE_OVER" }],
        }).expect(204);

        expect(
          await db
            .select()
            .from(roleAssignments)
            .where(
              and(
                eq(roleAssignments.userId, HASAN),
                isNull(roleAssignments.revokedAt)
              )
            )
        ).toEqual([]);
        expect(
          await db
            .select()
            .from(permissionGrants)
            .where(
              and(
                eq(permissionGrants.userId, HASAN),
                isNull(permissionGrants.revokedAt)
              )
            )
        ).toEqual([]);
        // Rabia kept hers, now under the başnazım's name.
        const [kept] = await db
          .select()
          .from(roleAssignments)
          .where(eq(roleAssignments.id, toRabia?.id ?? ""));
        expect(kept).toMatchObject({ grantedBy: ADMIN, revokedAt: null });
      });
    });
  });

  describe("the migration", () => {
    it("lets a course group and a course grant name no course, and keeps a köşk's naming one", async () => {
      await expect(
        db.insert(permissionGroups).values({
          scopeType: "kosk",
          name: "bad",
          createdBy: ADMIN,
        })
      ).rejects.toThrow();
      await expect(
        db.insert(permissionGroups).values({
          scopeType: "platform",
          scopeId: "c0000000-0000-4000-8000-0000000000ff",
          name: "bad",
          createdBy: ADMIN,
        })
      ).rejects.toThrow();
      await expect(
        db.insert(permissionGrants).values({
          userId: HASAN,
          scopeType: "madrasah",
          permission: "course.edit",
          grantedBy: ADMIN,
        })
      ).rejects.toThrow();
    });
  });
});
