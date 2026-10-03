import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
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
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-172, nizam/14: the Pasif kapsamlar page against a real Postgres — which
 * köşks, medreses and courses are listed and why, who may open the page, and
 * what assigning and viewing write down.
 */
const ADMIN = "e1000000-0000-4000-8000-000000000001";
const MEDARIS = "e1000000-0000-4000-8000-000000000002";
const MEDARIS_ALLOWED = "e1000000-0000-4000-8000-000000000003";
const TALEBE = "e1000000-0000-4000-8000-000000000004";
const OLD_NAZIM = "e1000000-0000-4000-8000-000000000005";
const OLD_HEAD = "e1000000-0000-4000-8000-000000000006";
const OLD_MUDERRIS = "e1000000-0000-4000-8000-000000000007";
const NEW_PERSON = "e1000000-0000-4000-8000-000000000008";
const KOSK_NAZIM_REMOVER = "e1000000-0000-4000-8000-000000000009";
const GHOST = "e1000000-0000-4000-8000-0000000000aa";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);
const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

describe("Inactive scopes (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let koskRemoved: string;
  let koskActive: string;
  let koskHidden: string;
  let madrasahExpired: string;
  let madrasahActive: string;
  let courseRemoved: string;

  const http = () => request(app.getHttpServer());
  const get = (path: string, sub = ADMIN) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (path: string, body: unknown = {}, sub = ADMIN) =>
    http()
      .post(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const audit = (action: string) =>
    db.select().from(auditLog).where(eq(auditLog.action, action));
  const rolesIn = (scopeId: string) =>
    db
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.scopeId, scopeId));

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

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
        id: OLD_NAZIM,
        email: "eski@example.com",
        givenName: "Eski",
        familyName: "Nazım",
      },
      {
        id: OLD_HEAD,
        email: "abdurrahman@example.com",
        givenName: "Abdurrahman Şeref",
        familyName: "Tunalıoğlu",
      },
      {
        id: OLD_MUDERRIS,
        email: "halil@example.com",
        givenName: "Halil İbrahim",
        familyName: "Sarıkaya",
      },
      {
        id: NEW_PERSON,
        email: "yeni@example.com",
        givenName: "Yeni",
        familyName: "Kişi",
      },
      {
        id: KOSK_NAZIM_REMOVER,
        email: "ayse@example.com",
        givenName: "Ayşe Nur",
        familyName: "Kılıçarslan",
      },
    ]);
    const kRows = await db
      .insert(kosks)
      .values([
        {
          ownerId: ADMIN,
          name: "Beyazıt Köşkü",
          handle: "beyazit",
          passiveSince: daysAgo(3),
          passiveReason: "REMOVED",
        },
        { ownerId: ADMIN, name: "Fatih Köşkü", handle: "fatih" },
        { ownerId: ADMIN, name: "Hiç yöneticisi olmamış Köşk", handle: "bos" },
        {
          ownerId: ADMIN,
          name: "Gizli Köşk",
          handle: "gizli",
          archivedAt: daysAgo(1),
          archivedBy: ADMIN,
        },
      ])
      .returning();
    [koskRemoved, koskActive, , koskHidden] = kRows.map((r) => r.id);
    const mRows = await db
      .insert(madrasahs)
      .values([
        { handle: "zeyrek", name: "Zeyrek Medresesi", createdBy: ADMIN },
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN,
        },
      ])
      .returning();
    [madrasahExpired, madrasahActive] = mRows.map((r) => r.id);
    const [course] = await db
      .insert(courses)
      .values({
        koskId: koskActive,
        authorId: ADMIN,
        title: "Kasîde-i Bürde şerhi",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseRemoved = course.id;

    const now = new Date();
    // Beyazıt: its only nazım was taken away by a köşk nazımı of the same köşk, 3 days ago
    await assignRole(db, {
      userId: KOSK_NAZIM_REMOVER,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskRemoved,
      grantedBy: ADMIN,
    });
    await db
      .update(roleAssignments)
      .set({ revokedAt: daysAgo(10), revokedBy: ADMIN })
      .where(eq(roleAssignments.userId, KOSK_NAZIM_REMOVER));
    await assignRole(db, {
      userId: OLD_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskRemoved,
      grantedBy: ADMIN,
    });
    await db
      .update(roleAssignments)
      .set({ revokedAt: daysAgo(3), revokedBy: KOSK_NAZIM_REMOVER })
      .where(eq(roleAssignments.userId, OLD_NAZIM));
    // Fatih: attended
    await assignRole(db, {
      userId: OLD_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskActive,
      grantedBy: ADMIN,
    });
    // Hidden köşk: had a nazım, left; hidden ones are not listed
    await assignRole(db, {
      userId: OLD_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskHidden,
      grantedBy: ADMIN,
    });
    await db
      .update(roleAssignments)
      .set({ revokedAt: daysAgo(2), revokedBy: ADMIN })
      .where(and(eq(roleAssignments.scopeId, koskHidden)));
    // Zeyrek: the başmüderris's term ran out 4 days ago
    await assignRole(db, {
      userId: OLD_HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahExpired,
      grantedBy: ADMIN,
    });
    await db
      .update(roleAssignments)
      .set({ expiresAt: daysAgo(4) })
      .where(eq(roleAssignments.scopeId, madrasahExpired));
    // Süleymaniye: attended
    await assignRole(db, {
      userId: OLD_HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahActive,
      grantedBy: ADMIN,
    });
    // The course: its last müderris (the imam) was removed
    await assignRole(db, {
      userId: OLD_MUDERRIS,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseRemoved,
      grantedBy: ADMIN,
      isImam: true,
    });
    await db
      .update(roleAssignments)
      .set({ revokedAt: now, revokedBy: KOSK_NAZIM_REMOVER })
      .where(eq(roleAssignments.scopeId, courseRemoved));
  });

  describe("GET /nizam/inactive-scopes (criteria 1, 2)", () => {
    it("lists only the scopes that had a manager and have none, oldest first, hidden ones left out", async () => {
      const res = await get("/nizam/inactive-scopes").expect(200);
      const named = res.body.map(
        (r: { type: string; name: string }) => `${r.type}:${r.name}`
      );
      expect(named).toEqual([
        "MADRASAH:Zeyrek Medresesi",
        "KOSK:Beyazıt Köşkü",
        "COURSE:Kasîde-i Bürde şerhi",
      ]);
    });

    it("says why: a term that ran out, or a post somebody took away, and who", async () => {
      const res = await get("/nizam/inactive-scopes").expect(200);
      const by = (name: string) =>
        res.body.find((r: { name: string }) => r.name === name);
      expect(by("Zeyrek Medresesi")).toMatchObject({
        type: "MADRASAH",
        reason: "EXPIRED",
        lastRole: "MEDRESE_BASMUDERRIS",
        lastManager: { id: OLD_HEAD, name: "Abdurrahman Şeref Tunalıoğlu" },
        removedBy: null,
        kosk: null,
      });
      expect(by("Beyazıt Köşkü")).toMatchObject({
        type: "KOSK",
        reason: "REMOVED",
        lastManager: { id: OLD_NAZIM },
        removedBy: { id: KOSK_NAZIM_REMOVER, name: "Ayşe Nur Kılıçarslan" },
        removedByRole: "KOSK_NAZIM",
      });
      expect(by("Kasîde-i Bürde şerhi")).toMatchObject({
        type: "COURSE",
        reason: "REMOVED",
        wasImam: true,
        lastRole: "MUDERRIS",
        kosk: { id: koskActive, name: "Fatih Köşkü" },
        removedBy: { id: KOSK_NAZIM_REMOVER },
      });
    });

    it("filters by type", async () => {
      for (const [type, name] of [
        ["KOSK", "Beyazıt Köşkü"],
        ["MADRASAH", "Zeyrek Medresesi"],
        ["COURSE", "Kasîde-i Bürde şerhi"],
      ]) {
        const res = await get(`/nizam/inactive-scopes?type=${type}`).expect(
          200
        );
        expect(res.body.map((r: { name: string }) => r.name)).toEqual([name]);
      }
      await get("/nizam/inactive-scopes?type=NOPE").expect(400);
    });

    it("lists a scope again as active once somebody is given the post", async () => {
      await post(`/nizam/inactive-scopes/KOSK/${koskRemoved}/assign`, {
        userId: NEW_PERSON,
      }).expect(204);
      const res = await get("/nizam/inactive-scopes?type=KOSK").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("who may open it (criterion 5)", () => {
    beforeEach(async () => {
      await db.insert(users).values([
        { id: MEDARIS, email: "medaris@example.com" },
        { id: MEDARIS_ALLOWED, email: "izinli@example.com" },
        { id: TALEBE, email: "talebe@example.com" },
      ]);
      for (const sub of [MEDARIS, MEDARIS_ALLOWED]) {
        await db.insert(roleAssignments).values({
          userId: sub,
          role: ASSIGNED_ROLES.MEDARIS_NAZIM,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          grantedBy: ADMIN,
        });
      }
      await db.insert(permissionGrants).values({
        userId: MEDARIS_ALLOWED,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: "platform.inactive_scopes_manage",
        grantedBy: ADMIN,
      });
    });

    it("lets the başnazım and a Medaris nazımı with the permission in, nobody else", async () => {
      await get("/nizam/inactive-scopes", ADMIN).expect(200);
      await get("/nizam/inactive-scopes", MEDARIS_ALLOWED).expect(200);
      await get("/nizam/inactive-scopes", MEDARIS).expect(403);
      await get("/nizam/inactive-scopes", TALEBE).expect(403);
      await post(
        `/nizam/inactive-scopes/KOSK/${koskRemoved}/view`,
        {},
        MEDARIS
      ).expect(403);
      await post(
        `/nizam/inactive-scopes/KOSK/${koskRemoved}/assign`,
        { userId: NEW_PERSON },
        TALEBE
      ).expect(403);
    });

    it("a nazımı whose appointment ended does not pass even with the grant left over", async () => {
      await db
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: ADMIN })
        .where(eq(roleAssignments.userId, MEDARIS_ALLOWED));
      await get("/nizam/inactive-scopes", MEDARIS_ALLOWED).expect(403);
    });
  });

  describe("POST /nizam/inactive-scopes/:type/:id/assign (criterion 3)", () => {
    it("gives a köşk its nazım, clears the passive mark and writes it down", async () => {
      const endsAt = daysFromNow(90);
      await post(`/nizam/inactive-scopes/KOSK/${koskRemoved}/assign`, {
        userId: NEW_PERSON,
        endsAt,
      }).expect(204);
      const held = (await rolesIn(koskRemoved)).filter(
        (r) => r.revokedAt === null
      );
      expect(held).toHaveLength(1);
      expect(held[0]).toMatchObject({
        userId: NEW_PERSON,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        grantedBy: ADMIN,
      });
      expect(held[0].expiresAt?.toISOString()).toBe(endsAt);
      const [row] = await db
        .select()
        .from(kosks)
        .where(eq(kosks.id, koskRemoved));
      expect(row.passiveSince).toBeNull();
      expect((await audit("inactive_scope.assign"))[0].details).toMatchObject({
        type: "KOSK",
        userId: NEW_PERSON,
      });
    });

    it("gives a medrese its başmüderris through the same path as nizam/07", async () => {
      await post(`/nizam/inactive-scopes/MADRASAH/${madrasahExpired}/assign`, {
        userId: NEW_PERSON,
      }).expect(204);
      const held = (await rolesIn(madrasahExpired)).filter(
        (r) =>
          r.revokedAt === null &&
          (r.expiresAt === null || r.expiresAt > new Date())
      );
      expect(held.map((r) => r.userId)).toEqual([NEW_PERSON]);
      expect(await audit("madrasah.head_muderris.set")).toHaveLength(1);
    });

    it("gives a course its müderris, the imam, and puts them on the course page's list", async () => {
      await post(`/nizam/inactive-scopes/COURSE/${courseRemoved}/assign`, {
        userId: NEW_PERSON,
      }).expect(204);
      const held = (await rolesIn(courseRemoved)).filter(
        (r) => r.revokedAt === null
      );
      expect(held).toHaveLength(1);
      expect(held[0]).toMatchObject({
        userId: NEW_PERSON,
        role: ASSIGNED_ROLES.MUDERRIS,
        isImam: true,
      });
      const listed = await db
        .select()
        .from(courseMuderris)
        .where(eq(courseMuderris.courseId, courseRemoved));
      expect(listed).toMatchObject([{ userId: NEW_PERSON, name: "Yeni Kişi" }]);
    });

    it("answers 404 for a scope that is attended, hidden, new or missing", async () => {
      for (const [type, id] of [
        ["KOSK", koskActive],
        ["KOSK", koskHidden],
        ["MADRASAH", madrasahActive],
        ["KOSK", "e1000000-0000-4000-8000-0000000000ff"],
      ]) {
        const res = await post(`/nizam/inactive-scopes/${type}/${id}/assign`, {
          userId: NEW_PERSON,
        }).expect(404);
        expect(res.body.code).toBe("INACTIVE_SCOPE_NOT_FOUND");
      }
    });

    it("refuses an end in the past, an unknown account and a bad body", async () => {
      const url = `/nizam/inactive-scopes/KOSK/${koskRemoved}/assign`;
      await post(url, { userId: NEW_PERSON, endsAt: daysFromNow(-1) }).expect(
        400
      );
      await post(url, { userId: GHOST }).expect(404);
      await post(url, { userId: "nobody" }).expect(400);
      await post(`/nizam/inactive-scopes/NOPE/${koskRemoved}/assign`, {
        userId: NEW_PERSON,
      }).expect(400);
      expect(
        (await rolesIn(koskRemoved)).filter((r) => r.revokedAt === null)
      ).toHaveLength(0);
    });
  });

  describe("POST /nizam/inactive-scopes/:type/:id/view (criterion 4)", () => {
    it("writes one audit row for every opening", async () => {
      const url = `/nizam/inactive-scopes/MADRASAH/${madrasahExpired}/view`;
      await post(url).expect(204);
      await post(url).expect(204);
      const rows = await audit("inactive_scope.view");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        actorId: ADMIN,
        entity: "madrasah",
        entityId: madrasahExpired,
      });
    });

    it("writes nothing for a scope that is not passive", async () => {
      await post(
        `/nizam/inactive-scopes/MADRASAH/${madrasahActive}/view`
      ).expect(404);
      expect(await audit("inactive_scope.view")).toHaveLength(0);
    });
  });
});
