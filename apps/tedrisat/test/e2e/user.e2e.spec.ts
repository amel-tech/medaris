import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import request from "supertest";
import { AssignmentService } from "../../src/assignment/assignment.service";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
  courses,
} from "../../src/database/schema/course.schema";
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
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-104. Built with `createTestApp()` and no `authUserId`, so the REAL
 * AuthGuard verifies a minted token and puts its claims on `request.user` —
 * the stubbed guard only ever sets `sub`, and the claims are what this
 * feature copies.
 */
const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const MANAGER_ID = "a0000000-0000-4000-8000-000000000002";
const MUDERRIS_ID = "a0000000-0000-4000-8000-000000000003";
const TALEBE_ID = "a0000000-0000-4000-8000-000000000004";
const NEWCOMER_ID = "a0000000-0000-4000-8000-000000000005";
const HEAD_ID = "a0000000-0000-4000-8000-000000000007";
const DERS_NAZIR_ID = "a0000000-0000-4000-8000-000000000008";
const MEDARIS_ID = "a0000000-0000-4000-8000-000000000009";

const claimsFor: Record<string, Record<string, unknown>> = {
  [ADMIN_ID]: {
    email: "admin@example.com",
    email_verified: true,
    given_name: "Ada",
    family_name: "Admin",
    realm_access: { roles: [ROLES.SYSTEM_ADMIN] },
  },
  [MANAGER_ID]: {
    email: "manager@example.com",
    email_verified: true,
    given_name: "Mehmet",
    family_name: "Müdür",
  },
  [MUDERRIS_ID]: {
    email: "muderris@example.com",
    email_verified: true,
    given_name: "Musa",
    family_name: "Müderris",
  },
  [TALEBE_ID]: {
    email: "talebe@example.com",
    email_verified: false,
    given_name: "Talha",
    family_name: "Talebe",
  },
};

const auth = (sub: string, claims = claimsFor[sub] ?? {}) =>
  bearerFor({ sub, claims });

describe("Users (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let courseId: string;

  const userRow = async (id: string) => {
    const rows = await databaseService.db
      .select()
      .from(users)
      .where(eq(users.id, id));
    return rows[0];
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users"
    );
    const [kosk] = await databaseService.db
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Süleymaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    // Managing is a KOSK_NAZIM role since MDRS-134, which `POST /kosks`
    // grants and a direct insert does not.
    await assignRole(databaseService.db, {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: MANAGER_ID,
    });
    const [course] = await databaseService.db
      .insert(courses)
      .values({ koskId, authorId: MANAGER_ID, title: "Usûl-i Fıkıh" })
      .returning();
    courseId = course.id;
    await databaseService.db
      .insert(courseMuderris)
      .values({ courseId, userId: MUDERRIS_ID, name: "Musa Müderris" });
    await assignRole(databaseService.db, {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
      isImam: true,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users"
    );
    await app.close();
  });

  describe("recording the caller", () => {
    it("creates the users row on the first authenticated request", async () => {
      expect(await userRow(NEWCOMER_ID)).toBeUndefined();

      await request(app.getHttpServer())
        .get("/kosks")
        .set(
          "Authorization",
          auth(NEWCOMER_ID, {
            email: "yeni@example.com",
            email_verified: true,
            given_name: "Yeni",
            family_name: "Gelen",
            locale: "tr",
          })
        )
        .expect(200);

      const row = await userRow(NEWCOMER_ID);
      expect(row).toMatchObject({
        id: NEWCOMER_ID,
        email: "yeni@example.com",
        emailVerified: true,
        givenName: "Yeni",
        familyName: "Gelen",
        locale: "tr",
        timeZone: null,
      });
    });

    it("updates the row when the token carries a changed e-mail", async () => {
      const server = app.getHttpServer();
      await request(server)
        .get("/kosks")
        .set("Authorization", auth(NEWCOMER_ID, { email: "eski@example.com" }))
        .expect(200);
      expect((await userRow(NEWCOMER_ID))?.email).toBe("eski@example.com");

      await request(server)
        .get("/kosks")
        .set(
          "Authorization",
          auth(NEWCOMER_ID, { email: "yeni@example.com", given_name: "Yeni" })
        )
        .expect(200);

      const row = await userRow(NEWCOMER_ID);
      expect(row?.email).toBe("yeni@example.com");
      expect(row?.givenName).toBe("Yeni");
    });

    it("does not rewrite the row when the claims are unchanged", async () => {
      const server = app.getHttpServer();
      await request(server)
        .get("/kosks")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      const first = await userRow(TALEBE_ID);

      await request(server)
        .get("/kosks")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      const second = await userRow(TALEBE_ID);

      expect(second?.lastSeenAt).toEqual(first?.lastSeenAt);
    });

    it("writes nothing for an unauthenticated request", async () => {
      await request(app.getHttpServer()).get("/me").expect(401);
      const rows = await databaseService.db.select().from(users);
      expect(rows).toHaveLength(0);
    });
  });

  describe("GET /me", () => {
    const me = (sub: string) =>
      request(app.getHttpServer()).get("/me").set("Authorization", auth(sub));

    it("reports an admin", async () => {
      const res = await me(ADMIN_ID).expect(200);
      expect(res.body).toMatchObject({
        id: ADMIN_ID,
        email: "admin@example.com",
        givenName: "Ada",
        familyName: "Admin",
        roles: { systemAdmin: true, nazirOf: [], manages: [], teaches: [] },
      });
    });

    it("reports a köşk manager", async () => {
      const res = await me(MANAGER_ID).expect(200);
      expect(res.body.roles).toEqual({
        systemAdmin: false,
        nazirOf: [],
        manages: [{ id: koskId, name: "Süleymaniye Köşkü" }],
        teaches: [],
      });
    });

    it("reports a müderris", async () => {
      const res = await me(MUDERRIS_ID).expect(200);
      expect(res.body.roles).toEqual({
        systemAdmin: false,
        nazirOf: [],
        manages: [],
        teaches: [{ id: courseId, title: "Usûl-i Fıkıh", koskId }],
      });
    });

    it("reports a talebe with no roles", async () => {
      const res = await me(TALEBE_ID).expect(200);
      expect(res.body).toMatchObject({
        id: TALEBE_ID,
        email: "talebe@example.com",
        emailVerified: false,
      });
      expect(res.body.roles).toEqual({
        systemAdmin: false,
        nazirOf: [],
        manages: [],
        teaches: [],
      });
    });
  });

  describe("GET /me: assignments and permissions per scope (MDRS-142)", () => {
    const me = (sub: string) =>
      request(app.getHttpServer()).get("/me").set("Authorization", auth(sub));
    const db = () => databaseService.db;

    it("lists a başmüderris's medrese assignment and the medrese-scoped permissions, and the medrese as one they lead", async () => {
      const [madrasah] = await db()
        .insert(madrasahs)
        .values({
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      await assignRole(db(), {
        userId: HEAD_ID,
        role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
        scopeId: madrasah.id,
        grantedBy: ADMIN_ID,
      });
      const res = await me(HEAD_ID).expect(200);
      expect(res.body.assignments).toEqual([
        expect.objectContaining({
          role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
          scopeType: "madrasah",
          scopeId: madrasah.id,
          scopeName: "Süleymaniye Medresesi",
          isImam: false,
          expiresAt: null,
        }),
      ]);
      expect(res.body.permissions).toHaveLength(1);
      expect(res.body.permissions[0]).toMatchObject({
        scopeType: "madrasah",
        scopeId: madrasah.id,
        roles: [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS],
      });
      expect(res.body.permissions[0].permissions).toEqual(
        expect.arrayContaining(["madrasah.course_open"])
      );
      expect(res.body.permissions[0].permissions).not.toContain("kosk.manage");
      expect(res.body.roles.nazirOf).toEqual([
        { id: madrasah.id, name: "Süleymaniye Medresesi" },
      ]);
    });

    it("lists the medrese of a medrese nazırı as one they are nazır of", async () => {
      const [madrasah] = await db()
        .insert(madrasahs)
        .values({
          handle: "fatih",
          name: "Fâtih Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      await assignRole(db(), {
        userId: DERS_NAZIR_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: madrasah.id,
        grantedBy: ADMIN_ID,
      });
      const res = await me(DERS_NAZIR_ID).expect(200);
      expect(res.body.roles.nazirOf).toEqual([
        { id: madrasah.id, name: "Fâtih Medresesi" },
      ]);
    });

    it("lists a medrese once for a person who is both its başmüderris and its nazır", async () => {
      const [madrasah] = await db()
        .insert(madrasahs)
        .values({
          handle: "fatih",
          name: "Fâtih Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      for (const role of [
        ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
        ASSIGNED_ROLES.MEDRESE_NAZIR,
      ]) {
        await assignRole(db(), {
          userId: HEAD_ID,
          role,
          scopeId: madrasah.id,
          grantedBy: ADMIN_ID,
        });
      }
      const res = await me(HEAD_ID).expect(200);
      expect(res.body.assignments).toHaveLength(2);
      expect(res.body.roles.nazirOf).toEqual([
        { id: madrasah.id, name: "Fâtih Medresesi" },
      ]);
    });

    it("gives a ders nazırı with one group grant exactly the group's permissions", async () => {
      await assignRole(db(), {
        userId: DERS_NAZIR_ID,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: MANAGER_ID,
      });
      const [group] = await db()
        .insert(permissionGroups)
        .values({
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: courseId,
          name: "Ders kadrosu",
          createdBy: MANAGER_ID,
        })
        .returning();
      await db()
        .insert(permissionGroupItems)
        .values(
          ["course.edit", "session.manage"].map((permission) => ({
            groupId: group.id,
            permission,
          }))
        );
      await db().insert(permissionGrants).values({
        userId: DERS_NAZIR_ID,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: courseId,
        permission: null,
        groupId: group.id,
        grantedBy: MANAGER_ID,
      });
      const res = await me(DERS_NAZIR_ID).expect(200);
      expect(res.body.permissions).toEqual([
        {
          scopeType: "course",
          scopeId: courseId,
          scopeName: "Usûl-i Fıkıh",
          roles: [ASSIGNED_ROLES.DERS_NAZIR],
          permissions: ["course.edit", "session.manage"],
        },
      ]);
      expect(res.body.assignments).toHaveLength(1);
      // The ders nazırı is no nazır of any medrese.
      expect(res.body.roles.nazirOf).toEqual([]);
    });

    it("gives a köşk manager the köşk's entry with the course work held across its courses", async () => {
      const res = await me(MANAGER_ID).expect(200);
      expect(res.body.permissions).toHaveLength(1);
      expect(res.body.permissions[0]).toMatchObject({
        scopeType: "kosk",
        scopeId: koskId,
        scopeName: "Süleymaniye Köşkü",
        roles: [ASSIGNED_ROLES.KOSK_NAZIM],
      });
      expect(res.body.permissions[0].permissions).toEqual(
        expect.arrayContaining(["kosk.manage", "course.edit"])
      );
    });

    it("gives a müderris the entry of their course, with the imam flag on the assignment", async () => {
      const res = await me(MUDERRIS_ID).expect(200);
      expect(res.body.assignments).toEqual([
        expect.objectContaining({
          role: ASSIGNED_ROLES.MUDERRIS,
          scopeType: "course",
          scopeId: courseId,
          isImam: true,
        }),
      ]);
      expect(res.body.permissions).toHaveLength(1);
      expect(res.body.permissions[0]).toMatchObject({
        scopeType: "course",
        scopeId: courseId,
        scopeName: "Usûl-i Fıkıh",
        roles: [ASSIGNED_ROLES.MUDERRIS],
      });
      expect(res.body.permissions[0].permissions).toEqual(
        expect.arrayContaining(["course.edit", "session.manage"])
      );
      expect(res.body.permissions[0].permissions).not.toContain("kosk.manage");
    });

    it("stops listing a grant when it expires or is revoked, on the next request", async () => {
      await assignRole(db(), {
        userId: DERS_NAZIR_ID,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: MANAGER_ID,
      });
      const give = async (permission: string) => {
        const [row] = await db()
          .insert(permissionGrants)
          .values({
            userId: DERS_NAZIR_ID,
            scopeType: SCOPE_TYPES.COURSE,
            scopeId: courseId,
            permission,
            groupId: null,
            grantedBy: MANAGER_ID,
          })
          .returning();
        return row;
      };
      const held = async () =>
        (await me(DERS_NAZIR_ID).expect(200)).body.permissions[0].permissions;
      const edit = await give("course.edit");
      const sessions = await give("session.manage");
      expect(await held()).toEqual(["course.edit", "session.manage"]);

      await db()
        .update(permissionGrants)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(permissionGrants.id, edit.id));
      expect(await held()).toEqual(["session.manage"]);

      await db()
        .update(permissionGrants)
        .set({ revokedAt: new Date(), revokedBy: MANAGER_ID })
        .where(eq(permissionGrants.id, sessions.id));
      expect(await held()).toEqual([]);
    });

    it("gives a Medaris nazımı the platform entry: what was granted, and nothing else", async () => {
      await db().insert(roleAssignments).values({
        userId: MEDARIS_ID,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
      expect((await me(MEDARIS_ID).expect(200)).body.permissions).toEqual([
        {
          scopeType: "platform",
          scopeId: null,
          scopeName: null,
          roles: [ASSIGNED_ROLES.MEDARIS_NAZIM],
          permissions: [],
        },
      ]);
      await db().insert(permissionGrants).values({
        userId: MEDARIS_ID,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: "platform.kosk_create",
        groupId: null,
        grantedBy: ADMIN_ID,
      });
      expect(
        (await me(MEDARIS_ID).expect(200)).body.permissions[0].permissions
      ).toEqual(["platform.kosk_create"]);
    });

    it("reads what a caller holds in a fixed number of statements, however many scopes they hold it in", async () => {
      // Every pool of the app, whichever module opened it.
      const original = Pool.prototype.query;
      let statements = 0;
      Pool.prototype.query = function (this: Pool, ...args: unknown[]) {
        statements += 1;
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as typeof Pool.prototype.query;
      const overview = app.get(AssignmentService);
      const counted = async (userId: string) => {
        statements = 0;
        await overview.myOverview({ sub: userId });
        return statements;
      };
      try {
        await assignRole(db(), {
          userId: DERS_NAZIR_ID,
          role: ASSIGNED_ROLES.DERS_NAZIR,
          scopeId: courseId,
          grantedBy: MANAGER_ID,
        });
        const one = await counted(DERS_NAZIR_ID);
        // Six more courses, a köşk and a medrese: more scopes, more entries.
        const [madrasah] = await db()
          .insert(madrasahs)
          .values({
            handle: "fatih",
            name: "Fâtih Medresesi",
            createdBy: ADMIN_ID,
          })
          .returning();
        for (let n = 0; n < 6; n++) {
          const [extra] = await db()
            .insert(courses)
            .values({
              koskId,
              madrasahId: madrasah.id,
              authorId: MANAGER_ID,
              title: `Ders ${n}`,
            })
            .returning();
          await assignRole(db(), {
            userId: DERS_NAZIR_ID,
            role: ASSIGNED_ROLES.DERS_NAZIR,
            scopeId: extra.id,
            grantedBy: MANAGER_ID,
          });
        }
        await assignRole(db(), {
          userId: DERS_NAZIR_ID,
          role: ASSIGNED_ROLES.KOSK_NAZIM,
          scopeId: koskId,
          grantedBy: MANAGER_ID,
        });
        await assignRole(db(), {
          userId: DERS_NAZIR_ID,
          role: ASSIGNED_ROLES.MEDRESE_NAZIR,
          scopeId: madrasah.id,
          grantedBy: MANAGER_ID,
        });
        const many = await counted(DERS_NAZIR_ID);
        const entries = (await overview.myOverview({ sub: DERS_NAZIR_ID }))
          .permissions;
        expect(entries.length).toBe(9);
        // Read off the run: the role rows, the loader's two reads, the
        // names (courses and their enrolment counts), and who granted. The
        // köşk and the medrese add one statement each; the other six courses
        // add none.
        expect(one).toBe(6);
        expect(many).toBe(8);
      } finally {
        Pool.prototype.query = original;
      }
    });

    it("lists nothing for a başnazım with no role rows (the realm role is everything) and for a talebe", async () => {
      const admin = await me(ADMIN_ID).expect(200);
      expect(admin.body).toMatchObject({
        roles: { systemAdmin: true },
        assignments: [],
        permissions: [],
      });
      const talebe = await me(TALEBE_ID).expect(200);
      expect(talebe.body).toMatchObject({ assignments: [], permissions: [] });
    });

    it("lists the role rows a başnazım holds like anyone's; the realm role adds none", async () => {
      await assignRole(db(), {
        userId: ADMIN_ID,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: koskId,
        grantedBy: ADMIN_ID,
      });
      const res = await me(ADMIN_ID).expect(200);
      expect(res.body.roles.systemAdmin).toBe(true);
      expect(res.body.assignments).toEqual([
        expect.objectContaining({
          role: ASSIGNED_ROLES.KOSK_NAZIM,
          scopeType: "kosk",
          scopeId: koskId,
        }),
      ]);
      expect(res.body.permissions).toHaveLength(1);
      expect(res.body.permissions[0]).toMatchObject({
        scopeType: "kosk",
        scopeId: koskId,
        roles: [ASSIGNED_ROLES.KOSK_NAZIM],
      });
    });

    it("leaves out a role whose köşk no longer exists", async () => {
      const gone = "a0000000-0000-4000-8000-0000000000fe";
      await assignRole(db(), {
        userId: HEAD_ID,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: gone,
        grantedBy: ADMIN_ID,
      });
      const res = await me(HEAD_ID).expect(200);
      expect(res.body.assignments).toEqual([]);
      expect(res.body.permissions).toEqual([]);
    });

    it("drops a role that has ended on the next request", async () => {
      expect((await me(MANAGER_ID).expect(200)).body.permissions).toHaveLength(
        1
      );
      await db()
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(roleAssignments.userId, MANAGER_ID));
      const res = await me(MANAGER_ID).expect(200);
      expect(res.body.permissions).toEqual([]);
      expect(res.body.assignments).toEqual([]);
    });
  });

  describe("PATCH /me", () => {
    const patch = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch("/me")
        .set("Authorization", auth(TALEBE_ID))
        .send(body);

    it("sets the time zone and locale", async () => {
      const res = await patch({
        timeZone: "Europe/Istanbul",
        locale: "ar",
      }).expect(200);
      expect(res.body).toMatchObject({
        timeZone: "Europe/Istanbul",
        locale: "ar",
      });
      expect(await userRow(TALEBE_ID)).toMatchObject({
        timeZone: "Europe/Istanbul",
        locale: "ar",
      });
    });

    it("clears a setting with null and leaves an absent one alone", async () => {
      await patch({ timeZone: "Europe/Istanbul", locale: "tr" }).expect(200);
      const res = await patch({ timeZone: null }).expect(200);
      expect(res.body).toMatchObject({ timeZone: null, locale: "tr" });
    });

    it("keeps the user's locale when the next token carries another", async () => {
      await patch({ locale: "ar" }).expect(200);
      // A changed name forces the upsert past the cache, so this exercises
      // the database write, not the cache skipping it.
      await request(app.getHttpServer())
        .get("/kosks")
        .set(
          "Authorization",
          auth(TALEBE_ID, {
            ...claimsFor[TALEBE_ID],
            family_name: "Talebe-Yeni",
            locale: "en",
          })
        )
        .expect(200);
      const row = await userRow(TALEBE_ID);
      expect(row?.familyName).toBe("Talebe-Yeni");
      expect(row?.locale).toBe("ar");
    });

    it("rejects an unknown time zone", async () => {
      const res = await patch({ timeZone: "Mars/Olympus" }).expect(400);
      expect(res.body.context.errors[0]).toHaveProperty("property", "timeZone");
    });

    it("rejects fields other than timeZone and locale", async () => {
      await patch({ email: "someone-else@example.com" }).expect(400);
    });
  });

  describe("GET /users?email=", () => {
    const lookup = (sub: string, email: string) =>
      request(app.getHttpServer())
        .get("/users")
        .query({ email })
        .set("Authorization", auth(sub));

    beforeEach(async () => {
      // The talebe must exist before anyone can find them.
      await request(app.getHttpServer())
        .get("/me")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
    });

    it("refuses a plain talebe with 403", async () => {
      await lookup(TALEBE_ID, "talebe@example.com").expect(403);
    });

    it("refuses a müderris who manages no köşk with 403", async () => {
      await lookup(MUDERRIS_ID, "talebe@example.com").expect(403);
    });

    it("returns exactly one user to a köşk manager", async () => {
      const res = await lookup(MANAGER_ID, "talebe@example.com").expect(200);
      expect(res.body).toEqual([
        {
          id: TALEBE_ID,
          givenName: "Talha",
          familyName: "Talebe",
          email: "talebe@example.com",
        },
      ]);
    });

    it("matches the address case-insensitively", async () => {
      const res = await lookup(MANAGER_ID, "Talebe@Example.com").expect(200);
      expect(res.body).toHaveLength(1);
    });

    it("returns zero results for an unknown address", async () => {
      const res = await lookup(MANAGER_ID, "nobody@example.com").expect(200);
      expect(res.body).toEqual([]);
    });

    it("does not match a prefix", async () => {
      const res = await lookup(MANAGER_ID, "talebe@example.co").expect(200);
      expect(res.body).toEqual([]);
    });

    it("rejects a value that is not an e-mail address", async () => {
      await lookup(MANAGER_ID, "talebe%").expect(400);
    });

    it("lets a SYSTEM_ADMIN look users up", async () => {
      const res = await lookup(ADMIN_ID, "talebe@example.com").expect(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
