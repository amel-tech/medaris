import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { courseMuderris } from "../../src/database/schema/course.schema";
import { users } from "../../src/database/schema/user.schema";
import {
  KEYCLOAK_ADMIN_FETCH,
  KeycloakAdminService,
} from "../../src/keycloak-admin/keycloak-admin.service";
import { openKosk } from "../helpers/open-scopes.helper";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

/**
 * MDRS-218: nizam's "Ders aç" (`POST /kosks/:id/courses`) and the müderris
 * list (`PUT /courses/:id/muderris`) accept a teacher who has a realm account
 * but has never signed in, as nazar's "Dersi aç" and every other role
 * assignment already did. An id neither the app nor the realm knows is still
 * refused, and a directory that does not answer is a 503, not "unknown".
 */
const SIGNED_IN = "d0000000-0000-4000-8000-000000000001";
const NEWCOMER = "d0000000-0000-4000-8000-000000000002";
const NOBODY = "d0000000-0000-4000-8000-0000000000ff";

let directoryDown = false;

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
  if (directoryDown) return json({}, 502);
  if (url.endsWith(`/admin/realms/r/users/${NEWCOMER}`)) {
    return json({
      id: NEWCOMER,
      email: "yeni@example.com",
      firstName: "Yeni",
      lastName: "Müderris",
      enabled: true,
    });
  }
  return json({}, 404);
}

const payload = (muderris: { userId: string; name: string }[]) => ({
  title: "Emsile",
  status: "DRAFT",
  muderris,
  weeks: [],
  resources: [],
});

describe("müderris accounts that never signed in (e2e)", () => {
  let app: INestApplication;
  let adminApp: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      authUserId: TEST_USER_ID,
      overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
    });
    adminApp = await createTestApp();
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

  beforeEach(async () => {
    directoryDown = false;
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    await databaseService.db
      .insert(users)
      .values([TEST_USER_ID, SIGNED_IN].map((id) => ({ id })));
    const kosk = await openKosk(adminApp);
    koskId = kosk.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    await app.close();
    await adminApp.close();
  });

  it("opens a course whose müderris has a realm account but never signed in", async () => {
    const res = await http()
      .post(`/kosks/${koskId}/courses`)
      .send(payload([{ userId: NEWCOMER.toUpperCase(), name: "Yeni" }]))
      .expect(201);

    const rows = await databaseService.db
      .select({ userId: courseMuderris.userId })
      .from(courseMuderris)
      .where(eq(courseMuderris.courseId, res.body.id));
    expect(rows.map((r) => r.userId?.toLowerCase())).toEqual([NEWCOMER]);
  });

  it("adds such a müderris to an existing course", async () => {
    const course = await http()
      .post(`/kosks/${koskId}/courses`)
      .send(payload([{ userId: SIGNED_IN, name: "Ahmed" }]))
      .expect(201);

    await http()
      .put(`/courses/${course.body.id}/muderris`)
      .send({
        version: course.body.version,
        muderris: [
          { userId: SIGNED_IN, name: "Ahmed" },
          { userId: NEWCOMER, name: "Yeni" },
        ],
        imamUserId: SIGNED_IN,
      })
      .expect(200);
  });

  it("still refuses an id that neither the app nor the realm knows", async () => {
    await http()
      .post(`/kosks/${koskId}/courses`)
      .send(payload([{ userId: NOBODY, name: "Yok" }]))
      .expect(404)
      .expect((res) => expect(res.body.code).toBe("MUDERRIS_UNKNOWN_USER"));
  });

  it("answers 503, not 'unknown', when the realm's directory does not answer", async () => {
    directoryDown = true;
    await http()
      .post(`/kosks/${koskId}/courses`)
      .send(payload([{ userId: NEWCOMER, name: "Yeni" }]))
      .expect(503)
      .expect((res) =>
        expect(res.body.code).toBe("KEYCLOAK_ADMIN_UNAVAILABLE")
      );
  });
});
