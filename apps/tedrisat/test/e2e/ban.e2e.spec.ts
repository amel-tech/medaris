import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { bans } from "../../src/database/schema/ban.schema";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
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
  const TABLES = [...COURSE_TREE_TABLES, "bans", "audit_log", "users"] as const;

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
});
