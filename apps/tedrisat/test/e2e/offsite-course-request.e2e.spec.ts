import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { offsiteCourseRequests } from "../../src/database/schema/offsite-course-request.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
} from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-187, nazir/09: a medrese asks a köşk to open a course outside it,
 * against a real Postgres. The request is a record for the köşk side to read
 * later; nothing here creates a course. Real `AuthGuard` with minted tokens;
 * the medrese's başmüderris is the only medrese role the matrix resolves.
 */
const ADMIN_ID = "e9000000-0000-4000-8000-000000000001";
const HEAD_ID = "e9000000-0000-4000-8000-000000000002";
const NAZIR_ID = "e9000000-0000-4000-8000-000000000003";
const OTHER_HEAD_ID = "e9000000-0000-4000-8000-000000000004";
const MANAGER_ID = "e9000000-0000-4000-8000-000000000005";
const STRANGER_ID = "e9000000-0000-4000-8000-000000000006";
const MISSING_ID = "e9000000-0000-4000-8000-00000000ffff";

// Signing in writes the token's name to the users row, so the sender's name
// is whatever the token of the day carries.
const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID
        ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } }
        : sub === HEAD_ID
          ? { given_name: "Mehmet Emin", family_name: "Işıkoğlu" }
          : {},
  });

describe("Offsite course requests (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let hostingKoskId: string;
  let plainKoskId: string;
  let hiddenKoskId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const send = (sub: string, body: object, id = madrasahId) =>
    http()
      .post(`/madrasahs/${id}/offsite-course-requests`)
      .set("Authorization", auth(sub))
      .send(body);
  const body = (over: Record<string, unknown> = {}) => ({
    koskId: plainKoskId,
    title: "Erbaîn-i Nevevî okumaları",
    reason: "Medresemizde bu metni okutan bir ders yok.",
    ...over,
  });
  const read = (sub: string, id = madrasahId) =>
    http()
      .get(`/madrasahs/${id}/offsite-course-requests`)
      .set("Authorization", auth(sub));

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
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
    const [hosting, plain, hidden] = await db()
      .insert(kosks)
      .values([
        { ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" },
        { ownerId: MANAGER_ID, name: "Beyazıt Köşkü" },
        { ownerId: MANAGER_ID, name: "Gizli Köşk", archivedAt: new Date() },
      ])
      .returning();
    hostingKoskId = hosting.id;
    plainKoskId = plain.id;
    hiddenKoskId = hidden.id;
    await db()
      .insert(madrasahKoskHosting)
      .values({ madrasahId, koskId: hostingKoskId, grantedBy: ADMIN_ID });
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });
    await assignRole(db(), {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
    });
    await assignRole(db(), {
      userId: OTHER_HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: otherMadrasahId,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
  });

  describe("POST /madrasahs/:id/offsite-course-requests", () => {
    it("records the köşk, the name and the reason as a pending request of the medrese, and creates no course", async () => {
      const res = await send(HEAD_ID, body()).expect(201);
      expect(res.body).toMatchObject({
        madrasahId,
        koskId: plainKoskId,
        koskName: "Beyazıt Köşkü",
        title: "Erbaîn-i Nevevî okumaları",
        reason: "Medresemizde bu metni okutan bir ders yok.",
        status: "PENDING",
        requestedById: HEAD_ID,
        requestedByName: "Mehmet Emin Işıkoğlu",
        createdAt: expect.any(String),
      });
      const [row] = await db().select().from(offsiteCourseRequests);
      expect(row).toMatchObject({
        id: res.body.id,
        madrasahId,
        koskId: plainKoskId,
        requestedBy: HEAD_ID,
        status: "PENDING",
      });
      const [audit] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "offsite_course_request.create"));
      expect(audit).toMatchObject({ actorId: HEAD_ID, entityId: row.id });
      // The request is no course: not in the köşk, not in the medrese's list.
      expect(await db().select().from(courses)).toHaveLength(0);
      const listed = await http()
        .get(`/madrasahs/${madrasahId}/courses`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
      expect(listed.body).toEqual([]);
    });

    it("trims the name and the reason, and does not look at the medrese's hosting rights", async () => {
      const res = await send(
        HEAD_ID,
        body({
          koskId: hostingKoskId,
          title: "  Mantık okumaları  ",
          reason: "  Yeni bir ders.  ",
        })
      ).expect(201);
      expect(res.body).toMatchObject({
        koskId: hostingKoskId,
        title: "Mantık okumaları",
        reason: "Yeni bir ders.",
      });
    });

    it("answers 404 for a köşk that is missing or hidden, and for an unknown medrese", async () => {
      await send(HEAD_ID, body({ koskId: MISSING_ID })).expect(404);
      await send(HEAD_ID, body({ koskId: hiddenKoskId })).expect(404);
      await send(HEAD_ID, body(), MISSING_ID).expect(404);
      expect(await db().select().from(offsiteCourseRequests)).toHaveLength(0);
    });

    it("validates the body", async () => {
      await send(HEAD_ID, body({ title: "a" })).expect(400);
      await send(HEAD_ID, body({ title: "   " })).expect(400);
      await send(HEAD_ID, body({ title: "x".repeat(201) })).expect(400);
      await send(HEAD_ID, body({ reason: "   " })).expect(400);
      await send(HEAD_ID, body({ reason: "x".repeat(2001) })).expect(400);
      await send(HEAD_ID, body({ koskId: "not-a-uuid" })).expect(400);
      await send(HEAD_ID, { title: "Ders", reason: "Neden" }).expect(400);
      await send(HEAD_ID, body({ status: "ACCEPTED" })).expect(400);
      expect(await db().select().from(offsiteCourseRequests)).toHaveLength(0);
    });

    it("is the başmüderris's: strangers, another medrese's head and a nazır get 403, the başnazım may", async () => {
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIR_ID, MANAGER_ID]) {
        await send(sub, body()).expect(403);
      }
      await http()
        .post(`/madrasahs/${madrasahId}/offsite-course-requests`)
        .send(body())
        .expect(401);
      expect(await db().select().from(offsiteCourseRequests)).toHaveLength(0);
      await send(ADMIN_ID, body()).expect(201);
    });
  });

  describe("GET /madrasahs/:id/offsite-course-requests", () => {
    it("lists the medrese's own requests, newest first, with their köşk and status", async () => {
      const first = await send(HEAD_ID, body({ title: "Birinci" })).expect(201);
      const second = await send(
        HEAD_ID,
        body({ title: "İkinci", koskId: hostingKoskId })
      ).expect(201);
      await send(
        OTHER_HEAD_ID,
        body({ title: "Başkasının" }),
        otherMadrasahId
      ).expect(201);
      const res = await read(HEAD_ID).expect(200);
      expect(
        res.body.map((r: { id: string; koskName: string; status: string }) => [
          r.id,
          r.koskName,
          r.status,
        ])
      ).toEqual([
        [second.body.id, "Nûruosmaniye Köşkü", "PENDING"],
        [first.body.id, "Beyazıt Köşkü", "PENDING"],
      ]);
    });

    it("answers the başmüderris and the başnazım, and no one else", async () => {
      await read(ADMIN_ID).expect(200);
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIR_ID, MANAGER_ID]) {
        await read(sub).expect(403);
      }
      await read(HEAD_ID, MISSING_ID).expect(404);
      await http()
        .get(`/madrasahs/${madrasahId}/offsite-course-requests`)
        .expect(401);
    });
  });
});
