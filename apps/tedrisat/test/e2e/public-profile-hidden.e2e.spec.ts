import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { users } from "../../src/database/schema/user.schema";
import { userProfiles } from "../../src/database/schema/user-profile.schema";
import { UserProfileRepository } from "../../src/user/user-profile.repository";
import { asSystemAdmin } from "../helpers/system-admin.helper";
import { createTestApp } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-141: the owner hid the talebe's public profile for everyone. With
 * `PUBLIC_PROFILE_ENABLED` at its default (unset, so false) the three
 * /public-profile routes answer one 404 for every signed-in caller, the
 * başnazım included, before anything is read or written. The cases of
 * profile.e2e.spec.ts run the routes themselves with the switch on.
 */
const ZEYNEP = "c1000000-0000-4000-8000-000000000001";
const OMER = "c1000000-0000-4000-8000-000000000002";
const ADMIN = "c1000000-0000-4000-8000-0000000000aa";
const NOBODY = "c1000000-0000-4000-8000-0000000000ff";

const talebe = (sub: string) =>
  bearerFor({
    sub,
    claims: {
      email: `${sub}@example.com`,
      given_name: "Ad",
      family_name: "Soyad",
    },
  });

describe("Public profile hidden (e2e, MDRS-141)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    delete process.env.PUBLIC_PROFILE_ENABLED;
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("user_profiles", "users");
    // A person who did choose a künye: the answer must not tell this one from
    // an unknown id.
    await databaseService.db
      .insert(users)
      .values({ id: ZEYNEP, email: "zeynep@example.com" });
    await app
      .get(UserProfileRepository)
      .upsert(ZEYNEP, { kunye: "Zeynep Betül", gender: "FEMALE" });
  });

  afterAll(async () => {
    await dbUtils.cleanTables("user_profiles", "users");
    await app.close();
  });

  const routes = [
    ["GET", "/me/public-profile"],
    ["PATCH", "/me/public-profile"],
    ["GET", `/users/${ZEYNEP}/public-profile`],
    ["GET", `/users/${NOBODY}/public-profile`],
  ] as const;

  const call = (method: "GET" | "PATCH", path: string) => {
    const req =
      method === "GET"
        ? request(server()).get(path)
        : request(server()).patch(path);
    return method === "PATCH" ? req.send({ kunye: "Yeni Künye" }) : req;
  };

  const callers = [
    ["a signed-in student", () => talebe(OMER)],
    ["the başnazım", () => asSystemAdmin(ADMIN)],
  ] as const;

  describe.each(callers)("for %s", (_who, header) => {
    it.each(
      routes
    )("%s %s answers 404 PUBLIC_PROFILE_UNAVAILABLE", async (method, path) => {
      const res = await call(method, path).set({ Authorization: header() });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("PUBLIC_PROFILE_UNAVAILABLE");
    });

    it("gives the same body for a person with a profile and for one without", async () => {
      const known = await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .set({ Authorization: header() });
      const unknown = await request(server())
        .get(`/users/${NOBODY}/public-profile`)
        .set({ Authorization: header() });
      const { timestamp: _a, ...knownBody } = known.body;
      const { timestamp: _b, ...unknownBody } = unknown.body;
      expect(knownBody).toEqual(unknownBody);
      expect(JSON.stringify(known.body)).not.toContain("Zeynep");
    });
  });

  it("answers 404 before the pipes: a malformed id or body is not a 400", async () => {
    await request(server())
      .get("/users/not-a-uuid/public-profile")
      .set({ Authorization: talebe(OMER) })
      .expect(404);
    await request(server())
      .patch("/me/public-profile")
      .set({ Authorization: talebe(OMER) })
      .send({ gender: "OTHER", unknownField: 1 })
      .expect(404);
  });

  it("keeps a missing or bad token a 401, never a 404", async () => {
    for (const [method, path] of routes) {
      await call(method, path).expect(401);
      await call(method, path)
        .set({ Authorization: "Bearer not-a-token" })
        .expect(401);
    }
  });

  it("writes nothing: no profile change and no users row for the caller", async () => {
    const before = await databaseService.db.select().from(userProfiles);

    await request(server())
      .patch("/me/public-profile")
      .set({ Authorization: talebe(OMER) })
      .send({ kunye: "Yeni Künye", city: "Konya", visibility: { city: true } })
      .expect(404);
    await request(server())
      .get("/me/public-profile")
      .set({ Authorization: talebe(OMER) })
      .expect(404);

    expect(await databaseService.db.select().from(userProfiles)).toEqual(
      before
    );
    const people = await databaseService.db
      .select({ id: users.id })
      .from(users);
    expect(people.map((p) => p.id)).toEqual([ZEYNEP]);
  });
});
