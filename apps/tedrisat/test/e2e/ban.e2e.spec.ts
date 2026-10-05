import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq, ne } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { bans } from "../../src/database/schema/ban.schema";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { notifications } from "../../src/database/schema/notification.schema";
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
 * MDRS-177: barring a talebe (nizam/41), lifting the ban under the kademe
 * rule (nizam/42) and what a ban does to enrolling, against a real Postgres.
 */
const ADMIN_ID = "d0000000-0000-4000-8000-000000000001";
const NAZIM_ID = "d0000000-0000-4000-8000-000000000002";
const MUDERRIS_ID = "d0000000-0000-4000-8000-000000000003";
const MUDERRIS_2_ID = "d0000000-0000-4000-8000-000000000004";
const STRANGER_ID = "d0000000-0000-4000-8000-000000000005";
const TALEBE_ID = "d0000000-0000-4000-8000-000000000006";
const OTHER_NAZIM_ID = "d0000000-0000-4000-8000-000000000007";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Bans (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let otherKoskId: string;
  let courseId: string;
  let secondCourseId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const TABLES = [
    ...COURSE_TREE_TABLES,
    "bans",
    "audit_log",
    "notifications",
    "users",
  ] as const;

  const ban = (
    by: string,
    over: Record<string, unknown> = {},
    onCourse = () => courseId
  ) =>
    http()
      .post(`/courses/${onCourse()}/bans`)
      .set("Authorization", auth(by))
      .send({
        userId: TALEBE_ID,
        scope: "COURSE",
        reason: "Celselerde başka talebelere hakaret etti.",
        ...over,
      });

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db()
      .insert(users)
      .values([
        { id: NAZIM_ID, givenName: "Abdülhamit", familyName: "Karaosmanoğlu" },
        { id: MUDERRIS_ID, givenName: "Ayşe Nur", familyName: "Kılıçarslan" },
        { id: TALEBE_ID, givenName: "Ömer Faruk", familyName: "Demirkaya" },
      ]);
    [{ id: koskId }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" })
      .returning({ id: kosks.id });
    [{ id: otherKoskId }] = await db()
      .insert(kosks)
      .values({ ownerId: OTHER_NAZIM_ID, name: "Fatih Köşkü" })
      .returning({ id: kosks.id });
    [{ id: courseId }, { id: secondCourseId }] = await db()
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM_ID,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM_ID,
          title: "Avâmil ve Tasrîf",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning({ id: courses.id });
    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    await assignRole(db(), {
      userId: OTHER_NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: otherKoskId,
    });
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    await assignRole(db(), {
      userId: MUDERRIS_2_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    await db().insert(enrollments).values({
      userId: TALEBE_ID,
      courseId,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("POST /courses/:id/bans", () => {
    it("lets the course's müderris bar a talebe and records who and why", async () => {
      const res = await ban(MUDERRIS_ID).expect(201);
      expect(res.body).toMatchObject({
        scope: "COURSE",
        courseId,
        courseTitle: "Emsile ve Bina",
        bannedRole: "MUDERRIS",
        user: { id: TALEBE_ID, name: "Ömer Faruk Demirkaya" },
        liftedAt: null,
        viewerMayLift: true,
        viewerMayExtend: false,
      });
      const [row] = await db().select().from(bans);
      expect(row).toMatchObject({
        bannedBy: MUDERRIS_ID,
        bannedTier: 1,
        reason: "Celselerde başka talebelere hakaret etti.",
      });
      const audit = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "ban.create"));
      expect(audit).toHaveLength(1);
    });

    it("notifies the köşk's nazım once, with the sentence's values, and no other staff (MDRS-179)", async () => {
      await ban(MUDERRIS_ID).expect(201);
      await ban(MUDERRIS_ID).expect(201);
      // The barred talebe's own row (MDRS-213) is the next test's.
      const rows = await db()
        .select()
        .from(notifications)
        .where(ne(notifications.userId, TALEBE_ID));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: NAZIM_ID,
        type: "COURSE_BAN_PLACED",
        targetType: "KOSK",
        targetId: koskId,
        readAt: null,
        params: {
          source: "Nûruosmaniye Köşkü",
          courseTitle: "Emsile ve Bina",
          talebeName: "Ömer Faruk Demirkaya",
          actorName: "Ayşe Nur Kılıçarslan",
          reason: "Celselerde başka talebelere hakaret etti.",
        },
      });
    });

    it("tells the barred talebe their access was removed, once and without the reason (MDRS-213)", async () => {
      await ban(MUDERRIS_ID).expect(201);
      await ban(MUDERRIS_ID).expect(201);
      const rows = await db()
        .select()
        .from(notifications)
        .where(eq(notifications.userId, TALEBE_ID));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: "COURSE_ACCESS_REMOVED",
        targetType: "COURSE",
        targetId: courseId,
        params: {
          courseTitle: "Emsile ve Bina",
          source: "Nûruosmaniye Köşkü",
        },
      });
      expect(rows[0].params).not.toHaveProperty("reason");
    });

    it("tells the talebe of no course twice when a course ban is widened to the köşk (MDRS-213)", async () => {
      await db().insert(enrollments).values({
        userId: TALEBE_ID,
        courseId: secondCourseId,
        status: EnrollmentStatus.COMPLETED,
      });
      const first = await ban(MUDERRIS_ID).expect(201);
      await http()
        .post(`/bans/${first.body.id}/extend`)
        .set("Authorization", auth(NAZIM_ID))
        .send({ scope: "KOSK", reason: "Köşkün başka derslerinde de sürdü." })
        .expect(200);
      const told = await db()
        .select()
        .from(notifications)
        .where(eq(notifications.userId, TALEBE_ID));
      expect(told.map((n) => [n.type, n.targetId]).sort()).toEqual(
        [
          ["COURSE_ACCESS_REMOVED", courseId],
          ["COURSE_ACCESS_REMOVED", secondCourseId],
        ].sort()
      );
    });

    it("answers a second request for the same bar with the first", async () => {
      const first = await ban(MUDERRIS_ID).expect(201);
      const second = await ban(MUDERRIS_ID).expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await db().select().from(bans)).toHaveLength(1);
    });

    it("refuses a stranger, and a müderris of another course, with 403", async () => {
      await ban(STRANGER_ID).expect(403);
      await ban(MUDERRIS_ID, {}, () => secondCourseId).expect(403);
      expect(await db().select().from(bans)).toHaveLength(0);
    });

    it("keeps the whole-köşk ban for the köşk nazımı", async () => {
      await ban(MUDERRIS_ID, { scope: "KOSK" }).expect(403);
      const res = await ban(NAZIM_ID, { scope: "KOSK" }).expect(201);
      expect(res.body).toMatchObject({
        scope: "KOSK",
        courseId: null,
        extendedFromCourseId: courseId,
        extendedFromCourseTitle: "Emsile ve Bina",
        bannedRole: "KOSK_NAZIM",
      });
    });

    it("refuses barring oneself or the köşk nazımı", async () => {
      await ban(MUDERRIS_ID, { userId: MUDERRIS_ID }).expect(400);
      await ban(MUDERRIS_ID, { userId: NAZIM_ID }).expect(400);
    });

    it("validates the body", async () => {
      await ban(MUDERRIS_ID, { reason: "   " }).expect(400);
      await ban(MUDERRIS_ID, { reason: "x".repeat(501) }).expect(400);
      await ban(MUDERRIS_ID, { scope: "WORLD" }).expect(400);
      await ban(MUDERRIS_ID, { userId: "not-a-uuid" }).expect(400);
      await http()
        .post("/courses/not-a-uuid/bans")
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ userId: TALEBE_ID, scope: "COURSE", reason: "x" })
        .expect(400);
    });

    it("needs a sign-in", async () => {
      await http()
        .post(`/courses/${courseId}/bans`)
        .send({ userId: TALEBE_ID, scope: "COURSE", reason: "x" })
        .expect(401);
    });
  });

  describe("what a ban does", () => {
    it("refuses the barred talebe a new application with BAN_ACTIVE, and lets a second course through", async () => {
      await db().delete(enrollments).where(eq(enrollments.userId, TALEBE_ID));
      await ban(MUDERRIS_ID).expect(201);
      const res = await http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(403);
      expect(res.body.code).toBe("BAN_ACTIVE");
      await http()
        .post(`/courses/${secondCourseId}/enroll`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(201);
    });

    it("bars the whole köşk with a KOSK ban", async () => {
      await db().delete(enrollments).where(eq(enrollments.userId, TALEBE_ID));
      await ban(NAZIM_ID, { scope: "KOSK" }).expect(201);
      for (const id of [courseId, secondCourseId]) {
        await http()
          .post(`/courses/${id}/enroll`)
          .set("Authorization", auth(TALEBE_ID))
          .expect(403);
      }
    });

    it("keeps the seat of a barred talebe: leaving is refused", async () => {
      await ban(MUDERRIS_ID).expect(201);
      const res = await http()
        .delete(`/courses/${courseId}/enrollment`)
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("BAN_ACTIVE");
    });

    it("marks the roster with the ban's id and scope and never its reason", async () => {
      await ban(MUDERRIS_ID).expect(201);
      const res = await http()
        .get(`/courses/${courseId}/enrollments`)
        .set("Authorization", auth(MUDERRIS_ID))
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].ban).toEqual({
        id: expect.any(String),
        scope: "COURSE",
      });
      expect(JSON.stringify(res.body)).not.toContain("hakaret");
    });

    it("sends the talebe no reason in any response of theirs", async () => {
      await ban(MUDERRIS_ID).expect(201);
      for (const path of [`/courses/${courseId}`, "/courses/enrolled", "/me"]) {
        const res = await http()
          .get(path)
          .set("Authorization", auth(TALEBE_ID));
        expect(JSON.stringify(res.body)).not.toContain("hakaret");
      }
    });
  });

  describe("GET /kosks/:id/bans and POST /bans/:id/lift", () => {
    it("lists a köşk's bans for its nazım with the counts and who may lift", async () => {
      await ban(MUDERRIS_ID).expect(201);
      const res = await http()
        .get(`/kosks/${koskId}/bans`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(200);
      expect(res.body).toMatchObject({
        activeCount: 1,
        liftedCount: 0,
        recentCount: 1,
      });
      expect(res.body.items[0]).toMatchObject({
        bannedBy: { id: MUDERRIS_ID },
        reason: "Celselerde başka talebelere hakaret etti.",
        viewerMayLift: true,
        viewerMayExtend: true,
      });
    });

    it("answers only the köşk's own nazım, and the başnazım", async () => {
      await http()
        .get(`/kosks/${koskId}/bans`)
        .set("Authorization", auth(MUDERRIS_ID))
        .expect(403);
      await http()
        .get(`/kosks/${koskId}/bans`)
        .set("Authorization", auth(OTHER_NAZIM_ID))
        .expect(403);
      await http()
        .get(`/kosks/${koskId}/bans`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      await http()
        .get(`/kosks/${koskId}/bans?status=NOPE`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(400);
    });

    it("lifts with a reason by the banner's kademe, keeping who and why", async () => {
      const created = await ban(MUDERRIS_ID).expect(201);
      const res = await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(NAZIM_ID))
        .send({ reason: "Talebeyle görüşüldü." })
        .expect(200);
      expect(res.body).toMatchObject({
        liftReason: "Talebeyle görüşüldü.",
        liftedBy: { id: NAZIM_ID },
      });
      const [row] = await db().select().from(bans);
      expect(row.liftedBy).toBe(NAZIM_ID);
      expect(row.liftReason).toBe("Talebeyle görüşüldü.");

      const lifted = await http()
        .get(`/kosks/${koskId}/bans?status=LIFTED`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(200);
      expect(lifted.body).toMatchObject({ activeCount: 0, liftedCount: 1 });
      expect(lifted.body.items).toHaveLength(1);
    });

    it("lets the talebe apply again once the ban is lifted", async () => {
      await db().delete(enrollments).where(eq(enrollments.userId, TALEBE_ID));
      const created = await ban(MUDERRIS_ID).expect(201);
      await http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(403);
      await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "Söz verdi." })
        .expect(200);
      await http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(201);
    });

    it("refuses a lower kademe with 403 and leaves the ban standing", async () => {
      const created = await ban(NAZIM_ID, { scope: "KOSK" }).expect(201);
      const res = await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "Olur." })
        .expect(403);
      expect(res.body.code).toBe("BAN_LIFT_FORBIDDEN");
      const [row] = await db().select().from(bans);
      expect(row.liftedAt).toBeNull();
    });

    it("keeps a başnazım's ban for the başnazım", async () => {
      const created = await ban(ADMIN_ID).expect(201);
      expect(created.body.bannedRole).toBe("SYSTEM_ADMIN");
      await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(NAZIM_ID))
        .send({ reason: "Olur." })
        .expect(403);
      const list = await http()
        .get(`/kosks/${koskId}/bans`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(200);
      expect(list.body.items[0].viewerMayLift).toBe(false);
      await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ reason: "Karar değişti." })
        .expect(200);
    });

    it("answers 409 for a lifted ban, 404 for an unknown one, 400 for a blank reason", async () => {
      const created = await ban(MUDERRIS_ID).expect(201);
      await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "   " })
        .expect(400);
      await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "ok" })
        .expect(200);
      await http()
        .post(`/bans/${created.body.id}/lift`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "ok" })
        .expect(409);
      await http()
        .post("/bans/d0000000-0000-4000-8000-0000000000ff/lift")
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "ok" })
        .expect(404);
    });
  });
  describe("Medaris administration (MDRS-178, nizam/48)", () => {
    const MEDARIS_ID = "d0000000-0000-4000-8000-000000000008";

    // A Medaris nazımı holds nothing until a grant says so (MDRS-205): the list is
    // read with platform.ban_scoped.
    const medarisNazim = async (...permissions: string[]) => {
      await db().insert(users).values({ id: MEDARIS_ID });
      await db().insert(roleAssignments).values({
        userId: MEDARIS_ID,
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
              userId: MEDARIS_ID,
              scopeType: SCOPE_TYPES.PLATFORM,
              scopeId: null,
              permission,
              groupId: null,
              grantedBy: ADMIN_ID,
            }))
          );
      }
    };

    it("lists every köşk's bans for the başnazım and a Medaris nazımı holding platform.ban_scoped, filtered", async () => {
      await medarisNazim("platform.ban_scoped");
      const [{ id: farCourse }] = await db()
        .insert(courses)
        .values({
          koskId: otherKoskId,
          authorId: OTHER_NAZIM_ID,
          title: "Fıkıh",
          status: CourseStatus.PUBLISHED,
        })
        .returning({ id: courses.id });
      await ban(MUDERRIS_ID).expect(201);
      await ban(NAZIM_ID, { scope: "KOSK" }).expect(201);
      await ban(ADMIN_ID, {}, () => farCourse).expect(201);

      const all = await http()
        .get("/bans")
        .set("Authorization", auth(MEDARIS_ID))
        .expect(200);
      expect(all.body.total).toBe(3);
      expect(all.body.activeCount).toBe(3);
      expect(all.body.items).toHaveLength(3);
      // The Medaris nazımı lifts the köşk's ban and no course ban, whoever placed it.
      expect(
        all.body.items.map((i: { scope: string; viewerMayLift: boolean }) => [
          i.scope,
          i.viewerMayLift,
        ])
      ).toEqual(
        expect.arrayContaining([
          ["KOSK", true],
          ["COURSE", false],
        ])
      );
      expect(
        all.body.items
          .filter((i: { scope: string }) => i.scope === "COURSE")
          .every((i: { viewerMayLift: boolean }) => !i.viewerMayLift)
      ).toBe(true);

      const kosk = await http()
        .get("/bans?scope=KOSK")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(kosk.body.total).toBe(1);
      expect(kosk.body.items[0].scope).toBe("KOSK");
      expect(kosk.body.activeCount).toBe(3);

      const search = await http()
        .get("/bans?q=demirkaya&limit=2")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(search.body.total).toBe(3);
      expect(search.body.items).toHaveLength(2);
      const none = await http()
        .get("/bans?q=nobody-by-this-name")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(none.body.total).toBe(0);
    });

    it("refuses everyone else with 403 and a bad filter with 400", async () => {
      await http()
        .get("/bans")
        .set("Authorization", auth(NAZIM_ID))
        .expect(403);
      await http()
        .get("/bans")
        .set("Authorization", auth(MUDERRIS_ID))
        .expect(403);
      await http()
        .get("/bans?scope=PLATFORM")
        .set("Authorization", auth(ADMIN_ID))
        .expect(400);
      await http()
        .get("/bans?limit=abc")
        .set("Authorization", auth(ADMIN_ID))
        .expect(400);
    });

    it("widens a course ban to the köşk, keeps the course ban and writes ban.extend", async () => {
      const course = await ban(MUDERRIS_ID).expect(201);
      const res = await http()
        .post(`/bans/${course.body.id}/extend`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ scope: "KOSK", reason: "Köşkün başka derslerine de başvurdu." })
        .expect(200);
      expect(res.body.scope).toBe("KOSK");
      expect(res.body.extendedFromCourseId).toBe(courseId);
      expect(res.body.bannedRole).toBe("SYSTEM_ADMIN");

      const rows = await db().select().from(bans);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.id === course.body.id)?.liftedAt).toBeNull();
      const audit = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "ban.extend"));
      expect(audit).toHaveLength(1);
      expect(audit[0].details).toMatchObject({
        extendedFromBanId: course.body.id,
        scope: "KOSK",
      });

      const list = await http()
        .get("/bans")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      const courseRow = list.body.items.find(
        (i: { id: string }) => i.id === course.body.id
      );
      expect(courseRow.viewerMayExtend).toBe(false);
    });

    it("lets the köşk nazım widen, and no one below", async () => {
      const course = await ban(MUDERRIS_ID).expect(201);
      const body = { scope: "KOSK", reason: "Genişletildi." };
      await http()
        .post(`/bans/${course.body.id}/extend`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send(body)
        .expect(403);
      await http()
        .post(`/bans/${course.body.id}/extend`)
        .set("Authorization", auth(OTHER_NAZIM_ID))
        .send(body)
        .expect(403);
      await http()
        .post(`/bans/${course.body.id}/extend`)
        .set("Authorization", auth(NAZIM_ID))
        .send(body)
        .expect(200);
    });

    it("refuses widening a köşk ban (400), a lifted one (409), a blank reason or other scope (400)", async () => {
      const kosk = await ban(NAZIM_ID, { scope: "KOSK" }).expect(201);
      const body = { scope: "KOSK", reason: "Genişlet." };
      await http()
        .post(`/bans/${kosk.body.id}/extend`)
        .set("Authorization", auth(ADMIN_ID))
        .send(body)
        .expect(400);
      await dbUtils.cleanTables("bans");
      const course = await ban(MUDERRIS_ID).expect(201);
      await http()
        .post(`/bans/${course.body.id}/extend`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ scope: "KOSK", reason: "  " })
        .expect(400);
      await http()
        .post(`/bans/${course.body.id}/extend`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ scope: "PLATFORM", reason: "x" })
        .expect(400);
      await http()
        .post(`/bans/${course.body.id}/lift`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "ok" })
        .expect(200);
      await http()
        .post(`/bans/${course.body.id}/extend`)
        .set("Authorization", auth(ADMIN_ID))
        .send(body)
        .expect(409);
    });
  });
});
