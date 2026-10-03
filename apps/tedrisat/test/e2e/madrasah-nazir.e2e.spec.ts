import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
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
 * MDRS-184, nazir/05 and nazir/15: a medrese's nazırs — the roster, appointing
 * one, what a nazır has handed on and görevden al with a decision per person —
 * against a real Postgres. Real `AuthGuard` with minted tokens. Only the realm
 * directory is replaced (a name for a person who never signed in).
 *
 * The medrese's başmüderris (MEDRESE_BASMUDERRIS) is the only medrese-side role
 * the matrix resolves; a MEDRESE_NAZIR is refused like a stranger.
 */
const ADMIN_ID = "d5000000-0000-4000-8000-000000000001";
const HEAD_ID = "d5000000-0000-4000-8000-000000000002";
const OTHER_HEAD_ID = "d5000000-0000-4000-8000-000000000003";
const FATMA_ID = "d5000000-0000-4000-8000-000000000004";
const UMMUGULSUM_ID = "d5000000-0000-4000-8000-000000000005";
const ABDULLAH_ID = "d5000000-0000-4000-8000-000000000006";
const HASAN_ID = "d5000000-0000-4000-8000-000000000007";
const NEWCOMER_ID = "d5000000-0000-4000-8000-000000000008";
const STRANGER_ID = "d5000000-0000-4000-8000-000000000009";
const MANAGER_ID = "d5000000-0000-4000-8000-00000000000a";
const UNKNOWN_ID = "d5000000-0000-4000-8000-00000000ffff";

/**
 * The people with names. Seeded into `users` and put in their tokens alike:
 * the sign-in sync upserts from the token, and its in-process cache outlives
 * `cleanTables`, so a token that disagreed with the seed would rewrite it.
 */
const PEOPLE: Record<
  string,
  { email: string | null; givenName: string; familyName: string | null }
> = {
  [HEAD_ID]: { email: null, givenName: "Mehmet Emin", familyName: "Işıkoğlu" },
  [FATMA_ID]: {
    email: "fz.celebioglu@example.com",
    givenName: "Fatma Zehra",
    familyName: "Çelebioğlu",
  },
  [UMMUGULSUM_ID]: {
    email: "u.haciosmanoglu@example.com",
    givenName: "Ümmügülsüm Nur",
    familyName: "Hacıosmanoğlu",
  },
  [ABDULLAH_ID]: {
    email: "a.erzurumluoglu@example.com",
    givenName: "Abdullah Talha",
    familyName: "Erzurumluoğlu",
  },
  [HASAN_ID]: {
    email: "h.gundogdu@example.com",
    givenName: "Hasan",
    familyName: null,
  },
};
const auth = (sub: string) => {
  const person = PEOPLE[sub];
  return bearerFor({
    sub,
    claims: person
      ? {
          email: person.email,
          given_name: person.givenName,
          family_name: person.familyName,
        }
      : sub === ADMIN_ID
        ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } }
        : {},
  });
};

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
  if (url.endsWith(`/admin/realms/r/users/${NEWCOMER_ID}`)) {
    return json({
      id: NEWCOMER_ID,
      email: "yeni@example.com",
      firstName: "Yeni",
      lastName: "Nazır",
      enabled: true,
    });
  }
  return json({}, 404);
}

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

describe("Medrese nazırs (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let courseId: string;
  let otherCourseId: string;
  let kadroGroup: string;
  let yasakGroup: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const base = (id = madrasahId) => `/madrasahs/${id}/nazirs`;
  const get = (sub: string, path = base()) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (sub: string, path: string) =>
    http().post(path).set("Authorization", auth(sub));
  const del = (sub: string, path: string, body?: unknown) =>
    http()
      .delete(path)
      .set("Authorization", auth(sub))
      .send(body as object | undefined);
  const audits = (action: string) =>
    db()
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.action, action), eq(auditLog.entityId, madrasahId))
      );
  const roleRows = (userId: string, role: string, scopeId = madrasahId) =>
    db()
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, role as never),
          eq(roleAssignments.scopeId, scopeId)
        )
      );

  const makeGroup = async (
    name: string,
    permissions: string[],
    scopeId = madrasahId
  ) => {
    const [group] = await db()
      .insert(permissionGroups)
      .values({
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId,
        name,
        createdBy: HEAD_ID,
      })
      .returning();
    await db()
      .insert(permissionGroupItems)
      .values(
        permissions.map((permission) => ({ groupId: group.id, permission }))
      );
    return group.id;
  };

  const grant = (
    userId: string,
    grantedBy: string,
    what: { permission: string } | { groupId: string },
    values: Partial<typeof permissionGrants.$inferInsert> = {}
  ) =>
    db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        grantedBy,
        permission: null,
        groupId: null,
        ...what,
        ...values,
      });

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
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
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );

  beforeEach(async () => {
    await clean();
    await db()
      .insert(users)
      .values(
        Object.entries(PEOPLE).map(([id, person]) => ({ id, ...person }))
      );
    const [madrasah, other] = await db()
      .insert(madrasahs)
      .values([
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        },
        { handle: "fatih", name: "Fatih Medresesi", createdBy: ADMIN_ID },
      ])
      .returning();
    madrasahId = madrasah.id;
    otherMadrasahId = other.id;
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: OTHER_HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: otherMadrasahId,
      grantedBy: ADMIN_ID,
    });

    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    const [course, otherCourse] = await db()
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Bina ve İzhar Şerhi",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Başka medresenin dersi",
          madrasahId: otherMadrasahId,
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    courseId = course.id;
    otherCourseId = otherCourse.id;

    kadroGroup = await makeGroup("Ders açma ve kadro", [
      "course.edit",
      "course.settings",
    ]);
    yasakGroup = await makeGroup("Yasak ve itiraz", ["ban.course"]);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  /** The nazırs of nazir/05's picture: one with groups, one expiring, one with nothing. */
  const seedRoster = async () => {
    await assignRole(db(), {
      userId: FATMA_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
    });
    await assignRole(db(), {
      userId: UMMUGULSUM_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
    });
    await assignRole(db(), {
      userId: ABDULLAH_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: FATMA_ID,
    });
    await grant(FATMA_ID, HEAD_ID, { groupId: kadroGroup });
    await grant(FATMA_ID, HEAD_ID, { groupId: yasakGroup });
    await grant(FATMA_ID, HEAD_ID, { permission: "enrollment.decide" });
    await grant(
      UMMUGULSUM_ID,
      HEAD_ID,
      { permission: "session.manage" },
      { expiresAt: daysFromNow(30) }
    );
  };

  describe("the roster", () => {
    it("lists the nazırs in the order they were appointed, with what they hold and who gave it", async () => {
      await seedRoster();
      const res = await get(HEAD_ID).expect(200);

      expect(res.body.map((n: { user: { id: string } }) => n.user.id)).toEqual([
        FATMA_ID,
        UMMUGULSUM_ID,
        ABDULLAH_ID,
      ]);
      const [fatma, ummugulsum, abdullah] = res.body;

      expect(fatma).toMatchObject({
        user: {
          id: FATMA_ID,
          name: "Fatma Zehra Çelebioğlu",
          email: "fz.celebioglu@example.com",
        },
        appointedBy: { id: HEAD_ID, name: "Mehmet Emin Işıkoğlu", email: null },
        assignmentExpiresAt: null,
        expiresAt: null,
        groups: [
          { id: kadroGroup, name: "Ders açma ve kadro" },
          { id: yasakGroup, name: "Yasak ve itiraz" },
        ],
        grantedBy: { id: HEAD_ID },
      });
      expect(fatma.groups[0].permissions.sort()).toEqual([
        "course.edit",
        "course.settings",
      ]);
      expect(fatma.permissions).toEqual([
        { code: "enrollment.decide", grantedAt: expect.any(String) },
      ]);

      expect(ummugulsum.groups).toEqual([]);
      expect(ummugulsum.expiresAt).toBe(
        (
          await db()
            .select()
            .from(permissionGrants)
            .where(eq(permissionGrants.userId, UMMUGULSUM_ID))
        )[0].expiresAt?.toISOString()
      );

      // Appointed by a nazır, holding nothing: nazir/05's "henüz izin almadı".
      expect(abdullah).toMatchObject({
        user: { id: ABDULLAH_ID },
        appointedBy: { id: FATMA_ID, name: "Fatma Zehra Çelebioğlu" },
        groups: [],
        permissions: [],
        expiresAt: null,
        grantedBy: null,
        grantedAt: null,
      });
    });

    it("leaves out what is not held in this medrese", async () => {
      await seedRoster();
      // Revoked, lapsed, in another medrese, a deleted group, and a başmüderris.
      await db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: HEAD_ID })
        .where(eq(roleAssignments.userId, ABDULLAH_ID));
      await assignRole(db(), {
        userId: STRANGER_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: otherMadrasahId,
        grantedBy: OTHER_HEAD_ID,
      });
      await grant(
        FATMA_ID,
        HEAD_ID,
        { permission: "course.publish" },
        {
          expiresAt: new Date(Date.now() - 1000),
        }
      );
      await grant(
        FATMA_ID,
        HEAD_ID,
        { permission: "ban.course" },
        { scopeId: otherMadrasahId }
      );
      const deleted = await makeGroup("Silinmiş", ["course.edit"]);
      await db()
        .update(permissionGroups)
        .set({ deletedAt: new Date() })
        .where(eq(permissionGroups.id, deleted));
      await grant(UMMUGULSUM_ID, HEAD_ID, { groupId: deleted });

      const res = await get(HEAD_ID).expect(200);
      expect(res.body.map((n: { user: { id: string } }) => n.user.id)).toEqual([
        FATMA_ID,
        UMMUGULSUM_ID,
      ]);
      expect(
        res.body[0].permissions.map((p: { code: string }) => p.code)
      ).toEqual(["enrollment.decide"]);
      expect(res.body[1].groups).toEqual([]);
    });

    it("is empty for a medrese with no nazır", async () => {
      expect((await get(HEAD_ID).expect(200)).body).toEqual([]);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone", async () => {
      await seedRoster();
      await get(ADMIN_ID).expect(200);
      // A medrese nazır is on no matrix row yet: refused like a stranger.
      for (const sub of [FATMA_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await get(sub).expect(403);
      }
      await http().get(base()).expect(401);
      await get(STRANGER_ID, base(UNKNOWN_ID)).expect(404);
      await get(STRANGER_ID, "/madrasahs/not-a-uuid/nazirs").expect(404);
    });
  });

  describe("appointing a nazır", () => {
    it("appoints with no permissions, in the başmüderris' name, and names a person who never signed in", async () => {
      const res = await post(HEAD_ID, `${base()}/${NEWCOMER_ID}`).expect(201);

      expect(res.body).toMatchObject({
        user: {
          id: NEWCOMER_ID,
          name: "Yeni Nazır",
          email: "yeni@example.com",
        },
        appointedBy: { id: HEAD_ID, name: "Mehmet Emin Işıkoğlu" },
        groups: [],
        permissions: [],
        grantedBy: null,
      });
      const [role, ...rest] = await roleRows(
        NEWCOMER_ID,
        ASSIGNED_ROLES.MEDRESE_NAZIR
      );
      expect(rest).toEqual([]);
      expect(role).toMatchObject({
        scopeType: SCOPE_TYPES.MADRASAH,
        grantedBy: HEAD_ID,
        revokedAt: null,
      });
      expect(await db().select().from(permissionGrants)).toHaveLength(0);
      const [audit] = await audits("madrasah_nazir.appoint");
      expect(audit).toMatchObject({
        actorId: HEAD_ID,
        details: { userId: NEWCOMER_ID },
      });
      expect(
        (await get(HEAD_ID).expect(200)).body.map(
          (n: { user: { id: string } }) => n.user.id
        )
      ).toEqual([NEWCOMER_ID]);
    });

    it("answers the same row when the nazır is appointed again, and writes nothing twice", async () => {
      const first = await post(HEAD_ID, `${base()}/${NEWCOMER_ID}`).expect(201);
      const again = await post(ADMIN_ID, `${base()}/${NEWCOMER_ID}`).expect(
        201
      );
      expect(again.body.appointedAt).toBe(first.body.appointedAt);
      expect(again.body.appointedBy.id).toBe(HEAD_ID);
      expect(
        await roleRows(NEWCOMER_ID, ASSIGNED_ROLES.MEDRESE_NAZIR)
      ).toHaveLength(1);
      expect(await audits("madrasah_nazir.appoint")).toHaveLength(1);
    });

    it("is refused to everyone but the başmüderris and SYSTEM_ADMIN, and writes nothing", async () => {
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID]) {
        await post(sub, `${base()}/${NEWCOMER_ID}`).expect(403);
      }
      await post(HEAD_ID, `${base()}/not-a-uuid`).expect(400);
      await post(HEAD_ID, `${base(UNKNOWN_ID)}/${NEWCOMER_ID}`).expect(404);
      await http().post(`${base()}/${NEWCOMER_ID}`).expect(401);
      expect(await db().select().from(roleAssignments)).toHaveLength(2);
      await post(ADMIN_ID, `${base()}/${NEWCOMER_ID}`).expect(201);
    });
  });

  describe("what a nazır has handed on", () => {
    /** Fatma appointed Abdullah and a müderris of a medrese course; and gave things elsewhere. */
    const seedGiven = async () => {
      await seedRoster();
      await assignRole(db(), {
        userId: HASAN_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: courseId,
        grantedBy: FATMA_ID,
      });
      // Not hers to hand on here: another medrese's course, and a role someone else gave.
      await assignRole(db(), {
        userId: STRANGER_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: otherCourseId,
        grantedBy: FATMA_ID,
      });
      await assignRole(db(), {
        userId: STRANGER_ID,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: HEAD_ID,
      });
      await grant(ABDULLAH_ID, FATMA_ID, { permission: "course.edit" });
      await grant(ABDULLAH_ID, FATMA_ID, { groupId: yasakGroup });
    };

    it("lists, per person, the roles and permissions handed on in the medrese and its courses", async () => {
      await seedGiven();
      const res = await get(HEAD_ID, `${base()}/${FATMA_ID}/grants`).expect(
        200
      );

      expect(res.body.map((r: { user: { id: string } }) => r.user.id)).toEqual([
        ABDULLAH_ID,
        HASAN_ID,
      ]);
      const [abdullah, hasan] = res.body;
      expect(abdullah).toMatchObject({
        user: {
          id: ABDULLAH_ID,
          name: "Abdullah Talha Erzurumluoğlu",
          email: "a.erzurumluoglu@example.com",
        },
        roles: [
          {
            role: "MEDRESE_NAZIR",
            scopeType: "madrasah",
            scopeName: "Süleymaniye Medresesi",
            expiresAt: null,
          },
        ],
        groups: [{ id: yasakGroup, name: "Yasak ve itiraz" }],
        permissions: ["course.edit"],
      });
      expect(hasan).toMatchObject({
        user: { id: HASAN_ID },
        roles: [
          {
            role: "MUDERRIS",
            scopeType: "course",
            scopeName: "Bina ve İzhar Şerhi",
          },
        ],
        groups: [],
        permissions: [],
      });
    });

    it("is empty when the nazır gave no one anything", async () => {
      await seedRoster();
      const res = await get(
        HEAD_ID,
        `${base()}/${UMMUGULSUM_ID}/grants`
      ).expect(200);
      expect(res.body).toEqual([]);
    });

    it("answers 404 for a user who is not a nazır of the medrese", async () => {
      await seedGiven();
      for (const userId of [STRANGER_ID, HEAD_ID, UNKNOWN_ID]) {
        const res = await get(HEAD_ID, `${base()}/${userId}/grants`).expect(
          404
        );
        expect(res.body.code).toBe("MADRASAH_NAZIR_NOT_FOUND");
      }
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone", async () => {
      await seedGiven();
      await get(ADMIN_ID, `${base()}/${FATMA_ID}/grants`).expect(200);
      for (const sub of [FATMA_ID, ABDULLAH_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await get(sub, `${base()}/${FATMA_ID}/grants`).expect(403);
      }
    });
  });

  describe("görevden al", () => {
    const dismissal = (decisions: unknown) => ({ decisions });
    const held = async (userId: string, role: string, scopeId = madrasahId) =>
      (await roleRows(userId, role, scopeId)).filter(
        (r) => r.revokedAt === null
      );

    const seedGiven = async () => {
      await seedRoster();
      await assignRole(db(), {
        userId: HASAN_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: courseId,
        grantedBy: FATMA_ID,
      });
      await grant(ABDULLAH_ID, FATMA_ID, { permission: "course.edit" });
      // Fatma's own seat in the other medrese must survive.
      await assignRole(db(), {
        userId: FATMA_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: otherMadrasahId,
        grantedBy: OTHER_HEAD_ID,
      });
      await grant(
        FATMA_ID,
        OTHER_HEAD_ID,
        { permission: "ban.course" },
        { scopeId: otherMadrasahId }
      );
    };

    it("takes over one person and drops another, revokes the nazır and what they held, in the caller's name", async () => {
      await seedGiven();
      await del(
        HEAD_ID,
        `${base()}/${FATMA_ID}`,
        dismissal([
          { userId: ABDULLAH_ID, action: "TAKE_OVER" },
          { userId: HASAN_ID, action: "DROP" },
        ])
      ).expect(204);

      // The nazır: appointment and permissions here gone, in the head's name.
      const [fatma] = await roleRows(FATMA_ID, ASSIGNED_ROLES.MEDRESE_NAZIR);
      expect(fatma).toMatchObject({ revokedBy: HEAD_ID });
      expect(fatma.revokedAt).not.toBeNull();
      const fatmaGrants = await db()
        .select()
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.userId, FATMA_ID),
            eq(permissionGrants.scopeId, madrasahId)
          )
        );
      expect(fatmaGrants).toHaveLength(3);
      expect(fatmaGrants.every((g) => g.revokedBy === HEAD_ID)).toBe(true);

      // Taken over: still held, the head is now the giver.
      const [abdullah] = await held(ABDULLAH_ID, ASSIGNED_ROLES.MEDRESE_NAZIR);
      expect(abdullah.grantedBy).toBe(HEAD_ID);
      const [abdullahGrant] = await db()
        .select()
        .from(permissionGrants)
        .where(eq(permissionGrants.userId, ABDULLAH_ID));
      expect(abdullahGrant).toMatchObject({
        grantedBy: HEAD_ID,
        revokedAt: null,
      });

      // Dropped: revoked at once, in the head's name.
      expect(await held(HASAN_ID, ASSIGNED_ROLES.MUDERRIS, courseId)).toEqual(
        []
      );
      const [hasan] = await roleRows(
        HASAN_ID,
        ASSIGNED_ROLES.MUDERRIS,
        courseId
      );
      expect(hasan.revokedBy).toBe(HEAD_ID);

      // The other medrese is untouched.
      expect(
        await held(FATMA_ID, ASSIGNED_ROLES.MEDRESE_NAZIR, otherMadrasahId)
      ).toHaveLength(1);
      const [elsewhere] = await db()
        .select()
        .from(permissionGrants)
        .where(eq(permissionGrants.scopeId, otherMadrasahId));
      expect(elsewhere.revokedAt).toBeNull();

      // nazir/05 now: Fatma is gone, Abdullah's appointer is the head.
      const roster = (await get(HEAD_ID).expect(200)).body;
      expect(roster.map((n: { user: { id: string } }) => n.user.id)).toEqual([
        UMMUGULSUM_ID,
        ABDULLAH_ID,
      ]);
      expect(roster[1].appointedBy.id).toBe(HEAD_ID);

      const [audit] = await audits("madrasah_nazir.dismiss");
      expect(audit).toMatchObject({
        actorId: HEAD_ID,
        details: { userId: FATMA_ID, tookOver: 2, dropped: 1 },
      });
    });

    it("needs a decision for exactly the people the nazır gave something to, and writes nothing otherwise", async () => {
      await seedGiven();
      const path = `${base()}/${FATMA_ID}`;
      const only = { userId: ABDULLAH_ID, action: "TAKE_OVER" };
      const both = [only, { userId: HASAN_ID, action: "DROP" }];
      for (const decisions of [
        [],
        [only],
        [...both, { userId: UMMUGULSUM_ID, action: "DROP" }],
        [...both, only],
      ]) {
        const res = await del(HEAD_ID, path, dismissal(decisions)).expect(400);
        expect(res.body.code).toBe("DISMISS_DECISIONS_INCOMPLETE");
      }
      // Each is an invalid body of its own.
      await del(HEAD_ID, path).expect(400);
      await del(
        HEAD_ID,
        path,
        dismissal([{ userId: HASAN_ID, action: "KEEP" }])
      ).expect(400);
      await del(
        HEAD_ID,
        path,
        dismissal([{ userId: "x", action: "DROP" }])
      ).expect(400);

      expect(await held(FATMA_ID, ASSIGNED_ROLES.MEDRESE_NAZIR)).toHaveLength(
        1
      );
      expect(
        await held(HASAN_ID, ASSIGNED_ROLES.MUDERRIS, courseId)
      ).toHaveLength(1);
      expect(await audits("madrasah_nazir.dismiss")).toHaveLength(0);
    });

    it("dismisses a nazır who gave no one anything with an empty decision list", async () => {
      await seedRoster();
      await del(HEAD_ID, `${base()}/${UMMUGULSUM_ID}`, dismissal([])).expect(
        204
      );
      expect(await held(UMMUGULSUM_ID, ASSIGNED_ROLES.MEDRESE_NAZIR)).toEqual(
        []
      );
      expect(
        (await get(HEAD_ID).expect(200)).body.map(
          (n: { user: { id: string } }) => n.user.id
        )
      ).toEqual([FATMA_ID, ABDULLAH_ID]);
    });

    it("answers 404 for a user who is not (or no longer) a nazır, and 403 to anyone else", async () => {
      await seedGiven();
      const path = `${base()}/${UMMUGULSUM_ID}`;
      for (const sub of [FATMA_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await del(sub, path, dismissal([])).expect(403);
      }
      await http().delete(path).send(dismissal([])).expect(401);
      await del(HEAD_ID, `${base()}/${STRANGER_ID}`, dismissal([])).expect(404);
      await del(
        HEAD_ID,
        `${base(UNKNOWN_ID)}/${FATMA_ID}`,
        dismissal([])
      ).expect(404);

      await del(ADMIN_ID, path, dismissal([])).expect(204);
      const again = await del(HEAD_ID, path, dismissal([])).expect(404);
      expect(again.body.code).toBe("MADRASAH_NAZIR_NOT_FOUND");
    });
  });
});
