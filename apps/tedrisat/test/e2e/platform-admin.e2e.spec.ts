import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
import { courseRequests } from "../../src/database/schema/course-request.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { koskApplications } from "../../src/database/schema/kosk-application.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import { platformPolicies } from "../../src/database/schema/platform-policy.schema";
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
 * MDRS-181: the platform's management screens against a real Postgres —
 * köşk applications (nizam/15), the audit trail (nizam/17), the platform
 * policies (nizam/19) and the medrese course requests (nizam/39).
 */
const ADMIN_ID = "e1000000-0000-4000-8000-000000000001";
const NAZIM_A_ID = "e1000000-0000-4000-8000-000000000002";
const NAZIM_B_ID = "e1000000-0000-4000-8000-000000000003";
const MEDARIS_ID = "e1000000-0000-4000-8000-000000000004";
const APPLICANT_ID = "e1000000-0000-4000-8000-000000000005";
const HEAD_ID = "e1000000-0000-4000-8000-000000000006";
const STUDENT_ID = "e1000000-0000-4000-8000-000000000007";
const NO_ROLE_ID = "e1000000-0000-4000-8000-000000000008";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims: {
      ...(sub === APPLICANT_ID
        ? { given_name: "Hatice", family_name: "Yıldırım" }
        : {}),
      ...(sub === ADMIN_ID
        ? {
            given_name: "Baş",
            family_name: "Nazım",
            realm_access: { roles: [ROLES.SYSTEM_ADMIN] },
          }
        : {}),
    },
  });

describe("Platform admin (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskA: string;
  let koskB: string;
  let madrasah: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const grantMedaris = async (userId: string, permissions: string[]) => {
    await db().insert(roleAssignments).values({
      userId,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN_ID,
    });
    if (permissions.length > 0) {
      await db()
        .insert(permissionGrants)
        .values(
          permissions.map((permission) => ({
            userId,
            scopeType: SCOPE_TYPES.PLATFORM,
            scopeId: null,
            permission,
            grantedBy: ADMIN_ID,
          }))
        );
    }
  };

  const application = async (name = "Davutpaşa Köşkü") => {
    const [row] = await db()
      .insert(koskApplications)
      .values({
        applicantId: APPLICANT_ID,
        name,
        field: "FIQH",
        summary: "Fıkıh dersleri.",
        reason: "Mahallede ihtiyaç var.",
        email: "hatice@example.com",
        phone: "+90 532 000 00 00",
      })
      .returning({ id: koskApplications.id });
    return row.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "course_requests",
      "kosk_applications",
      "platform_policies",
      "audit_log",
      "notifications",
      "permission_grants",
      "madrasahs",
      "users"
    );
    await db()
      .insert(users)
      .values([
        { id: APPLICANT_ID, givenName: "Hatice", familyName: "Yıldırım" },
        { id: HEAD_ID, givenName: "Ömer", familyName: "Başmüderris" },
        { id: NAZIM_A_ID, givenName: "Ali", familyName: "Nazım" },
        { id: ADMIN_ID, givenName: "Baş", familyName: "Nazım" },
      ]);
    [{ id: koskA }] = await db()
      .insert(kosks)
      .values({
        ownerId: NAZIM_A_ID,
        name: "Nûruosmaniye Köşkü",
        field: "Fıkıh",
      })
      .returning({ id: kosks.id });
    [{ id: koskB }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_B_ID, name: "Fatih Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: NAZIM_A_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskA,
    });
    await assignRole(db(), {
      userId: NAZIM_B_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskB,
    });
    [{ id: madrasah }] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning({ id: madrasahs.id });
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasah,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("köşk applications (nizam/15)", () => {
    it("lists the waiting and the answered with both counts, no contact detail in the list", async () => {
      const waiting = await application();
      const answered = await application("Eski Köşk");
      await db()
        .update(koskApplications)
        .set({ status: "REJECTED", decidedAt: new Date(), rejectReason: "x" })
        .where(eq(koskApplications.id, answered));

      const res = await http()
        .get("/nizam/kosk-applications")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.pendingCount).toBe(1);
      expect(res.body.decidedCount).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        id: waiting,
        name: "Davutpaşa Köşkü",
        applicantName: "Hatice Yıldırım",
      });
      expect(JSON.stringify(res.body)).not.toContain("hatice@example.com");

      const decided = await http()
        .get("/nizam/kosk-applications?status=DECIDED")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(decided.body.items.map((i: { id: string }) => i.id)).toEqual([
        answered,
      ]);
    });

    it("writes an audit row when the contact details are read", async () => {
      const id = await application();
      const res = await http()
        .get(`/nizam/kosk-applications/${id}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.applicant).toMatchObject({
        email: "hatice@example.com",
        phone: "+90 532 000 00 00",
      });
      expect(res.body.sameFieldKosks).toEqual(["Nûruosmaniye Köşkü"]);
      const rows = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "kosk_application.contact_read"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorId: ADMIN_ID, entityId: id });
    });

    it("refuses only with a reason, tells the applicant and cannot be answered twice (409)", async () => {
      const id = await application();
      await http()
        .post(`/nizam/kosk-applications/${id}/reject`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ reason: "  " })
        .expect(400);
      await http()
        .post(`/nizam/kosk-applications/${id}/reject`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ reason: "Aynı alanda köşk var." })
        .expect(204);
      const [row] = await db()
        .select()
        .from(koskApplications)
        .where(eq(koskApplications.id, id));
      expect(row).toMatchObject({
        status: "REJECTED",
        decidedBy: ADMIN_ID,
        rejectReason: "Aynı alanda köşk var.",
      });
      const [told] = await db().select().from(notifications);
      expect(told).toMatchObject({
        userId: APPLICANT_ID,
        type: "KOSK_APPLICATION_RESULT",
      });
      expect(told.params).toMatchObject({
        outcome: "rejected",
        reason: "Aynı alanda köşk var.",
      });
      const again = await http()
        .post(`/nizam/kosk-applications/${id}/reject`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ reason: "Yine" })
        .expect(409);
      expect(again.body.code).toBe("KOSK_APPLICATION_DECIDED");
      await http()
        .post(`/nizam/kosk-applications/${id}/approve`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ koskId: koskA })
        .expect(409);
    });

    it("accepts with the köşk opened from it and records who decided", async () => {
      const id = await application();
      await http()
        .post(`/nizam/kosk-applications/${id}/approve`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ koskId: "e1000000-0000-4000-8000-0000000000ff" })
        .expect(404);
      await http()
        .post(`/nizam/kosk-applications/${id}/approve`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ koskId: koskB })
        .expect(204);
      const [row] = await db()
        .select()
        .from(koskApplications)
        .where(eq(koskApplications.id, id));
      expect(row).toMatchObject({
        status: "APPROVED",
        koskId: koskB,
        decidedBy: ADMIN_ID,
      });
      const [told] = await db().select().from(notifications);
      expect(told.params).toMatchObject({
        outcome: "approved",
        koskName: "Fatih Köşkü",
      });
    });

    it("is for the başnazım and a Medaris nazımı holding the permission only", async () => {
      const id = await application();
      for (const sub of [NAZIM_A_ID, NO_ROLE_ID, HEAD_ID]) {
        await http()
          .get("/nizam/kosk-applications")
          .set("Authorization", auth(sub))
          .expect(403);
      }
      await http().get("/nizam/kosk-applications").expect(401);

      await grantMedaris(MEDARIS_ID, []);
      await http()
        .get(`/nizam/kosk-applications/${id}`)
        .set("Authorization", auth(MEDARIS_ID))
        .expect(403);
      await db().insert(permissionGrants).values({
        userId: MEDARIS_ID,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: "platform.kosk_application_decide",
        grantedBy: ADMIN_ID,
      });
      await http()
        .get(`/nizam/kosk-applications/${id}`)
        .set("Authorization", auth(MEDARIS_ID))
        .expect(200);
    });
  });

  describe("audit log (nizam/17)", () => {
    const seedRows = async (count: number) => {
      const base = Date.parse("2026-09-01T10:00:00Z");
      await db()
        .insert(auditLog)
        .values(
          Array.from({ length: count }, (_, i) => ({
            actorId: ADMIN_ID,
            action: i % 2 === 0 ? "user.lookup" : "ban.create",
            entity: i % 2 === 0 ? "user" : "kosk",
            entityId: i % 2 === 0 ? NAZIM_A_ID : koskA,
            details: { n: i },
            createdAt: new Date(base + i * 60_000),
          }))
        );
    };

    it("reads newest first and pages with a cursor to the end", async () => {
      await seedRows(55);
      const first = await http()
        .get("/nizam/audit-log")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(first.body.items).toHaveLength(50);
      expect(first.body.items[0].details.n).toBe(54);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await http()
        .get("/nizam/audit-log")
        .query({ cursor: first.body.nextCursor })
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(second.body.items).toHaveLength(5);
      expect(second.body.items[4].details.n).toBe(0);
      expect(second.body.nextCursor).toBeNull();
      const ids = [...first.body.items, ...second.body.items].map(
        (i: { id: string }) => i.id
      );
      expect(new Set(ids).size).toBe(55);
    });

    it("filters by kind, person, scope and time, all together", async () => {
      await seedRows(10);
      const get = (query: Record<string, string>) =>
        http()
          .get("/nizam/audit-log")
          .query(query)
          .set("Authorization", auth(ADMIN_ID))
          .expect(200);

      const lookups = await get({ type: "USER_LOOKUP" });
      expect(lookups.body.items).toHaveLength(5);
      expect(
        lookups.body.items.every(
          (i: { type: string }) => i.type === "USER_LOOKUP"
        )
      ).toBe(true);

      const bans = await get({ type: "BAN", scope: "KOSK" });
      expect(bans.body.items).toHaveLength(5);
      expect(bans.body.items[0].scope).toMatchObject({
        kind: "KOSK",
        id: koskA,
        name: "Nûruosmaniye Köşkü",
      });
      expect(
        (await get({ type: "BAN", scope: "PLATFORM" })).body.items
      ).toEqual([]);

      const byName = await get({ actor: "Baş" });
      expect(byName.body.items).toHaveLength(10);
      expect(byName.body.items[0].actor).toMatchObject({
        id: ADMIN_ID,
        name: "Baş Nazım",
      });
      expect((await get({ actor: "nobody-like-this" })).body.items).toEqual([]);

      const window = await get({
        type: "USER_LOOKUP",
        from: "2026-09-01T10:03:00Z",
        to: "2026-09-01T10:07:00Z",
      });
      expect(
        window.body.items.map((i: { details: { n: number } }) => i.details.n)
      ).toEqual([6, 4]);
    });

    it("is closed to köşk nazımları, başmüderrisler and everyone else, and has no way to change a row", async () => {
      await seedRows(1);
      for (const sub of [NAZIM_A_ID, HEAD_ID, NO_ROLE_ID]) {
        await http()
          .get("/nizam/audit-log")
          .set("Authorization", auth(sub))
          .expect(403);
        await http()
          .get("/nizam/audit-log/export")
          .set("Authorization", auth(sub))
          .expect(403);
      }
      const [row] = await db().select().from(auditLog).limit(1);
      for (const method of ["put", "patch", "delete"] as const) {
        await http()
          [method](`/nizam/audit-log/${row.id}`)
          .set("Authorization", auth(ADMIN_ID))
          .expect(404);
      }

      await grantMedaris(MEDARIS_ID, ["platform.audit_read"]);
      await http()
        .get("/nizam/audit-log")
        .set("Authorization", auth(MEDARIS_ID))
        .expect(200);
    });

    it("exports the filtered rows as CSV and records the export itself", async () => {
      await seedRows(6);
      const filtered = await http()
        .get("/nizam/audit-log")
        .query({ type: "USER_LOOKUP" })
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);

      const res = await http()
        .get("/nizam/audit-log/export")
        .query({ type: "USER_LOOKUP" })
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("attachment");
      const lines = res.text.replace(/^﻿/, "").trim().split("\r\n");
      expect(lines[0]).toBe(
        "no,time,actor,actor_role,type,action,scope_kind,scope_name"
      );
      expect(lines.length - 1).toBe(filtered.body.items.length);

      const [written] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "audit.export"));
      expect(written).toMatchObject({ actorId: ADMIN_ID });
      expect(written.details).toMatchObject({ rows: 3 });

      const after = await http()
        .get("/nizam/audit-log")
        .query({ type: "EXPORT" })
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(after.body.items).toHaveLength(1);
      expect(after.body.items[0].type).toBe("EXPORT");
    });

    it("rejects a cursor it did not hand out", async () => {
      await http()
        .get("/nizam/audit-log")
        .query({ cursor: "bogus" })
        .set("Authorization", auth(ADMIN_ID))
        .expect(400);
    });

    it("shows the actions the other screens write: a köşk's ban and a policy change", async () => {
      await http()
        .put("/nizam/platform-policies/ALWAYS_REQUIRE_APPROVAL")
        .set("Authorization", auth(ADMIN_ID))
        .send({ enabled: true })
        .expect(200);
      const res = await http()
        .get("/nizam/audit-log")
        .query({ type: "POLICY_CHANGE" })
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        action: "platform_policy.change",
        scope: { kind: "PLATFORM" },
        details: { key: "ALWAYS_REQUIRE_APPROVAL", enabled: true },
      });
    });
  });

  describe("platform policies (nizam/19)", () => {
    let courseId: string;
    const policy = (key: string, enabled: boolean, sub = ADMIN_ID) =>
      http()
        .put(`/nizam/platform-policies/${key}`)
        .set("Authorization", auth(sub))
        .send({ enabled });

    beforeEach(async () => {
      [{ id: courseId }] = await db()
        .insert(courses)
        .values({
          koskId: koskA,
          authorId: NAZIM_A_ID,
          title: "Emsile",
          status: CourseStatus.PUBLISHED,
          requiresApproval: false,
        })
        .returning({ id: courses.id });
    });

    it("reads both switches off, and flips one at once with an audit row", async () => {
      const before = await http()
        .get("/nizam/platform-policies")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(before.body.items).toEqual([
        expect.objectContaining({
          key: "ALWAYS_REQUIRE_APPROVAL",
          enabled: false,
        }),
        expect.objectContaining({
          key: "RECORDINGS_NEVER_PUBLIC",
          enabled: false,
        }),
      ]);

      const res = await policy("ALWAYS_REQUIRE_APPROVAL", true).expect(200);
      expect(res.body.items[0]).toMatchObject({
        enabled: true,
        changedBy: { id: ADMIN_ID },
      });
      const [row] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "platform_policy.change"));
      expect(row.details).toMatchObject({
        key: "ALWAYS_REQUIRE_APPROVAL",
        enabled: true,
        was: false,
      });
      await http()
        .put("/nizam/platform-policies/NOPE")
        .set("Authorization", auth(ADMIN_ID))
        .send({ enabled: true })
        .expect(400);
      await http()
        .put("/nizam/platform-policies/ALWAYS_REQUIRE_APPROVAL")
        .set("Authorization", auth(ADMIN_ID))
        .send({ enabled: "yes" })
        .expect(400);
    });

    it("makes every enrolment wait while 'Kayıt her zaman onaylı' is on, and frees them when it is off", async () => {
      await policy("ALWAYS_REQUIRE_APPROVAL", true).expect(200);
      const waiting = await http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", auth(STUDENT_ID))
        .expect(201);
      expect(waiting.body.status).toBe("PENDING");

      await policy("ALWAYS_REQUIRE_APPROVAL", false).expect(200);
      const free = await http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", auth(NO_ROLE_ID))
        .expect(201);
      expect(free.body.status).toBe("ENROLLED");
    });

    it("keeps a course from switching 'requires approval' off while the platform rule is on", async () => {
      await policy("ALWAYS_REQUIRE_APPROVAL", true).expect(200);
      const refused = await http()
        .patch(`/courses/${courseId}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ requiresApproval: false })
        .expect(409);
      expect(refused.body.code).toBe("PLATFORM_POLICY_LOCKED");
      await http()
        .patch(`/courses/${courseId}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ requiresApproval: true })
        .expect(200);
      await policy("ALWAYS_REQUIRE_APPROVAL", false).expect(200);
      await http()
        .patch(`/courses/${courseId}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ requiresApproval: false })
        .expect(200);
    });

    it("keeps a köşk from switching a platform rule off, and lets it keep its own while the platform's is off", async () => {
      await http()
        .patch(`/kosks/${koskA}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ alwaysRequireApproval: true })
        .expect(200);
      await policy("ALWAYS_REQUIRE_APPROVAL", true).expect(200);
      const refused = await http()
        .patch(`/kosks/${koskA}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ alwaysRequireApproval: false })
        .expect(409);
      expect(refused.body.code).toBe("PLATFORM_POLICY_LOCKED");
      await http()
        .patch(`/kosks/${koskA}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ alwaysRequireApproval: true, recordingsNeverPublic: false })
        .expect(200);
      await policy("ALWAYS_REQUIRE_APPROVAL", false).expect(200);
      await http()
        .patch(`/kosks/${koskA}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ alwaysRequireApproval: false })
        .expect(200);
    });

    it("lists the köşks that apply a rule themselves, with who switched it on", async () => {
      await http()
        .patch(`/kosks/${koskA}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ recordingsNeverPublic: true })
        .expect(200);
      const scoped = await http()
        .get("/nizam/scoped-policies")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(scoped.body.items).toEqual([
        expect.objectContaining({
          scope: { kind: "KOSK", id: koskA, name: "Nûruosmaniye Köşkü" },
          key: "RECORDINGS_NEVER_PUBLIC",
          openedBy: { id: NAZIM_A_ID, name: "Ali Nazım" },
        }),
      ]);
      const policies = await http()
        .get("/nizam/platform-policies")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(policies.body.items[1].ownScopes).toEqual(["Nûruosmaniye Köşkü"]);
    });

    it("is closed to anyone without the permission", async () => {
      await policy("ALWAYS_REQUIRE_APPROVAL", true, NAZIM_A_ID).expect(403);
      await http()
        .get("/nizam/platform-policies")
        .set("Authorization", auth(NO_ROLE_ID))
        .expect(403);
      await http()
        .get("/nizam/scoped-policies")
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(403);
      await grantMedaris(MEDARIS_ID, ["platform.policy_edit"]);
      await policy("RECORDINGS_NEVER_PUBLIC", true, MEDARIS_ID).expect(200);
      expect(await db().select().from(platformPolicies)).toHaveLength(1);
    });
  });

  describe("course requests (nizam/39)", () => {
    const send = (sub: string, body: object = {}, kosk = koskA) =>
      http()
        .post(`/kosks/${kosk}/course-requests`)
        .set("Authorization", auth(sub))
        .send({
          madrasahId: madrasah,
          title: "Usûl-i Fıkıh Okumaları",
          reason: "Medresemizde yer yok.",
          ...body,
        });

    it("is sent by the başmüderris of the medrese and nobody else", async () => {
      await send(NAZIM_A_ID).expect(403);
      await send(STUDENT_ID).expect(403);
      await send(HEAD_ID, { title: "  " }).expect(400);
      await send(HEAD_ID, {
        madrasahId: "e1000000-0000-4000-8000-0000000000ff",
      }).expect(404);
      const created = await send(HEAD_ID).expect(201);
      expect(created.body.id).toEqual(expect.any(String));
    });

    it("lists a köşk's requests with counts for its nazım and not for another köşk's", async () => {
      const first = (await send(HEAD_ID).expect(201)).body.id as string;
      await send(HEAD_ID, { title: "Mantık" }, koskB).expect(201);

      const res = await http()
        .get(`/kosks/${koskA}/course-requests`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(res.body.pendingCount).toBe(1);
      expect(res.body.decidedCount).toBe(0);
      expect(res.body.items).toEqual([
        expect.objectContaining({
          id: first,
          title: "Usûl-i Fıkıh Okumaları",
          status: "PENDING",
          kosk: { id: koskA, name: "Nûruosmaniye Köşkü" },
          madrasah: { id: madrasah, name: "Süleymaniye Medresesi" },
          requestedBy: { id: HEAD_ID, name: "Ömer Başmüderris" },
        }),
      ]);

      await http()
        .get(`/kosks/${koskA}/course-requests`)
        .set("Authorization", auth(NAZIM_B_ID))
        .expect(403);
      await http()
        .get(`/kosks/${koskA}/course-requests`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      await http()
        .get(`/kosks/${koskA}/course-requests`)
        .set("Authorization", auth(HEAD_ID))
        .expect(403);
    });

    it("refuses only with a reason, once", async () => {
      const id = (await send(HEAD_ID).expect(201)).body.id as string;
      await http()
        .post(`/course-requests/${id}/reject`)
        .set("Authorization", auth(NAZIM_B_ID))
        .send({ reason: "Hayır" })
        .expect(403);
      await http()
        .post(`/course-requests/${id}/reject`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ reason: " " })
        .expect(400);
      await http()
        .post(`/course-requests/${id}/reject`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ reason: "Kadro dolu." })
        .expect(204);
      const [row] = await db()
        .select()
        .from(courseRequests)
        .where(eq(courseRequests.id, id));
      expect(row).toMatchObject({
        status: "REJECTED",
        rejectReason: "Kadro dolu.",
        decidedBy: NAZIM_A_ID,
      });
      const again = await http()
        .post(`/course-requests/${id}/reject`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ reason: "Yine" })
        .expect(409);
      expect(again.body.code).toBe("COURSE_REQUEST_NOT_PENDING");

      const decided = await http()
        .get(`/kosks/${koskA}/course-requests?status=DECIDED`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(decided.body.items).toHaveLength(1);
      expect(decided.body.pendingCount).toBe(0);
      expect(decided.body.decidedCount).toBe(1);
    });

    it("accepts with the course opened from it, which must be one of the köşk's", async () => {
      const id = (await send(HEAD_ID).expect(201)).body.id as string;
      const [{ id: other }] = await db()
        .insert(courses)
        .values({
          koskId: koskB,
          authorId: NAZIM_B_ID,
          title: "Başka köşkün dersi",
          status: CourseStatus.PUBLISHED,
        })
        .returning({ id: courses.id });
      const [{ id: opened }] = await db()
        .insert(courses)
        .values({
          koskId: koskA,
          authorId: NAZIM_A_ID,
          title: "Usûl-i Fıkıh Okumaları",
          status: CourseStatus.PUBLISHED,
        })
        .returning({ id: courses.id });

      const wrong = await http()
        .post(`/course-requests/${id}/accept`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ courseId: other })
        .expect(404);
      expect(wrong.body.code).toBe("COURSE_REQUEST_COURSE_NOT_FOUND");
      await http()
        .post(`/course-requests/${id}/accept`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ courseId: opened })
        .expect(204);
      const [row] = await db()
        .select()
        .from(courseRequests)
        .where(
          and(eq(courseRequests.id, id), eq(courseRequests.courseId, opened))
        );
      expect(row.status).toBe("ACCEPTED");
      await http()
        .post(`/course-requests/${id}/accept`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ courseId: opened })
        .expect(409);
      await http()
        .post(`/course-requests/${randomUuid()}/accept`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ courseId: opened })
        .expect(404);
    });
  });
});

const randomUuid = () => "e1000000-0000-4000-8000-0000000000aa";
