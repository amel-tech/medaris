import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { seedAccounts } from "../helpers/open-scopes.helper";
import { asSystemAdmin } from "../helpers/system-admin.helper";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";
const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

describe("KoskController (e2e)", () => {
  let app: INestApplication;
  let adminApp: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    adminApp = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    await seedAccounts(adminApp, [TEST_USER_ID]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    await app.close();
    await adminApp.close();
  });

  // Opening a köşk is the başnazım's (2026-10-02), together with its nazımları
  // (MDRS-136). The admin signs with TEST_USER_ID's own `sub` and names
  // TEST_USER_ID, so the köşk is TEST_USER_ID's to manage and every other
  // request below runs as that ordinary manager.
  const createKosk = (overrides: Record<string, unknown> = {}) =>
    request(adminApp.getHttpServer())
      .post("/kosks")
      .set("Authorization", asSystemAdmin(TEST_USER_ID))
      .send({
        name: "Süleymaniye Köşkü",
        handle: "@suleymaniye",
        managerUserIds: [TEST_USER_ID],
        ...overrides,
      });

  describe("/kosks (POST)", () => {
    it("refuses an ordinary caller and writes nothing — only SYSTEM_ADMIN opens a köşk", async () => {
      await request(app.getHttpServer())
        .post("/kosks")
        .send({ name: "Süleymaniye Köşkü", handle: "@suleymaniye" })
        .expect(403);

      expect(await databaseService.db.select().from(kosks)).toHaveLength(0);
      expect(
        await databaseService.db.select().from(roleAssignments)
      ).toHaveLength(0);
    });

    it("lets SYSTEM_ADMIN create a köşk, owned by the signed-in admin", () => {
      return createKosk({ description: "Klasik medrese.", coverHue: 215 })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body).toHaveProperty("name", "Süleymaniye Köşkü");
          expect(res.body).toHaveProperty("ownerId", TEST_USER_ID);
          expect(res.body).toHaveProperty("coverHue", 215);
          // Listed unless asked otherwise (MDRS-122, migration 0022).
          expect(res.body).toHaveProperty("isPrivate", false);
          // discovery defaults + derived stats
          expect(res.body).toHaveProperty("tags", []);
          expect(res.body).toHaveProperty("verified", false);
          expect(res.body).toHaveProperty("rating", 0);
          expect(res.body).toHaveProperty("studentCount", 0);
          expect(res.body).toHaveProperty("muderrisCount", 0);
          expect(res.body).toHaveProperty("followerCount", 0);
          expect(res.body).toHaveProperty("isFollowing", false);
        });
    });

    it("persists owner-settable discovery fields", () => {
      return createKosk({
        field: "Tefsir & Hadis",
        level: "ADVANCED",
        tags: ["Tefsir", "Hadis"],
      })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("field", "Tefsir & Hadis");
          expect(res.body).toHaveProperty("level", "ADVANCED");
          expect(res.body).toHaveProperty("tags", ["Tefsir", "Hadis"]);
        });
    });

    it("rejects client-set verified/featured/rating (not whitelisted)", () => {
      return createKosk({ verified: true, featured: true, rating: 5 }).expect(
        400
      );
    });

    it("rejects an empty name", () => {
      return createKosk({ name: "" })
        .expect(400)
        .expect((res) => {
          expect(res.body.context.errors[0]).toHaveProperty("property", "name");
        });
    });

    // MDRS-29: the validation pipe used to copy the rejected value into the
    // error context, which the filter serialises verbatim — a secret pasted
    // into the wrong field came straight back to the browser.
    it("does not echo the rejected value back to the client", () => {
      const sentinel = `s3nt1nel-${"x".repeat(70)}`;
      return createKosk({ handle: sentinel })
        .expect(400)
        .expect((res) => {
          expect(JSON.stringify(res.body)).not.toContain("s3nt1nel");
          expect(res.body.context.errors[0]).toHaveProperty(
            "property",
            "handle"
          );
        });
    });

    it("rejects an out-of-range coverHue", () => {
      return createKosk({ coverHue: 999 })
        .expect(400)
        .expect((res) => {
          expect(res.body.context.errors[0]).toHaveProperty(
            "property",
            "coverHue"
          );
        });
    });
  });

  describe("/kosks (GET, paginated)", () => {
    it("returns an empty page when none exist", () => {
      return request(app.getHttpServer())
        .get("/kosks")
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.items)).toBe(true);
          expect(res.body.items).toHaveLength(0);
          expect(res.body).toHaveProperty("total", 0);
          expect(res.body).toHaveProperty("page", 1);
          expect(res.body).toHaveProperty("limit", 12);
        });
    });

    it("returns köşks with stats and pagination meta", async () => {
      await createKosk().expect(201);
      return request(app.getHttpServer())
        .get("/kosks")
        .expect(200)
        .expect((res) => {
          expect(res.body.items).toHaveLength(1);
          expect(res.body).toHaveProperty("total", 1);
          expect(res.body.items[0]).toHaveProperty("courseCount", 0);
        });
    });

    it("honours page/limit", async () => {
      // A short name is one köşk's alone (MDRS-174), so each gets its own.
      await createKosk({ handle: "bir" }).expect(201);
      await createKosk({ handle: "iki" }).expect(201);
      await createKosk({ handle: "uc" }).expect(201);
      return request(app.getHttpServer())
        .get("/kosks?page=1&limit=2")
        .expect(200)
        .expect((res) => {
          expect(res.body.items).toHaveLength(2);
          expect(res.body).toHaveProperty("total", 3);
          expect(res.body).toHaveProperty("limit", 2);
        });
    });
  });

  // MDRS-108: nizam's köşk list asks for the caller's own köşks only.
  describe("/kosks?managedBy=me", () => {
    const insertForeignKosk = async (name: string) => {
      const [other] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OTHER_USER_ID, name })
        .returning();
      await assignRole(databaseService.db, {
        userId: OTHER_USER_ID,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: other.id,
        grantedBy: OTHER_USER_ID,
      });
      return other;
    };

    it("lists only the köşks the caller manages, and counts only those", async () => {
      const mine = await createKosk({ name: "Benim Köşküm" }).expect(201);
      await insertForeignKosk("Başka Köşk");

      await request(app.getHttpServer())
        .get("/kosks")
        .expect(200)
        .expect((res) => expect(res.body).toHaveProperty("total", 2));

      return request(app.getHttpServer())
        .get("/kosks?managedBy=me")
        .expect(200)
        .expect((res) => {
          expect(res.body.items.map((k: { id: string }) => k.id)).toEqual([
            mine.body.id,
          ]);
          expect(res.body).toHaveProperty("total", 1);
          expect(res.body.items[0].managerIds).toContain(TEST_USER_ID);
        });
    });

    it("includes a köşk the caller was added to as a second manager", async () => {
      const other = await insertForeignKosk("Ortak Köşk");
      await assignRole(databaseService.db, {
        userId: TEST_USER_ID,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: other.id,
        grantedBy: OTHER_USER_ID,
      });

      return request(app.getHttpServer())
        .get("/kosks?managedBy=me")
        .expect(200)
        .expect((res) => {
          expect(res.body.items.map((k: { id: string }) => k.id)).toEqual([
            other.id,
          ]);
          expect(res.body).toHaveProperty("total", 1);
        });
    });

    it("pages through the caller's köşks with the list's page/limit", async () => {
      await createKosk({ name: "Bir", handle: "bir" }).expect(201);
      await createKosk({ name: "İki", handle: "iki" }).expect(201);
      await createKosk({ name: "Üç", handle: "uc" }).expect(201);
      await insertForeignKosk("Başka Köşk");

      const first = await request(app.getHttpServer())
        .get("/kosks?managedBy=me&page=1&limit=2")
        .expect(200);
      const second = await request(app.getHttpServer())
        .get("/kosks?managedBy=me&page=2&limit=2")
        .expect(200);

      expect(first.body).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(first.body.items).toHaveLength(2);
      expect(second.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(second.body.items).toHaveLength(1);
      const ids = [...first.body.items, ...second.body.items].map(
        (k: { id: string }) => k.id
      );
      expect(new Set(ids).size).toBe(3);
    });

    it("answers an empty page to a caller who manages nothing", async () => {
      await insertForeignKosk("Başka Köşk");
      return request(app.getHttpServer())
        .get("/kosks?managedBy=me")
        .expect(200)
        .expect((res) => {
          expect(res.body.items).toHaveLength(0);
          expect(res.body).toHaveProperty("total", 0);
        });
    });

    it("refuses any value but `me` — it never lists another user's köşks", () => {
      return request(app.getHttpServer())
        .get(`/kosks?managedBy=${OTHER_USER_ID}`)
        .expect(400);
    });
  });

  // MDRS-108: the köşk form's discovery fields.
  describe("köşk form fields", () => {
    it("updates and clears field, level, tags and coverHue", async () => {
      const created = await createKosk().expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/kosks/${id}`)
        .send({
          field: "Fıkıh",
          level: "BEGINNER",
          tags: ["Usûl", "Fürû"],
          coverHue: 30,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({
            field: "Fıkıh",
            level: "BEGINNER",
            tags: ["Usûl", "Fürû"],
            coverHue: 30,
          });
        });

      return request(app.getHttpServer())
        .patch(`/kosks/${id}`)
        .send({ field: null, level: null, tags: [] })
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({
            field: null,
            level: null,
            tags: [],
            coverHue: 30,
            name: "Süleymaniye Köşkü",
          });
        });
    });

    it.each([
      ["level", { level: "EXPERT" }],
      ["tags", { tags: Array.from({ length: 11 }, (_, i) => `etiket-${i}`) }],
      ["tags", { tags: ["x".repeat(41)] }],
      ["tags", { tags: ["Tefsir", "Tefsir"] }],
      ["tags", { tags: ["  "] }],
      ["field", { field: "x".repeat(61) }],
    ])("refuses an invalid %s on create", (property, body) => {
      return createKosk(body)
        .expect(400)
        .expect((res) => {
          expect(res.body.context.errors[0]).toHaveProperty(
            "property",
            property
          );
        });
    });

    // A NOT NULL column sent as null used to pass `@IsOptional()` and come
    // back from Postgres as a 500.
    it.each([
      ["name"],
      ["coverHue"],
      ["tags"],
      ["isPrivate"],
    ])("refuses a null %s on update with 400, not 500", async (property) => {
      const created = await createKosk().expect(201);
      return request(app.getHttpServer())
        .patch(`/kosks/${created.body.id}`)
        .send({ [property]: null })
        .expect(400)
        .expect((res) => {
          expect(res.body.context.errors[0]).toHaveProperty(
            "property",
            property
          );
        });
    });

    it("refuses a null coverHue on create with 400, not 500", () => {
      return createKosk({ coverHue: null }).expect(400);
    });
  });

  describe("/kosks/:id (GET)", () => {
    it("returns 404 for a missing köşk", () => {
      return request(app.getHttpServer())
        .get(`/kosks/${MISSING_UUID}`)
        .expect(404);
    });

    it("returns 400 for a malformed id", () => {
      return request(app.getHttpServer()).get("/kosks/not-a-uuid").expect(400);
    });

    it("returns the köşk when it exists", async () => {
      const created = await createKosk().expect(201);
      return request(app.getHttpServer())
        .get(`/kosks/${created.body.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("id", created.body.id);
          expect(res.body).toHaveProperty("courseCount", 0);
        });
    });
  });

  describe("/kosks/:id (PATCH/DELETE)", () => {
    it("updates a köşk", async () => {
      const created = await createKosk().expect(201);
      return request(app.getHttpServer())
        .patch(`/kosks/${created.body.id}`)
        .send({ name: "Fatih Köşkü" })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("name", "Fatih Köşkü");
        });
    });

    it("refuses the owner's DELETE — only SYSTEM_ADMIN deletes (MDRS-124)", async () => {
      const created = await createKosk().expect(201);
      await request(app.getHttpServer())
        .delete(`/kosks/${created.body.id}`)
        .expect(403);

      return request(app.getHttpServer())
        .get(`/kosks/${created.body.id}`)
        .expect(200);
    });

    it("answers 404 to a DELETE of a köşk that does not exist", () => {
      return request(app.getHttpServer())
        .delete(`/kosks/${MISSING_UUID}`)
        .expect(404);
    });

    it("forbids a non-owner from editing or deleting a köşk", async () => {
      // a köşk owned by a different user
      const [other] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OTHER_USER_ID, name: "Başka Köşk" })
        .returning();
      await assignRole(databaseService.db, {
        userId: OTHER_USER_ID,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: other.id,
        grantedBy: OTHER_USER_ID,
      });

      await request(app.getHttpServer())
        .patch(`/kosks/${other.id}`)
        .send({ name: "Ele geçirildi" })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/kosks/${other.id}`)
        .expect(403);
    });
  });

  describe("/kosks/:id/follow", () => {
    it("follows and unfollows a köşk, reflected in isFollowing/followerCount", async () => {
      const created = await createKosk().expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/kosks/${id}/follow`)
        .expect(201);

      await request(app.getHttpServer())
        .get(`/kosks/${id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("isFollowing", true);
          expect(res.body).toHaveProperty("followerCount", 1);
        });

      // idempotent: following again does not duplicate
      await request(app.getHttpServer())
        .post(`/kosks/${id}/follow`)
        .expect(201);
      await request(app.getHttpServer())
        .get(`/kosks/${id}`)
        .expect(200)
        .expect((res) => expect(res.body).toHaveProperty("followerCount", 1));

      await request(app.getHttpServer())
        .delete(`/kosks/${id}/follow`)
        .expect(200);
      return request(app.getHttpServer())
        .get(`/kosks/${id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("isFollowing", false);
          expect(res.body).toHaveProperty("followerCount", 0);
        });
    });

    it("returns 404 when following a missing köşk", () => {
      return request(app.getHttpServer())
        .post(`/kosks/${MISSING_UUID}/follow`)
        .expect(404);
    });
  });
});
