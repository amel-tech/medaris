import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { COURSE_CATALOG } from "../../src/assignment/permission-catalog";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
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
 * MDRS-172, nizam/38: the köşk's İzinler page — ders nazırları of the köşk's
 * medrese-free courses and the course permissions they hold — against a real
 * Postgres. Only the realm's directory is replaced.
 */
const ADMIN = "e0000000-0000-4000-8000-000000000001";
const NAZIM = "e0000000-0000-4000-8000-000000000002";
const OTHER_NAZIM = "e0000000-0000-4000-8000-000000000003";
const YUSUF = "e0000000-0000-4000-8000-000000000004";
const TALEBE = "e0000000-0000-4000-8000-000000000005";
const NEWCOMER = "e0000000-0000-4000-8000-000000000006";
const GHOST = "e0000000-0000-4000-8000-000000000007";

const claims: Record<string, Record<string, unknown>> = {
  [ADMIN]: {
    email: "basnazim@example.com",
    realm_access: { roles: [ROLES.SYSTEM_ADMIN] },
  },
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
      lastName: "Nazır",
      enabled: true,
    });
  }
  return json({}, 404);
}

const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

describe("Köşk grants (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let koskA: string;
  let koskB: string;
  let freeCourse: string;
  let madrasahCourse: string;
  let foreignCourse: string;

  const http = () => request(app.getHttpServer());
  const get = (path: string, sub = NAZIM) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (path: string, body: unknown, sub = NAZIM) =>
    http()
      .post(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const patch = (path: string, body: unknown, sub = NAZIM) =>
    http()
      .patch(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const del = (path: string, sub = NAZIM) =>
    http().delete(path).set("Authorization", auth(sub));

  const grantsOf = async (userId: string, courseId = freeCourse) =>
    db
      .select()
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          eq(permissionGrants.scopeId, courseId)
        )
      );
  const postsOf = async (userId: string) =>
    db.select().from(roleAssignments).where(eq(roleAssignments.userId, userId));
  const auditActions = async () =>
    (await db.select({ action: auditLog.action }).from(auditLog)).map(
      (r) => r.action
    );

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

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );

  beforeEach(async () => {
    await clean();
    await db.insert(users).values([
      {
        id: ADMIN,
        email: "basnazim@example.com",
        givenName: "Yusuf Ziya",
        familyName: "Ertuğrul",
      },
      {
        id: NAZIM,
        email: "abdulhamit@example.com",
        givenName: "Abdülhamit",
        familyName: "Karaosmanoğlu",
      },
      {
        id: OTHER_NAZIM,
        email: "other@example.com",
        givenName: "Öteki",
        familyName: "Nazım",
      },
      {
        id: YUSUF,
        email: "yusufkerem@example.com",
        givenName: "Yusuf Kerem",
        familyName: "Aydınoğlu",
      },
      {
        id: TALEBE,
        email: "talebe@example.com",
        givenName: "Talebe",
        familyName: "Bir",
      },
    ]);
    const [a, b] = await db
      .insert(kosks)
      .values([
        { ownerId: NAZIM, name: "Nûruosmaniye Köşkü", handle: "nuruosmaniye" },
        { ownerId: OTHER_NAZIM, name: "Beyazıt Köşkü", handle: "beyazit" },
      ])
      .returning();
    koskA = a.id;
    koskB = b.id;
    await assignRole(db, {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskA,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: OTHER_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskB,
      grantedBy: ADMIN,
    });
    const [madrasah] = await db
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN,
      })
      .returning();
    const rows = await db
      .insert(courses)
      .values([
        {
          koskId: koskA,
          authorId: NAZIM,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: koskA,
          authorId: NAZIM,
          title: "Maksûd şerhi",
          status: CourseStatus.PUBLISHED,
          madrasahId: madrasah.id,
        },
        {
          koskId: koskB,
          authorId: OTHER_NAZIM,
          title: "Başka köşkün dersi",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    [freeCourse, madrasahCourse, foreignCourse] = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  const create = (body: Record<string, unknown>, sub = NAZIM) =>
    post(
      `/kosks/${koskA}/grants`,
      {
        userId: YUSUF,
        courseId: freeCourse,
        permissions: ["session.manage", "session.live_link", "week.hide"],
        ...body,
      },
      sub
    );

  /**
   * A ders nazırı of the medrese's course, made from the course itself
   * (MDRS-270) by the başnazım, with an end. Returns the post's id.
   */
  const medresePost = async () => {
    await post(
      `/courses/${madrasahCourse}/nazirs`,
      {
        userId: YUSUF,
        permissions: ["session.manage"],
        endsAt: daysFromNow(10),
      },
      ADMIN
    ).expect(201);
    const [row] = await postsOf(YUSUF);
    return row.id;
  };

  describe("who may call", () => {
    it("lets the köşk's nazım and the başnazım in, and nobody else", async () => {
      await get(`/kosks/${koskA}/grants`).expect(200);
      await get(`/kosks/${koskA}/grants`, ADMIN).expect(200);
      await get(`/kosks/${koskA}/grants`, OTHER_NAZIM).expect(403);
      await get(`/kosks/${koskA}/grants`, TALEBE).expect(403);
      await create({}, OTHER_NAZIM).expect(403);
      await create({}, TALEBE).expect(403);
      expect(await postsOf(YUSUF)).toHaveLength(0);
    });

    it("answers 404 for a köşk that does not exist", async () => {
      await get("/kosks/e0000000-0000-4000-8000-0000000000ff/grants").expect(
        404
      );
    });
  });

  describe("GET /kosks/:id/grants", () => {
    it("lists the köşk's courses, the codes the caller may hand out and no posts at first", async () => {
      const res = await get(`/kosks/${koskA}/grants`).expect(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.grantable).toEqual([...COURSE_CATALOG]);
      expect(res.body.courses).toEqual([
        { id: freeCourse, title: "Emsile ve Bina", madrasahName: null },
        {
          id: madrasahCourse,
          title: "Maksûd şerhi",
          madrasahName: "Süleymaniye Medresesi",
        },
      ]);
    });
  });

  describe("POST /kosks/:id/grants (criteria 1, 5)", () => {
    it("makes a ders nazırı, gives the permissions and shows them with end and giver", async () => {
      const endsAt = daysFromNow(30);
      const res = await create({ endsAt }).expect(201);
      expect(res.body.items).toHaveLength(1);
      const [item] = res.body.items;
      expect(item).toMatchObject({
        user: { id: YUSUF, name: "Yusuf Kerem Aydınoğlu" },
        course: { id: freeCourse, title: "Emsile ve Bina" },
        grantedBy: { id: NAZIM, name: "Abdülhamit Karaosmanoğlu" },
      });
      expect([...item.permissions].sort()).toEqual([
        "session.live_link",
        "session.manage",
        "week.hide",
      ]);
      expect(new Date(item.endsAt).toISOString()).toBe(endsAt);

      // the post and every permission end at the same instant
      const [post] = await postsOf(YUSUF);
      expect(post.role).toBe(ASSIGNED_ROLES.DERS_NAZIR);
      expect(post.expiresAt?.toISOString()).toBe(endsAt);
      for (const grant of await grantsOf(YUSUF)) {
        expect(grant.expiresAt?.toISOString()).toBe(endsAt);
        expect(grant.grantedBy).toBe(NAZIM);
      }
      expect(await auditActions()).toContain("course_nazir.assign");
    });

    it("names a person who never signed in from the realm directory", async () => {
      const res = await create({ userId: NEWCOMER }).expect(201);
      expect(res.body.items[0].user).toMatchObject({
        id: NEWCOMER,
        name: "Yeni Nazır",
      });
    });

    it("refuses a code outside the course catalog, whoever holds it (400)", async () => {
      const res = await create({
        permissions: ["session.manage", "platform.audit_read"],
      }).expect(400);
      expect(res.body.code).toBe("PERMISSION_UNKNOWN");
      expect(await postsOf(YUSUF)).toHaveLength(0);
    });

    it("refuses an empty set, an end in the past, an unknown account and a bad body", async () => {
      await create({ permissions: [] }).expect(400);
      await create({ endsAt: daysFromNow(-1) }).expect(400);
      await create({ userId: GHOST }).expect(404);
      await create({ userId: "nobody" }).expect(400);
      expect(await postsOf(YUSUF)).toHaveLength(0);
    });

    it("refuses a medrese's course and another köşk's course (400)", async () => {
      for (const courseId of [madrasahCourse, foreignCourse]) {
        const res = await create({ courseId }).expect(400);
        expect(res.body.code).toBe("GRANT_COURSE_INVALID");
      }
      expect(await postsOf(YUSUF)).toHaveLength(0);
    });

    it("refuses a second post of the same person in the same course (409)", async () => {
      await create({}).expect(201);
      const res = await create({}).expect(409);
      expect(res.body.code).toBe("COURSE_NAZIR_EXISTS");
    });

    it("lets the başnazım hand out too", async () => {
      await create({}, ADMIN).expect(201);
    });
  });

  describe("PATCH /kosks/:id/grants/:grantId (criterion 3)", () => {
    it("replaces the set, keeps what stays and moves the end of the post with it", async () => {
      await create({}).expect(201);
      const [post] = await postsOf(YUSUF);
      const before = await grantsOf(YUSUF);
      const kept = before.find((g) => g.permission === "session.manage");
      const endsAt = daysFromNow(10);

      const res = await patch(`/kosks/${koskA}/grants/${post.id}`, {
        permissions: ["session.manage", "recording.manage"],
        endsAt,
      }).expect(200);
      expect([...res.body.items[0].permissions].sort()).toEqual([
        "recording.manage",
        "session.manage",
      ]);

      const held = (await grantsOf(YUSUF)).filter((g) => g.revokedAt === null);
      expect(held.map((g) => g.permission).sort()).toEqual([
        "recording.manage",
        "session.manage",
      ]);
      // the one that stayed is the same row
      expect(held.find((g) => g.permission === "session.manage")?.id).toBe(
        kept?.id
      );
      for (const g of held) expect(g.expiresAt?.toISOString()).toBe(endsAt);
      const [after] = await postsOf(YUSUF);
      expect(after.expiresAt?.toISOString()).toBe(endsAt);
      expect(await auditActions()).toContain("course_nazir.update");
    });

    it("null takes the end away", async () => {
      await create({ endsAt: daysFromNow(5) }).expect(201);
      const [post] = await postsOf(YUSUF);
      await patch(`/kosks/${koskA}/grants/${post.id}`, {
        permissions: ["session.manage"],
        endsAt: null,
      }).expect(200);
      expect((await postsOf(YUSUF))[0].expiresAt).toBeNull();
    });

    it("refuses a code outside the catalog, an empty set and an end in the past", async () => {
      await create({}).expect(201);
      const [post] = await postsOf(YUSUF);
      const url = `/kosks/${koskA}/grants/${post.id}`;
      await patch(url, { permissions: ["kosk.manage"] }).expect(400);
      await patch(url, { permissions: [] }).expect(400);
      await patch(url, {
        permissions: ["session.manage"],
        endsAt: daysFromNow(-2),
      }).expect(400);
      expect(
        (await grantsOf(YUSUF)).filter((g) => g.revokedAt === null)
      ).toHaveLength(3);
    });

    it("cannot reach a post of another köşk (404)", async () => {
      await create({}).expect(201);
      const [post] = await postsOf(YUSUF);
      await patch(
        `/kosks/${koskB}/grants/${post.id}`,
        { permissions: ["session.manage"] },
        OTHER_NAZIM
      ).expect(404);
    });

    it("cannot change a post in a medrese course (404), which the course route made", async () => {
      const post = await medresePost();
      const res = await patch(`/kosks/${koskA}/grants/${post}`, {
        permissions: [...COURSE_CATALOG],
        endsAt: null,
      }).expect(404);
      expect(res.body.code).toBe("COURSE_NAZIR_NOT_FOUND");
      const held = (await grantsOf(YUSUF, madrasahCourse)).filter(
        (g) => g.revokedAt === null
      );
      expect(held.map((g) => g.permission)).toEqual(["session.manage"]);
      expect(held[0].expiresAt).not.toBeNull();
    });
  });

  describe("DELETE /kosks/:id/grants/:grantId (criterion 4)", () => {
    it("ends the post and every permission at once, keeping the rows as history", async () => {
      await create({}).expect(201);
      const [post] = await postsOf(YUSUF);
      await del(`/kosks/${koskA}/grants/${post.id}`).expect(204);

      const [after] = await postsOf(YUSUF);
      expect(after.revokedAt).not.toBeNull();
      expect(after.revokedBy).toBe(NAZIM);
      const grants = await grantsOf(YUSUF);
      expect(grants).toHaveLength(3);
      for (const g of grants) expect(g.revokedAt).not.toBeNull();
      expect(await auditActions()).toContain("course_nazir.revoke");

      const res = await get(`/kosks/${koskA}/grants`).expect(200);
      expect(res.body.items).toEqual([]);
    });

    it("answers 404 for a post that is gone or another köşk's", async () => {
      await create({}).expect(201);
      const [post] = await postsOf(YUSUF);
      await del(`/kosks/${koskB}/grants/${post.id}`, OTHER_NAZIM).expect(404);
      await del(`/kosks/${koskA}/grants/${post.id}`).expect(204);
      await del(`/kosks/${koskA}/grants/${post.id}`).expect(404);
    });

    it("cannot end a post in a medrese course (404), which the course route made", async () => {
      const post = await medresePost();
      const res = await del(`/kosks/${koskA}/grants/${post}`).expect(404);
      expect(res.body.code).toBe("COURSE_NAZIR_NOT_FOUND");
      const [held] = await postsOf(YUSUF);
      expect(held.revokedAt).toBeNull();
      expect(
        (await grantsOf(YUSUF, madrasahCourse)).filter(
          (g) => g.revokedAt === null
        )
      ).toHaveLength(1);
    });

    it("lets the same person be made a ders nazırı again afterwards", async () => {
      await create({}).expect(201);
      const [post] = await postsOf(YUSUF);
      await del(`/kosks/${koskA}/grants/${post.id}`).expect(204);
      await create({}).expect(201);
    });
  });

  describe("an expired post", () => {
    it("is not listed once its end has passed", async () => {
      await create({}).expect(201);
      await db
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(roleAssignments.userId, YUSUF));
      const res = await get(`/kosks/${koskA}/grants`).expect(200);
      expect(res.body.items).toEqual([]);
    });
  });
});
