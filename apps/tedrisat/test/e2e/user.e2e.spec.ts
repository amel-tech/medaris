import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
  courses,
} from "../../src/database/schema/course.schema";
import { koskManagers, kosks } from "../../src/database/schema/kosk.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
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
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    const [kosk] = await databaseService.db
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Süleymaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    // Managing is `kosk_managers` since MDRS-126, which `POST /kosks` fills
    // and a direct insert does not.
    await databaseService.db
      .insert(koskManagers)
      .values({ koskId, userId: MANAGER_ID, addedBy: MANAGER_ID });
    const [course] = await databaseService.db
      .insert(courses)
      .values({ koskId, authorId: MANAGER_ID, title: "Usûl-i Fıkıh" })
      .returning();
    courseId = course.id;
    await databaseService.db
      .insert(courseMuderris)
      .values({ courseId, userId: MUDERRIS_ID, name: "Musa Müderris" });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
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
