import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { appeals } from "../../src/database/schema/appeal.schema";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courseRequests } from "../../src/database/schema/course-request.schema";
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
 * İtirazlar against a real Postgres: a medrese appeals a köşk refusing its
 * course request (nazar), and the Medaris başnazımı or a Medaris nazımı
 * holding `platform.appeal_decide` decides it (nizam). Accepting sends the
 * request back to the köşk as PENDING; refusing closes it with a note.
 */
const ADMIN_ID = "ea000000-0000-4000-8000-000000000001";
const HEAD_ID = "ea000000-0000-4000-8000-000000000002";
const NAZIR_ID = "ea000000-0000-4000-8000-000000000003";
const OTHER_HEAD_ID = "ea000000-0000-4000-8000-000000000004";
const MANAGER_ID = "ea000000-0000-4000-8000-000000000005";
const DECIDER_ID = "ea000000-0000-4000-8000-000000000006";
const PLAIN_NAZIM_ID = "ea000000-0000-4000-8000-000000000007";
const STRANGER_ID = "ea000000-0000-4000-8000-000000000008";
const MISSING_ID = "ea000000-0000-4000-8000-00000000ffff";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Appeals (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let koskId: string;
  let rejectedId: string;
  let pendingId: string;
  let othersRejectedId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const open = (sub: string, body: object, id = madrasahId) =>
    http()
      .post(`/madrasahs/${id}/appeals`)
      .set("Authorization", auth(sub))
      .send(body);
  const rows = (sub: string, id = madrasahId) =>
    http().get(`/madrasahs/${id}/appeals`).set("Authorization", auth(sub));
  const list = (sub: string, status?: string) =>
    http()
      .get(`/appeals${status ? `?status=${status}` : ""}`)
      .set("Authorization", auth(sub));
  const decide = (sub: string, id: string, verb: string, body = {}) =>
    http()
      .post(`/appeals/${id}/${verb}`)
      .set("Authorization", auth(sub))
      .send(body);
  const reason = "Köşkün gerekçesi bu ders için geçerli değil.";

  const tables = [
    ...COURSE_TREE_TABLES,
    "course_requests",
    "permission_grants",
    "madrasahs",
    "users",
    "audit_log",
  ];

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...tables);
    await db()
      .insert(users)
      .values([{ id: HEAD_ID, givenName: "Ömer", familyName: "Başmüderris" }]);
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
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Beyazıt Köşkü" })
      .returning();
    koskId = kosk.id;
    const [rejected, pending, othersRejected] = await db()
      .insert(courseRequests)
      .values([
        {
          koskId,
          madrasahId,
          title: "Usûl-i Fıkıh Okumaları",
          reason: "Yer yok.",
          requestedBy: HEAD_ID,
          status: "REJECTED",
          rejectReason: "Köşkte hoca yok.",
          decidedBy: MANAGER_ID,
          decidedAt: new Date(),
        },
        {
          koskId,
          madrasahId,
          title: "Mantık",
          reason: "Yer yok.",
          requestedBy: HEAD_ID,
        },
        {
          koskId,
          madrasahId: otherMadrasahId,
          title: "Belâgat",
          reason: "Yer yok.",
          requestedBy: OTHER_HEAD_ID,
          status: "REJECTED",
          rejectReason: "Hayır.",
        },
      ])
      .returning();
    rejectedId = rejected.id;
    pendingId = pending.id;
    othersRejectedId = othersRejected.id;
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
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    for (const userId of [DECIDER_ID, PLAIN_NAZIM_ID]) {
      await db().insert(roleAssignments).values({
        userId,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
    }
    await db().insert(permissionGrants).values({
      userId: DECIDER_ID,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      permission: "platform.appeal_decide",
      grantedBy: ADMIN_ID,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...tables);
    await app.close();
  });

  describe("the medrese's side", () => {
    it("lists only the refused requests, each without an appeal yet", async () => {
      const res = await rows(HEAD_ID).expect(200);
      expect(res.body).toEqual([
        {
          courseRequestId: rejectedId,
          title: "Usûl-i Fıkıh Okumaları",
          kosk: { id: koskId, name: "Beyazıt Köşkü" },
          requestStatus: "REJECTED",
          rejectReason: "Köşkte hoca yok.",
          appeal: null,
        },
      ]);
    });

    it("opens an appeal on a refused request, once, with its audit row", async () => {
      const res = await open(HEAD_ID, {
        courseRequestId: rejectedId,
        reason: `  ${reason}  `,
      }).expect(201);
      const [row] = await db().select().from(appeals);
      expect(row).toMatchObject({
        id: res.body.id,
        madrasahId,
        courseRequestId: rejectedId,
        reason,
        status: "PENDING",
        createdBy: HEAD_ID,
        decidedBy: null,
      });
      const [audit] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "appeal.create"));
      expect(audit).toMatchObject({ actorId: HEAD_ID, entityId: row.id });
      const listed = await rows(HEAD_ID).expect(200);
      expect(listed.body[0].appeal).toMatchObject({
        id: row.id,
        status: "PENDING",
        reason,
        decisionNote: null,
      });
      const again = await open(HEAD_ID, {
        courseRequestId: rejectedId,
        reason,
      }).expect(409);
      expect(again.body.code).toBe("APPEAL_EXISTS");
    });

    it("refuses a request that was not refused, or is not the medrese's", async () => {
      const waiting = await open(HEAD_ID, {
        courseRequestId: pendingId,
        reason,
      }).expect(409);
      expect(waiting.body.code).toBe("APPEAL_REQUEST_NOT_REJECTED");
      await open(HEAD_ID, {
        courseRequestId: othersRejectedId,
        reason,
      }).expect(404);
      await open(HEAD_ID, { courseRequestId: MISSING_ID, reason }).expect(404);
      expect(await db().select().from(appeals)).toHaveLength(0);
    });

    it("validates the body", async () => {
      await open(HEAD_ID, { courseRequestId: rejectedId, reason: "  " }).expect(
        400
      );
      await open(HEAD_ID, {
        courseRequestId: rejectedId,
        reason: "x".repeat(1001),
      }).expect(400);
      await open(HEAD_ID, { courseRequestId: "nope", reason }).expect(400);
      await open(HEAD_ID, { reason }).expect(400);
    });

    it("is for madrasah.appeal_open holders: others get 403, an unknown medrese 404", async () => {
      for (const sub of [STRANGER_ID, NAZIR_ID, OTHER_HEAD_ID, MANAGER_ID]) {
        await rows(sub).expect(403);
        await open(sub, { courseRequestId: rejectedId, reason }).expect(403);
      }
      await rows(HEAD_ID, MISSING_ID).expect(404);
      await http().get(`/madrasahs/${madrasahId}/appeals`).expect(401);
      await rows(ADMIN_ID).expect(200);
      await db().insert(permissionGrants).values({
        userId: NAZIR_ID,
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        permission: "madrasah.appeal_open",
        grantedBy: HEAD_ID,
      });
      await rows(NAZIR_ID).expect(200);
    });
  });

  describe("the platform's side", () => {
    let appealId: string;

    beforeEach(async () => {
      const res = await open(HEAD_ID, {
        courseRequestId: rejectedId,
        reason,
      }).expect(201);
      appealId = res.body.id;
    });

    it("lists the waiting appeal with its medrese, köşk and both reasons", async () => {
      const res = await list(DECIDER_ID).expect(200);
      expect(res.body.pendingCount).toBe(1);
      expect(res.body.decidedCount).toBe(0);
      expect(res.body.items[0]).toMatchObject({
        id: appealId,
        status: "PENDING",
        reason,
        madrasah: { id: madrasahId, name: "Süleymaniye Medresesi" },
        kosk: { id: koskId, name: "Beyazıt Köşkü" },
        courseRequestId: rejectedId,
        title: "Usûl-i Fıkıh Okumaları",
        rejectReason: "Köşkte hoca yok.",
        createdBy: { id: HEAD_ID, name: "Ömer Başmüderris" },
      });
      expect(
        (await list(DECIDER_ID, "DECIDED").expect(200)).body.items
      ).toEqual([]);
    });

    it("counts it on the Medaris home page", async () => {
      const res = await http()
        .get("/nizam/dashboard")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.pendingTotals.appeals).toBe(1);
    });

    it("accepting sends the request back to the köşk as PENDING", async () => {
      await decide(DECIDER_ID, appealId, "accept").expect(204);
      const [request] = await db()
        .select()
        .from(courseRequests)
        .where(eq(courseRequests.id, rejectedId));
      expect(request).toMatchObject({
        status: "PENDING",
        decidedBy: null,
        decidedAt: null,
      });
      const [row] = await db().select().from(appeals);
      expect(row).toMatchObject({ status: "ACCEPTED", decidedBy: DECIDER_ID });
      const [audit] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "appeal.accept"));
      expect(audit).toMatchObject({ actorId: DECIDER_ID, entityId: appealId });
      const kosk = await http()
        .get(`/kosks/${koskId}/course-requests`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      expect(kosk.body.items.map((r: { id: string }) => r.id)).toContain(
        rejectedId
      );
      const medrese = await rows(HEAD_ID).expect(200);
      expect(medrese.body[0]).toMatchObject({
        courseRequestId: rejectedId,
        requestStatus: "PENDING",
        appeal: { status: "ACCEPTED" },
      });
      const again = await decide(ADMIN_ID, appealId, "reject", {
        note: "Geç.",
      }).expect(409);
      expect(again.body.code).toBe("APPEAL_NOT_PENDING");
    });

    it("refusing needs a note, keeps the request refused and shows the note to the medrese", async () => {
      await decide(ADMIN_ID, appealId, "reject").expect(400);
      await decide(ADMIN_ID, appealId, "reject", { note: "   " }).expect(400);
      await decide(ADMIN_ID, appealId, "reject", {
        note: "Köşkün kararı yerinde.",
      }).expect(204);
      const [request] = await db()
        .select()
        .from(courseRequests)
        .where(eq(courseRequests.id, rejectedId));
      expect(request.status).toBe("REJECTED");
      const medrese = await rows(HEAD_ID).expect(200);
      expect(medrese.body[0].appeal).toMatchObject({
        status: "REJECTED",
        decisionNote: "Köşkün kararı yerinde.",
      });
      const [audit] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "appeal.reject"));
      expect(audit).toMatchObject({ actorId: ADMIN_ID, entityId: appealId });
      const decided = await list(ADMIN_ID, "DECIDED").expect(200);
      expect(decided.body.decidedCount).toBe(1);
    });

    it("is for the başnazım and platform.appeal_decide holders only", async () => {
      for (const sub of [PLAIN_NAZIM_ID, HEAD_ID, MANAGER_ID, STRANGER_ID]) {
        await list(sub).expect(403);
        await decide(sub, appealId, "accept").expect(403);
      }
      await list(ADMIN_ID).expect(200);
      await decide(DECIDER_ID, MISSING_ID, "accept").expect(404);
      await http().get("/appeals").expect(401);
    });
  });
});
