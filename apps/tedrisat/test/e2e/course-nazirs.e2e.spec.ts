import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, asc, eq, like } from "drizzle-orm";
import request from "supertest";
import { COURSE_CATALOG } from "../../src/assignment/permission-catalog";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
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
 * MDRS-270: a course's ders nazırları from the course itself, against a real
 * Postgres and the real guard. One köşk (Nûruosmaniye) has a course of its
 * own, taught by a müderris, a second one of its own, and a course of the
 * Süleymaniye medrese with its own müderris and başmüderris. Only the realm's
 * directory is replaced.
 *
 * The route lets in `course_nazir.assign`; only a role's own
 * `permission.grant` (or the başnazım) gives permissions, up to what the giver
 * holds in the course; a grant of `course_nazir.assign` appoints with none.
 */
const ADMIN = "e2700000-0000-4000-8000-000000000001";
const NAZIM = "e2700000-0000-4000-8000-000000000002";
const MUDERRIS = "e2700000-0000-4000-8000-000000000003";
const HEAD = "e2700000-0000-4000-8000-000000000004";
const MED_MUDERRIS = "e2700000-0000-4000-8000-000000000005";
const YUSUF = "e2700000-0000-4000-8000-000000000006";
const ZEYNEP = "e2700000-0000-4000-8000-000000000007";
const TALEBE = "e2700000-0000-4000-8000-000000000008";
const MEDARIS = "e2700000-0000-4000-8000-000000000009";
const MED_NAZIR = "e2700000-0000-4000-8000-00000000000a";
const NEWCOMER = "e2700000-0000-4000-8000-00000000000b";
const GHOST = "e2700000-0000-4000-8000-00000000000c";
const BLIP = "e2700000-0000-4000-8000-00000000000d";
const MISSING = "e2700000-0000-4000-8000-0000000000ff";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

/** The realm: NEWCOMER never signed in, GHOST does not exist, BLIP cannot be read. */
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
  if (url.endsWith(`/admin/realms/r/users/${BLIP}`)) return json({}, 500);
  return json({}, 404);
}

const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

describe("Course nazırs (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let freeCourse: string;
  let otherCourse: string;
  let medreseCourse: string;

  const http = () => request(app.getHttpServer());
  const get = (path: string, sub: string) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (path: string, body: unknown, sub: string) =>
    http()
      .post(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const patch = (path: string, body: unknown, sub: string) =>
    http()
      .patch(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const del = (path: string, sub: string) =>
    http().delete(path).set("Authorization", auth(sub));

  const list = (courseId: string) => `/courses/${courseId}/nazirs`;
  const one = (courseId: string, postId: string) =>
    `/courses/${courseId}/nazirs/${postId}`;
  const appoint = (
    courseId: string,
    sub: string,
    body: Record<string, unknown> = {}
  ) => post(list(courseId), { userId: YUSUF, permissions: [], ...body }, sub);

  const postsOf = (userId: string) =>
    db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, ASSIGNED_ROLES.DERS_NAZIR)
        )
      )
      .orderBy(asc(roleAssignments.createdAt));
  const heldPost = async (userId: string, courseId = freeCourse) => {
    const found = (await postsOf(userId)).find(
      (p) => p.scopeId === courseId && p.revokedAt === null
    );
    if (!found) throw new Error(`${userId} holds no post in ${courseId}`);
    return found;
  };
  const grantsOf = (userId: string, courseId = freeCourse) =>
    db
      .select()
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
          eq(permissionGrants.scopeId, courseId)
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
  const liveGrants = async (userId: string, courseId = freeCourse) =>
    (await grantsOf(userId, courseId)).filter((g) => g.revokedAt === null);
  const nazirAudit = () =>
    db
      .select()
      .from(auditLog)
      .where(like(auditLog.action, "course_nazir.%"))
      .orderBy(asc(auditLog.seq));
  const myCodes = async (sub: string, courseId = freeCourse) =>
    (await get(`/courses/${courseId}/my-permissions`, sub).expect(200)).body
      .permissions as string[];
  /** The course's müderris leaves: the course turns passive (MDRS-136). */
  const leaveMedreseCourse = () =>
    db
      .update(roleAssignments)
      .set({ revokedAt: new Date(), revokedBy: HEAD })
      .where(
        and(
          eq(roleAssignments.userId, MED_MUDERRIS),
          eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
        )
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
      "bans",
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );

  beforeEach(async () => {
    await clean();
    const person = (id: string, givenName: string, familyName: string) => ({
      id,
      email: `${givenName.toLowerCase().replace(/\s+/g, "")}@example.com`,
      givenName,
      familyName,
    });
    await db
      .insert(users)
      .values([
        person(ADMIN, "Başnazım", "Ertuğrul"),
        person(NAZIM, "Abdülhamit", "Karaosmanoğlu"),
        person(MUDERRIS, "Musa", "Müderris"),
        person(HEAD, "Halil", "Başmüderris"),
        person(MED_MUDERRIS, "Mahmud", "Medrese"),
        person(YUSUF, "Yusuf Kerem", "Aydınoğlu"),
        person(ZEYNEP, "Zeynep", "Nazır"),
        person(TALEBE, "Talebe", "Bir"),
        person(MEDARIS, "Mehmet", "Nazım"),
        person(MED_NAZIR, "Nuh", "Nazır"),
      ]);
    const [madrasah] = await db
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN,
      })
      .returning();
    madrasahId = madrasah.id;
    const [kosk] = await db
      .insert(kosks)
      .values({ ownerId: NAZIM, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    const rows = await db
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Köşkün öteki dersi",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Maksûd şerhi",
          status: CourseStatus.PUBLISHED,
          madrasahId,
        },
      ])
      .returning();
    [freeCourse, otherCourse, medreseCourse] = rows.map((r) => r.id);
    await assignRole(db, {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: MED_NAZIR,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD,
    });
    for (const [userId, courseId] of [
      [MUDERRIS, freeCourse],
      [MED_MUDERRIS, medreseCourse],
    ]) {
      await assignRole(db, {
        userId,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: courseId,
        grantedBy: NAZIM,
      });
      await db
        .insert(courseMuderris)
        .values({ courseId, userId, name: "Müderris", orderIndex: 0 });
    }
    // The platform has no scope id, which `assignRole` takes for granted.
    await db.insert(roleAssignments).values({
      userId: MEDARIS,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN,
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("who may call", () => {
    it("lets the müderris, the başmüderris, the köşk nazımı, the başnazım and a granted ders nazırı read the list, and nobody else", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["course_nazir.assign"],
      }).expect(201);
      await appoint(freeCourse, MUDERRIS, { userId: ZEYNEP }).expect(201);
      for (const sub of [MUDERRIS, NAZIM, ADMIN, YUSUF]) {
        await get(list(freeCourse), sub).expect(200);
      }
      // a ders nazırı with no permission, the medrese's people, a talebe, a
      // Medaris nazımı with nothing given
      for (const sub of [ZEYNEP, HEAD, MED_MUDERRIS, TALEBE, MEDARIS]) {
        const res = await get(list(freeCourse), sub).expect(403);
        expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      }
      for (const sub of [MED_MUDERRIS, HEAD, NAZIM, ADMIN]) {
        await get(list(medreseCourse), sub).expect(200);
      }
      await get(list(medreseCourse), MUDERRIS).expect(403);

      const zeynep = await heldPost(ZEYNEP);
      await appoint(freeCourse, TALEBE, { userId: NEWCOMER }).expect(403);
      await patch(
        one(freeCourse, zeynep.id),
        { permissions: ["week.hide"], endsAt: null },
        TALEBE
      ).expect(403);
      await del(one(freeCourse, zeynep.id), TALEBE).expect(403);
      expect(await postsOf(NEWCOMER)).toHaveLength(0);
      expect(await liveGrants(ZEYNEP)).toHaveLength(0);
      expect((await heldPost(ZEYNEP)).revokedAt).toBeNull();
    });

    it("answers 404 for a missing course, a malformed id and a course of a hidden köşk", async () => {
      for (const id of [MISSING, "not-a-uuid"]) {
        const res = await get(list(id), MUDERRIS).expect(404);
        expect(res.body.code).toBe("COURSE_NOT_FOUND");
        await appoint(id, ADMIN).expect(404);
      }
      await db
        .update(kosks)
        .set({ archivedAt: new Date(), archivedBy: ADMIN })
        .where(eq(kosks.id, koskId));
      const res = await get(list(freeCourse), MUDERRIS).expect(404);
      expect(res.body.code).toBe("COURSE_NOT_FOUND");
      await appoint(freeCourse, MUDERRIS).expect(404);
      // the people above the course still open it
      await get(list(freeCourse), NAZIM).expect(200);
      await get(list(freeCourse), ADMIN).expect(200);
      expect(await postsOf(YUSUF)).toHaveLength(0);
    });
  });

  describe("GET /courses/:id/nazirs", () => {
    it("lists the posts with their codes, end and appointer, the catalog, what the caller may give and what they may do on each row", async () => {
      const endsAt = daysFromNow(30);
      await appoint(freeCourse, MUDERRIS, {
        permissions: [
          "recording.manage",
          "session.manage",
          "course_nazir.assign",
        ],
        endsAt,
      }).expect(201);
      await appoint(freeCourse, YUSUF, { userId: ZEYNEP }).expect(201);
      const yusuf = await heldPost(YUSUF);
      const zeynep = await heldPost(ZEYNEP);

      const asMuderris = (await get(list(freeCourse), MUDERRIS).expect(200))
        .body;
      expect(asMuderris.course).toEqual({
        id: freeCourse,
        title: "Emsile ve Bina",
        madrasahName: null,
      });
      expect(asMuderris.catalog).toEqual([...COURSE_CATALOG]);
      expect(asMuderris.grantable).toEqual([...COURSE_CATALOG]);
      expect(asMuderris.mayAppoint).toBe(true);
      expect(asMuderris.items).toHaveLength(2);
      const [first, second] = asMuderris.items;
      expect(first).toMatchObject({
        id: yusuf.id,
        user: {
          id: YUSUF,
          name: "Yusuf Kerem Aydınoğlu",
          email: "yusufkerem@example.com",
        },
        // the catalog's order, not the order given
        permissions: [
          "session.manage",
          "recording.manage",
          "course_nazir.assign",
        ],
        grantedBy: { id: MUDERRIS, name: "Musa Müderris" },
        mayEdit: true,
        mayEnd: true,
      });
      expect(new Date(first.endsAt).toISOString()).toBe(endsAt);
      expect(new Date(first.grantedAt).getTime()).toBe(
        yusuf.createdAt.getTime()
      );
      expect(second).toMatchObject({
        id: zeynep.id,
        user: { id: ZEYNEP },
        permissions: [],
        endsAt: null,
        grantedBy: { id: YUSUF, name: "Yusuf Kerem Aydınoğlu" },
        mayEdit: true,
        mayEnd: true,
      });

      // the appointer: gives nothing, changes nothing, ends only their own appointee
      const asYusuf = (await get(list(freeCourse), YUSUF).expect(200)).body;
      expect(asYusuf.grantable).toEqual([]);
      expect(asYusuf.mayAppoint).toBe(true);
      expect(
        asYusuf.items.map((i: { mayEdit: boolean; mayEnd: boolean }) => [
          i.mayEdit,
          i.mayEnd,
        ])
      ).toEqual([
        [false, false],
        [false, true],
      ]);

      // the köşk nazımı in a medrese course reads, and may do nothing there
      const asNazim = (await get(list(medreseCourse), NAZIM).expect(200)).body;
      expect(asNazim.course.madrasahName).toBe("Süleymaniye Medresesi");
      expect(asNazim.grantable).toEqual([]);
      expect(asNazim.mayAppoint).toBe(false);
    });

    it("offers a giver who holds a post no change of their own row, which the self guard would refuse", async () => {
      await appoint(freeCourse, MUDERRIS).expect(201);
      await appoint(freeCourse, MUDERRIS, { userId: ZEYNEP }).expect(201);
      // made a co-nazımı of the köşk later: a giver here, still holding the post
      await assignRole(db, {
        userId: YUSUF,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: koskId,
        grantedBy: ADMIN,
      });
      const { items } = (await get(list(freeCourse), YUSUF).expect(200)).body;
      const rows = Object.fromEntries(
        (
          items as Array<{
            user: { id: string };
            mayEdit: boolean;
            mayEnd: boolean;
          }>
        ).map((item) => [item.user.id, [item.mayEdit, item.mayEnd]])
      );
      expect(rows).toEqual({
        [YUSUF]: [false, true],
        [ZEYNEP]: [true, true],
      });
      const own = await heldPost(YUSUF);
      const res = await patch(
        one(freeCourse, own.id),
        { permissions: ["week.hide"], endsAt: null },
        YUSUF
      ).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
    });
  });

  describe("POST /courses/:id/nazirs (criterion 1)", () => {
    it("appoints a ders nazırı with codes and an end, writes the post, the grants at the course's authority and one audit row", async () => {
      const endsAt = daysFromNow(30);
      const res = await appoint(freeCourse, MUDERRIS, {
        permissions: ["session.manage", "recording.manage"],
        endsAt,
      }).expect(201);
      expect(res.body.items).toHaveLength(1);

      const post = await heldPost(YUSUF);
      expect(post).toMatchObject({
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeType: SCOPE_TYPES.COURSE,
        grantedBy: MUDERRIS,
      });
      expect(post.expiresAt?.toISOString()).toBe(endsAt);
      const grants = await grantsOf(YUSUF);
      expect(grants.map((g) => g.permission).sort()).toEqual([
        "recording.manage",
        "session.manage",
      ]);
      for (const grant of grants) {
        expect(grant).toMatchObject({
          grantedBy: MUDERRIS,
          authorityScopeType: SCOPE_TYPES.COURSE,
          groupId: null,
        });
        // the post and every permission end at the same instant
        expect(grant.expiresAt?.toISOString()).toBe(endsAt);
      }
      expect(await nazirAudit()).toMatchObject([
        {
          actorId: MUDERRIS,
          action: "course_nazir.assign",
          entity: "course",
          entityId: freeCourse,
          details: {
            via: "course",
            postId: post.id,
            userId: YUSUF,
            permissions: ["session.manage", "recording.manage"],
            endsAt,
            standing: "giver",
            authority: "course",
            revokedLeftovers: [],
          },
        },
      ]);
    });

    it("gives the ders nazırı exactly what was chosen: my-permissions lists it and a route not given refuses", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["recording.manage", "session.manage"],
      }).expect(201);
      expect(await myCodes(YUSUF)).toEqual([
        "course.enroll",
        "course.view",
        "course.view_details",
        "recording.manage",
        "session.manage",
      ]);
      const res = await patch(
        `/courses/${freeCourse}`,
        { title: "Yeni ad" },
        YUSUF
      ).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      // and nothing in the course beside it
      expect(await myCodes(YUSUF, otherCourse)).toEqual([
        "course.enroll",
        "course.view",
      ]);
    });

    it("names a person who never signed in from the realm directory", async () => {
      const res = await appoint(freeCourse, MUDERRIS, {
        userId: NEWCOMER,
      }).expect(201);
      expect(res.body.items[0].user).toEqual({
        id: NEWCOMER,
        name: "Yeni Nazır",
        email: "yeni@example.com",
      });
    });
  });

  describe("POST refusals", () => {
    const nothingWritten = async () => {
      expect(await postsOf(YUSUF)).toHaveLength(0);
      expect(await grantsOf(YUSUF)).toHaveLength(0);
      expect(await nazirAudit()).toHaveLength(0);
    };

    it("refuses a code outside the course catalog (permission.grant, course.open_standalone, user.lookup)", async () => {
      for (const code of [
        "permission.grant",
        "course.open_standalone",
        "user.lookup",
        "permission_group.define",
        "platform.audit_read",
      ]) {
        for (const sub of [MUDERRIS, NAZIM, ADMIN]) {
          const res = await appoint(freeCourse, sub, {
            permissions: ["session.manage", code],
          }).expect(400);
          expect(res.body.code).toBe("PERMISSION_UNKNOWN");
          expect(res.body.context.codes).toEqual([code]);
        }
      }
      await nothingWritten();
    });

    it("refuses an end in the past, an unknown account, an unknown property, 41 codes and a missing userId, writing nothing", async () => {
      const past = await appoint(freeCourse, MUDERRIS, {
        endsAt: daysFromNow(-1),
      }).expect(400);
      expect(past.body.code).toBe("GRANT_EXPIRY_INVALID");
      const ghost = await appoint(freeCourse, MUDERRIS, {
        userId: GHOST,
      }).expect(404);
      expect(ghost.body.code).toBe("COURSE_NAZIR_UNKNOWN_ACCOUNT");
      // a directory that does not answer is not "unknown"
      const blip = await appoint(freeCourse, MUDERRIS, {
        userId: BLIP,
      }).expect(503);
      expect(blip.body.code).toBe("KEYCLOAK_ADMIN_UNAVAILABLE");
      for (const body of [
        { courseId: freeCourse },
        { permissions: Array.from({ length: 41 }, () => "week.hide") },
        { userId: undefined },
        { userId: "nobody" },
        { permissions: "week.hide" },
        { endsAt: "yarın" },
      ]) {
        const res = await appoint(freeCourse, MUDERRIS, body).expect(400);
        expect(res.body.code).toBe("VALIDATION_ERROR");
      }
      await nothingWritten();
      expect(await postsOf(GHOST)).toHaveLength(0);
      expect(await postsOf(BLIP)).toHaveLength(0);
    });

    it("refuses an end that names no instant (a basic-format date, 30 February), on POST and on PATCH", async () => {
      const year = new Date().getUTCFullYear() + 1;
      const basic = await appoint(freeCourse, MUDERRIS, {
        endsAt: `${year}1231`,
      }).expect(400);
      expect(basic.body.code).toBe("GRANT_EXPIRY_INVALID");
      const rolled = await appoint(freeCourse, MUDERRIS, {
        endsAt: `${year}-02-30T10:00:00Z`,
      }).expect(400);
      expect(rolled.body.code).toBe("VALIDATION_ERROR");
      await nothingWritten();

      await appoint(freeCourse, MUDERRIS, {
        permissions: ["week.hide"],
      }).expect(201);
      const path = one(freeCourse, (await heldPost(YUSUF)).id);
      for (const [endsAt, code] of [
        [`${year}1231`, "GRANT_EXPIRY_INVALID"],
        [`${year}-02-30T10:00:00Z`, "VALIDATION_ERROR"],
      ]) {
        const res = await patch(
          path,
          { permissions: ["week.hide"], endsAt },
          MUDERRIS
        ).expect(400);
        expect(res.body.code).toBe(code);
      }
      expect((await heldPost(YUSUF)).expiresAt).toBeNull();
      expect((await liveGrants(YUSUF))[0].expiresAt).toBeNull();
    });

    it("refuses a second post of the same person (409 COURSE_NAZIR_EXISTS)", async () => {
      await appoint(freeCourse, MUDERRIS).expect(201);
      const res = await appoint(freeCourse, NAZIM, {
        permissions: ["week.hide"],
      }).expect(409);
      expect(res.body.code).toBe("COURSE_NAZIR_EXISTS");
      expect(await postsOf(YUSUF)).toHaveLength(1);
      expect(await grantsOf(YUSUF)).toHaveLength(0);
      // one post per course, not per person: another course is another post
      await appoint(otherCourse, NAZIM).expect(201);
    });

    it("refuses the course's müderris, a nazır of its medrese and a Medaris nazımı (409 COURSE_NAZIR_HOLDS_SEAT)", async () => {
      for (const userId of [MED_MUDERRIS, MED_NAZIR, MEDARIS]) {
        const res = await appoint(medreseCourse, HEAD, {
          userId,
          permissions: ["week.hide"],
        }).expect(409);
        expect(res.body.code).toBe("COURSE_NAZIR_HOLDS_SEAT");
        expect(await postsOf(userId)).toHaveLength(0);
        expect(await grantsOf(userId, medreseCourse)).toHaveLength(0);
      }
      // nor the köşk's nazımı, in a course of the köşk
      const res = await appoint(freeCourse, MUDERRIS, {
        userId: NAZIM,
      }).expect(409);
      expect(res.body.code).toBe("COURSE_NAZIR_HOLDS_SEAT");
      expect(await nazirAudit()).toHaveLength(0);
      // a müderris of another course is no seat over this one
      await appoint(freeCourse, NAZIM, { userId: MED_MUDERRIS }).expect(201);
    });

    it("refuses an account barred from the course, so an appointer cannot seat again whom the müderris barred (409 COURSE_NAZIR_BARRED)", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["course_nazir.assign"],
      }).expect(201);
      // A post, even one with no permission, keeps its holder from a ban.
      await appoint(freeCourse, YUSUF, { userId: TALEBE }).expect(201);
      const ban = { userId: TALEBE, scope: "COURSE", reason: "Düzeni bozdu." };
      const shielded = await post(
        `/courses/${freeCourse}/bans`,
        ban,
        MUDERRIS
      ).expect(400);
      expect(shielded.body.code).toBe("BAN_TARGET_INVALID");
      // the müderris ends the post first, then bars him
      await del(one(freeCourse, (await heldPost(TALEBE)).id), MUDERRIS).expect(
        204
      );
      await post(`/courses/${freeCourse}/bans`, ban, MUDERRIS).expect(201);

      const written = (await nazirAudit()).length;
      for (const sub of [YUSUF, MUDERRIS]) {
        const res = await appoint(freeCourse, sub, { userId: TALEBE }).expect(
          409
        );
        expect(res.body.code).toBe("COURSE_NAZIR_BARRED");
      }
      // a köşk ban placed from another course of the köşk bars him here too
      await post(
        `/courses/${otherCourse}/bans`,
        { userId: ZEYNEP, scope: "KOSK", reason: "Düzeni bozdu." },
        NAZIM
      ).expect(201);
      const res = await appoint(freeCourse, NAZIM, { userId: ZEYNEP }).expect(
        409
      );
      expect(res.body.code).toBe("COURSE_NAZIR_BARRED");
      for (const userId of [TALEBE, ZEYNEP]) {
        expect(
          (await postsOf(userId)).filter((p) => p.revokedAt === null)
        ).toHaveLength(0);
      }
      expect(await nazirAudit()).toHaveLength(written);
    });

    it("refuses a hidden course (400 GRANT_COURSE_INVALID)", async () => {
      await db
        .update(courses)
        .set({ archivedAt: new Date(), archivedBy: NAZIM })
        .where(eq(courses.id, freeCourse));
      for (const sub of [NAZIM, ADMIN]) {
        const res = await appoint(freeCourse, sub).expect(400);
        expect(res.body.code).toBe("GRANT_COURSE_INVALID");
      }
      expect(
        (await get(list(freeCourse), NAZIM).expect(200)).body.mayAppoint
      ).toBe(false);
      // the müderris does not see the course the köşk hid
      await appoint(freeCourse, MUDERRIS).expect(404);
      await nothingWritten();
    });

    it("does not revive a permission left open from an earlier post", async () => {
      // A post that ran out with a permission whose own end never came.
      await db.insert(roleAssignments).values({
        userId: YUSUF,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: freeCourse,
        grantedBy: NAZIM,
        expiresAt: new Date(Date.now() - 60_000),
      });
      const [leftover] = await db
        .insert(permissionGrants)
        .values({
          userId: YUSUF,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: freeCourse,
          permission: "course.edit",
          grantedBy: NAZIM,
        })
        .returning();

      await appoint(freeCourse, MUDERRIS, {
        permissions: ["week.hide"],
      }).expect(201);
      expect(await myCodes(YUSUF)).not.toContain("course.edit");
      const [gone] = (await grantsOf(YUSUF)).filter(
        (g) => g.id === leftover.id
      );
      expect(gone.revokedAt).not.toBeNull();
      expect(gone.revokedBy).toBe(MUDERRIS);
      // the lapsed post is closed too, so one post is held
      expect(
        (await postsOf(YUSUF)).filter((p) => p.revokedAt === null)
      ).toHaveLength(1);
      const [row] = await nazirAudit();
      expect(row.details).toMatchObject({ revokedLeftovers: [leftover.id] });
    });
  });

  describe("a medrese course (rule 7)", () => {
    it("lets its müderris and its başmüderris appoint, at the course's and the medrese's level", async () => {
      await appoint(medreseCourse, MED_MUDERRIS, {
        permissions: ["session.manage"],
      }).expect(201);
      await appoint(medreseCourse, HEAD, {
        userId: ZEYNEP,
        permissions: ["session.manage"],
      }).expect(201);
      expect(await grantsOf(YUSUF, medreseCourse)).toMatchObject([
        { grantedBy: MED_MUDERRIS, authorityScopeType: SCOPE_TYPES.COURSE },
      ]);
      expect(await grantsOf(ZEYNEP, medreseCourse)).toMatchObject([
        { grantedBy: HEAD, authorityScopeType: SCOPE_TYPES.MADRASAH },
      ]);
      expect(
        (await nazirAudit()).map((r) => [r.actorId, r.details.authority])
      ).toEqual([
        [MED_MUDERRIS, "course"],
        [HEAD, "madrasah"],
      ]);
    });

    it("refuses the köşk nazımı every write there and writes nothing, but lets him read the list", async () => {
      await appoint(medreseCourse, HEAD, {
        permissions: ["session.manage"],
      }).expect(201);
      const yusuf = await heldPost(YUSUF, medreseCourse);
      const before = await grantsOf(YUSUF, medreseCourse);

      const read = await get(list(medreseCourse), NAZIM).expect(200);
      expect(read.body.items).toHaveLength(1);
      expect(read.body.items[0]).toMatchObject({
        mayEdit: false,
        mayEnd: false,
      });
      for (const res of [
        await appoint(medreseCourse, NAZIM, { userId: ZEYNEP }),
        await patch(
          one(medreseCourse, yusuf.id),
          { permissions: ["session.manage", "week.hide"], endsAt: null },
          NAZIM
        ),
        await del(one(medreseCourse, yusuf.id), NAZIM),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("PERMISSION_NOT_GIVABLE");
      }
      expect(await postsOf(ZEYNEP)).toHaveLength(0);
      expect(await grantsOf(YUSUF, medreseCourse)).toEqual(before);
      expect((await heldPost(YUSUF, medreseCourse)).revokedAt).toBeNull();
      expect(await nazirAudit()).toHaveLength(1);
      // the başnazım is no köşk nazımı: he may
      await appoint(medreseCourse, ADMIN, { userId: ZEYNEP }).expect(201);
    });
  });

  describe("the ceiling (criterion 2)", () => {
    it("refuses a başmüderris on a passive course a content code he cannot hold (403 GRANT_EXCEEDS_GIVER) and writes nothing", async () => {
      await leaveMedreseCourse();
      const listed = (await get(list(medreseCourse), HEAD).expect(200)).body;
      expect(listed.grantable).toContain("course.settings");
      expect(listed.grantable).not.toContain("course.edit");

      const res = await appoint(medreseCourse, HEAD, {
        permissions: ["course.settings", "course.edit", "session.manage"],
      }).expect(403);
      expect(res.body.code).toBe("GRANT_EXCEEDS_GIVER");
      expect(res.body.context.codes).toEqual(["course.edit", "session.manage"]);
      expect(await postsOf(YUSUF)).toHaveLength(0);
      expect(await grantsOf(YUSUF, medreseCourse)).toHaveLength(0);
      expect(await nazirAudit()).toHaveLength(0);
      // what is no content he still hands on
      await appoint(medreseCourse, HEAD, {
        permissions: ["course.settings"],
      }).expect(201);
    });

    it("lets the başnazım give every code, at the platform's level", async () => {
      await appoint(freeCourse, ADMIN, {
        permissions: [...COURSE_CATALOG],
      }).expect(201);
      const grants = await grantsOf(YUSUF);
      expect(grants).toHaveLength(COURSE_CATALOG.length);
      for (const grant of grants) {
        expect(grant.authorityScopeType).toBe(SCOPE_TYPES.PLATFORM);
      }
      const [row] = await nazirAudit();
      expect(row.details).toMatchObject({
        standing: "giver",
        authority: "platform",
      });
    });
  });

  describe("an appointer (criterion 2)", () => {
    beforeEach(async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["course_nazir.assign", "week.hide"],
      }).expect(201);
    });

    it("lets a ders nazırı granted course_nazir.assign appoint with no codes, and refuses any code (403 PERMISSION_NOT_GIVABLE)", async () => {
      await appoint(freeCourse, YUSUF, { userId: ZEYNEP }).expect(201);
      const zeynep = await heldPost(ZEYNEP);
      expect(zeynep.grantedBy).toBe(YUSUF);
      expect(await grantsOf(ZEYNEP)).toHaveLength(0);
      const audit = await nazirAudit();
      expect(audit[audit.length - 1].details).toMatchObject({
        userId: ZEYNEP,
        permissions: [],
        standing: "appointer",
        authority: null,
      });

      // not even what they hold themselves
      for (const permissions of [["week.hide"], ["course_nazir.assign"]]) {
        const res = await appoint(freeCourse, YUSUF, {
          userId: NEWCOMER,
          permissions,
        }).expect(403);
        expect(res.body.code).toBe("PERMISSION_NOT_GIVABLE");
      }
      expect(await postsOf(NEWCOMER)).toHaveLength(0);
      expect(await nazirAudit()).toHaveLength(2);
    });

    it("refuses that ders nazırı any change of a post", async () => {
      await appoint(freeCourse, YUSUF, { userId: ZEYNEP }).expect(201);
      const zeynep = await heldPost(ZEYNEP);
      for (const body of [
        { permissions: [], endsAt: daysFromNow(3) },
        { permissions: ["week.hide"], endsAt: null },
      ]) {
        const res = await patch(one(freeCourse, zeynep.id), body, YUSUF).expect(
          403
        );
        expect(res.body.code).toBe("PERMISSION_NOT_GIVABLE");
      }
      expect((await heldPost(ZEYNEP)).expiresAt).toBeNull();
      expect(await grantsOf(ZEYNEP)).toHaveLength(0);
      expect(
        (await nazirAudit()).filter((r) => r.action === "course_nazir.update")
      ).toHaveLength(0);
    });

    it("lets them end a post they appointed and refuses one they did not (403 NAZIR_NOT_APPOINTED_BY_YOU)", async () => {
      await appoint(freeCourse, YUSUF, { userId: ZEYNEP }).expect(201);
      await appoint(freeCourse, MUDERRIS, {
        userId: NEWCOMER,
        permissions: ["week.hide"],
      }).expect(201);
      const newcomer = await heldPost(NEWCOMER);
      const res = await del(one(freeCourse, newcomer.id), YUSUF).expect(403);
      expect(res.body.code).toBe("NAZIR_NOT_APPOINTED_BY_YOU");
      expect((await heldPost(NEWCOMER)).revokedAt).toBeNull();
      expect(await liveGrants(NEWCOMER)).toHaveLength(1);

      const zeynep = await heldPost(ZEYNEP);
      await del(one(freeCourse, zeynep.id), YUSUF).expect(204);
      expect((await postsOf(ZEYNEP)).every((p) => p.revokedBy === YUSUF)).toBe(
        true
      );
    });

    it("lets a Medaris nazımı with an every-course grant appoint only, and lists the appointment to the başnazım under what they gave", async () => {
      await db.insert(permissionGrants).values({
        userId: MEDARIS,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: null,
        permission: "course_nazir.assign",
        grantedBy: ADMIN,
      });
      await appoint(otherCourse, MEDARIS, { userId: ZEYNEP }).expect(201);
      const res = await appoint(otherCourse, MEDARIS, {
        userId: NEWCOMER,
        permissions: ["week.hide"],
      }).expect(403);
      expect(res.body.code).toBe("PERMISSION_NOT_GIVABLE");
      expect(await postsOf(NEWCOMER)).toHaveLength(0);

      const zeynep = await heldPost(ZEYNEP, otherCourse);
      const given = (
        await get(`/nizam/medaris-nazims/${MEDARIS}/given`, ADMIN).expect(200)
      ).body as Array<{ kind: string; id: string; role: string | null }>;
      expect(given).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "ROLE",
            id: zeynep.id,
            role: ASSIGNED_ROLES.DERS_NAZIR,
          }),
        ])
      );
    });
  });

  describe("PATCH /courses/:id/nazirs/:postId (criterion 3)", () => {
    it("replaces the set, keeps what stays with its giver and date, and moves the post's end with it", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["session.manage", "session.live_link", "week.hide"],
        endsAt: daysFromNow(30),
      }).expect(201);
      const post = await heldPost(YUSUF);
      const before = await grantsOf(YUSUF);
      const kept = before.find((g) => g.permission === "session.manage");
      const endsAt = daysFromNow(10);

      const res = await patch(
        one(freeCourse, post.id),
        { permissions: ["session.manage", "recording.manage"], endsAt },
        NAZIM
      ).expect(200);
      expect(res.body.items[0].permissions).toEqual([
        "session.manage",
        "recording.manage",
      ]);

      const held = await liveGrants(YUSUF);
      expect(held.map((g) => g.permission).sort()).toEqual([
        "recording.manage",
        "session.manage",
      ]);
      // the one that stayed is the same row, with its giver and its date
      const stayed = held.find((g) => g.permission === "session.manage");
      expect(stayed).toMatchObject({
        id: kept?.id,
        grantedBy: MUDERRIS,
        createdAt: kept?.createdAt,
      });
      const added = held.find((g) => g.permission === "recording.manage");
      expect(added).toMatchObject({
        grantedBy: NAZIM,
        authorityScopeType: SCOPE_TYPES.KOSK,
      });
      for (const g of held) expect(g.expiresAt?.toISOString()).toBe(endsAt);
      expect((await heldPost(YUSUF)).expiresAt?.toISOString()).toBe(endsAt);

      const update = (await nazirAudit()).filter(
        (r) => r.action === "course_nazir.update"
      );
      expect(update).toMatchObject([
        {
          actorId: NAZIM,
          entityId: freeCourse,
          details: {
            via: "course",
            postId: post.id,
            userId: YUSUF,
            permissions: ["session.manage", "recording.manage"],
            endsAt,
            authority: "kosk",
            shortened: [{ id: kept?.id }],
            extended: [],
            inserted: [added?.id],
          },
        },
      ]);
      expect([...(update[0].details.revoked as string[])].sort()).toEqual(
        before
          .filter((g) => g.permission !== "session.manage")
          .map((g) => g.id)
          .sort()
      );
    });

    it("takes the end away with null and refuses a missing end", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["session.manage"],
        endsAt: daysFromNow(5),
      }).expect(201);
      const post = await heldPost(YUSUF);
      const path = one(freeCourse, post.id);

      const missing = await patch(
        path,
        { permissions: ["session.manage"] },
        MUDERRIS
      ).expect(400);
      expect(missing.body.code).toBe("VALIDATION_ERROR");
      const past = await patch(
        path,
        { permissions: ["session.manage"], endsAt: daysFromNow(-2) },
        MUDERRIS
      ).expect(400);
      expect(past.body.code).toBe("GRANT_EXPIRY_INVALID");
      const unknown = await patch(
        path,
        { permissions: ["kosk.manage"], endsAt: null },
        MUDERRIS
      ).expect(400);
      expect(unknown.body.code).toBe("PERMISSION_UNKNOWN");
      expect((await heldPost(YUSUF)).expiresAt).not.toBeNull();

      await patch(
        path,
        { permissions: ["session.manage"], endsAt: null },
        MUDERRIS
      ).expect(200);
      expect((await heldPost(YUSUF)).expiresAt).toBeNull();
      const [grant] = await liveGrants(YUSUF);
      expect(grant.expiresAt).toBeNull();
    });

    it("moves a lead row later in place in the actor's name and at their level", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["session.manage"],
        endsAt: daysFromNow(5),
      }).expect(201);
      const post = await heldPost(YUSUF);
      const [lead] = await grantsOf(YUSUF);

      await patch(
        one(freeCourse, post.id),
        { permissions: ["session.manage"], endsAt: null },
        NAZIM
      ).expect(200);
      const rows = await liveGrants(YUSUF);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: lead.id,
        grantedBy: NAZIM,
        authorityScopeType: SCOPE_TYPES.KOSK,
        expiresAt: null,
      });
    });

    it("cannot reach another course's post (404)", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["session.manage"],
      }).expect(201);
      const post = await heldPost(YUSUF);
      const body = { permissions: ["course.edit"], endsAt: null };
      const res = await patch(one(otherCourse, post.id), body, NAZIM).expect(
        404
      );
      expect(res.body.code).toBe("COURSE_NAZIR_NOT_FOUND");
      // nor a role that is no ders nazırı post
      const [seat] = await db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, MUDERRIS));
      await patch(one(freeCourse, seat.id), body, NAZIM).expect(404);
      await patch(one(freeCourse, "not-a-uuid"), body, NAZIM).expect(400);
      expect((await liveGrants(YUSUF)).map((g) => g.permission)).toEqual([
        "session.manage",
      ]);
    });

    it("does not lengthen a row the başnazım made: the müderris's later end is a new row of the course's level beside it", async () => {
      const short = daysFromNow(10);
      await appoint(freeCourse, ADMIN, {
        permissions: ["session.manage"],
        endsAt: short,
      }).expect(201);
      const post = await heldPost(YUSUF);
      const [adminRow] = await grantsOf(YUSUF);
      const long = daysFromNow(30);

      const res = await patch(
        one(freeCourse, post.id),
        { permissions: ["session.manage"], endsAt: long },
        MUDERRIS
      ).expect(200);
      expect(res.body.items[0].permissions).toEqual(["session.manage"]);
      const rows = await liveGrants(YUSUF);
      expect(rows).toHaveLength(2);
      const unchanged = rows.find((g) => g.id === adminRow.id);
      expect(unchanged).toMatchObject({
        grantedBy: ADMIN,
        authorityScopeType: SCOPE_TYPES.PLATFORM,
      });
      expect(unchanged?.expiresAt?.toISOString()).toBe(short);
      const beside = rows.find((g) => g.id !== adminRow.id);
      expect(beside).toMatchObject({
        permission: "session.manage",
        grantedBy: MUDERRIS,
        authorityScopeType: SCOPE_TYPES.COURSE,
      });
      expect(beside?.expiresAt?.toISOString()).toBe(long);
      expect((await heldPost(YUSUF)).expiresAt?.toISOString()).toBe(long);
      const [, update] = await nazirAudit();
      expect(update.details).toMatchObject({
        extended: [{ id: beside?.id, from: short, alongside: adminRow.id }],
        inserted: [],
      });

      // an earlier end shortens both, which gives nothing
      const sooner = daysFromNow(5);
      await patch(
        one(freeCourse, post.id),
        { permissions: ["session.manage"], endsAt: sooner },
        MUDERRIS
      ).expect(200);
      for (const row of await liveGrants(YUSUF)) {
        expect(row.expiresAt?.toISOString()).toBe(sooner);
      }
    });

    it("lets a başmüderris on a passive course shorten a content code he could not give", async () => {
      await appoint(medreseCourse, HEAD, {
        permissions: ["session.manage"],
        endsAt: daysFromNow(30),
      }).expect(201);
      const post = await heldPost(YUSUF, medreseCourse);
      await leaveMedreseCourse();

      const sooner = daysFromNow(10);
      await patch(
        one(medreseCourse, post.id),
        { permissions: ["session.manage"], endsAt: sooner },
        HEAD
      ).expect(200);
      const [row] = await liveGrants(YUSUF, medreseCourse);
      expect(row.expiresAt?.toISOString()).toBe(sooner);

      // more time is handed on again, and he does not hold it any more
      const res = await patch(
        one(medreseCourse, post.id),
        { permissions: ["session.manage"], endsAt: daysFromNow(20) },
        HEAD
      ).expect(403);
      expect(res.body.code).toBe("GRANT_EXCEEDS_GIVER");
      expect(res.body.context.codes).toEqual(["session.manage"]);
      const [after] = await liveGrants(YUSUF, medreseCourse);
      expect(after.expiresAt?.toISOString()).toBe(sooner);
      expect(
        (await heldPost(YUSUF, medreseCourse)).expiresAt?.toISOString()
      ).toBe(sooner);
    });

    it("holds a code added on a passive course to what the başmüderris holds (403 GRANT_EXCEEDS_GIVER), writing nothing", async () => {
      await appoint(medreseCourse, HEAD, {
        permissions: ["course.settings"],
      }).expect(201);
      const post = await heldPost(YUSUF, medreseCourse);
      await leaveMedreseCourse();

      const res = await patch(
        one(medreseCourse, post.id),
        { permissions: ["course.settings", "course.edit"], endsAt: null },
        HEAD
      ).expect(403);
      expect(res.body.code).toBe("GRANT_EXCEEDS_GIVER");
      expect(res.body.context.codes).toEqual(["course.edit"]);
      expect(
        (await liveGrants(YUSUF, medreseCourse)).map((g) => g.permission)
      ).toEqual(["course.settings"]);
      expect(
        (await nazirAudit()).filter((r) => r.action === "course_nazir.update")
      ).toHaveLength(0);
    });

    it("holds the time added beside a başnazım-made row to what the başmüderris holds on a passive course (403), writing nothing", async () => {
      const short = daysFromNow(10);
      await appoint(medreseCourse, ADMIN, {
        permissions: ["session.manage"],
        endsAt: short,
      }).expect(201);
      const post = await heldPost(YUSUF, medreseCourse);
      await leaveMedreseCourse();

      const res = await patch(
        one(medreseCourse, post.id),
        { permissions: ["session.manage"], endsAt: daysFromNow(30) },
        HEAD
      ).expect(403);
      expect(res.body.code).toBe("GRANT_EXCEEDS_GIVER");
      expect(res.body.context.codes).toEqual(["session.manage"]);
      const rows = await liveGrants(YUSUF, medreseCourse);
      expect(rows).toHaveLength(1);
      expect(rows[0].expiresAt?.toISOString()).toBe(short);
      expect(
        (await heldPost(YUSUF, medreseCourse)).expiresAt?.toISOString()
      ).toBe(short);
    });
  });

  describe("DELETE /courses/:id/nazirs/:postId (criterion 4)", () => {
    it("ends the post and every permission the person holds in the course at once, keeping the rows", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["session.manage", "session.live_link", "week.hide"],
      }).expect(201);
      const post = await heldPost(YUSUF);
      await del(one(freeCourse, post.id), MUDERRIS).expect(204);

      const [after] = await postsOf(YUSUF);
      expect(after.revokedAt).not.toBeNull();
      expect(after.revokedBy).toBe(MUDERRIS);
      const grants = await grantsOf(YUSUF);
      expect(grants).toHaveLength(3);
      for (const g of grants) expect(g.revokedBy).toBe(MUDERRIS);
      const revoke = (await nazirAudit()).filter(
        (r) => r.action === "course_nazir.revoke"
      );
      expect(revoke).toMatchObject([
        {
          actorId: MUDERRIS,
          entityId: freeCourse,
          details: { via: "course", postId: post.id, userId: YUSUF },
        },
      ]);
      expect([...(revoke[0].details.grantIds as string[])].sort()).toEqual(
        grants.map((g) => g.id).sort()
      );
      expect((await get(list(freeCourse), MUDERRIS)).body.items).toEqual([]);
      expect(await myCodes(YUSUF)).toEqual(["course.enroll", "course.view"]);
    });

    it("answers 404 for a post that is gone or another course's", async () => {
      await appoint(freeCourse, MUDERRIS).expect(201);
      const post = await heldPost(YUSUF);
      const res = await del(one(otherCourse, post.id), NAZIM).expect(404);
      expect(res.body.code).toBe("COURSE_NAZIR_NOT_FOUND");
      await del(one(freeCourse, post.id), MUDERRIS).expect(204);
      await del(one(freeCourse, post.id), MUDERRIS).expect(404);
    });

    it("cannot end a role that is no ders nazırı post: the müderris's seat stays, with his grants", async () => {
      const [seat] = await db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, MUDERRIS));
      await db.insert(permissionGrants).values({
        userId: MUDERRIS,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: freeCourse,
        permission: "recording.upload",
        grantedBy: NAZIM,
      });
      const res = await del(one(freeCourse, seat.id), NAZIM).expect(404);
      expect(res.body.code).toBe("COURSE_NAZIR_NOT_FOUND");
      const [after] = await db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.id, seat.id));
      expect(after.revokedAt).toBeNull();
      expect(await liveGrants(MUDERRIS)).toHaveLength(1);
      expect(await nazirAudit()).toHaveLength(0);
    });

    it("cannot change nor end a post whose end has passed but that was never revoked (404)", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["week.hide"],
      }).expect(201);
      const post = await heldPost(YUSUF);
      await db
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(roleAssignments.id, post.id));
      const changed = await patch(
        one(freeCourse, post.id),
        { permissions: ["week.hide", "session.manage"], endsAt: null },
        NAZIM
      ).expect(404);
      expect(changed.body.code).toBe("COURSE_NAZIR_NOT_FOUND");
      const ended = await del(one(freeCourse, post.id), NAZIM).expect(404);
      expect(ended.body.code).toBe("COURSE_NAZIR_NOT_FOUND");
      const [after] = await postsOf(YUSUF);
      expect(after.revokedAt).toBeNull();
      expect(after.expiresAt?.getTime()).toBeLessThan(Date.now());
      expect((await liveGrants(YUSUF)).map((g) => g.permission)).toEqual([
        "week.hide",
      ]);
      expect(await nazirAudit()).toHaveLength(1);
    });

    it("refuses to end a ders nazırı whose appointees still hold their posts (409 DISMISS_SEAT_HANDED_ON) and writes nothing", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["course_nazir.assign"],
      }).expect(201);
      await appoint(freeCourse, YUSUF, { userId: ZEYNEP }).expect(201);
      const yusuf = await heldPost(YUSUF);

      const res = await del(one(freeCourse, yusuf.id), MUDERRIS).expect(409);
      expect(res.body.code).toBe("DISMISS_SEAT_HANDED_ON");
      expect((await heldPost(YUSUF)).revokedAt).toBeNull();
      expect(await liveGrants(YUSUF)).toHaveLength(1);
      expect(
        (await nazirAudit()).filter((r) => r.action === "course_nazir.revoke")
      ).toHaveLength(0);

      // the remover ends the appointee first
      const zeynep = await heldPost(ZEYNEP);
      await del(one(freeCourse, zeynep.id), MUDERRIS).expect(204);
      await del(one(freeCourse, yusuf.id), MUDERRIS).expect(204);
    });

    it("lets the same person be appointed again afterwards", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["week.hide"],
      }).expect(201);
      const post = await heldPost(YUSUF);
      await del(one(freeCourse, post.id), MUDERRIS).expect(204);
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["session.manage"],
      }).expect(201);
      expect((await liveGrants(YUSUF)).map((g) => g.permission)).toEqual([
        "session.manage",
      ]);
    });
  });

  describe("an expired post", () => {
    it("is not listed once its end has passed and does not block a new one", async () => {
      await appoint(freeCourse, MUDERRIS, {
        permissions: ["week.hide"],
      }).expect(201);
      await db
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(roleAssignments.userId, YUSUF));
      const res = await get(list(freeCourse), MUDERRIS).expect(200);
      expect(res.body.items).toEqual([]);
      await appoint(freeCourse, MUDERRIS).expect(201);
      expect(
        (await postsOf(YUSUF)).filter((p) => p.revokedAt === null)
      ).toHaveLength(1);
    });
  });
});
