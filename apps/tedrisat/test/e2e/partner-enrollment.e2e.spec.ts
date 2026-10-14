import { INestApplication } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import request from "supertest";
import { AuditRepository } from "../../src/audit/audit.repository";
import { CourseService } from "../../src/course/course.service";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { bans } from "../../src/database/schema/ban.schema";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import {
  partnerCourseCodes,
  partnerEnrollmentLinks,
} from "../../src/database/schema/partner-enrollment.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { KEYCLOAK_ADMIN_FETCH } from "../../src/keycloak-admin/keycloak-admin.service";
import { asSystemAdmin } from "../helpers/system-admin.helper";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * Partner enrollments against a real Postgres and the real guards, with the
 * repo's signed test tokens: the partner's service-account token is minted
 * like any other, with the partner's `azp` and the `partner-enrollment` realm
 * role. The realm's directory is a fetch that answers `GET /users/{id}` from
 * `REALM`. partner-enrollment-keycloak.e2e.spec.ts runs the same flow against
 * a real Keycloak; this one covers every rule.
 *
 * `KEYCLOAK_ALLOWED_CLIENTS` is empty here (test-app.helper.ts), the
 * configuration where a partner's token would pass `AuthGuard` but for
 * `keycloak.refusedClients`.
 */
const PARTNER_ID = "ornek-uygulama";
const PARTNER_NAME = "Örnek Uygulama";
const SERVICE_ACCOUNT = "a0000000-0000-4000-8000-0000000000aa";
const NAZIM = "a0000000-0000-4000-8000-000000000001";
const MUDERRIS = "a0000000-0000-4000-8000-000000000002";
const ADMIN = "a0000000-0000-4000-8000-000000000003";
const TALEBE = "a0000000-0000-4000-8000-000000000011";
const OTHER = "a0000000-0000-4000-8000-000000000012";
const SELF = "a0000000-0000-4000-8000-000000000013";
const UNVERIFIED = "a0000000-0000-4000-8000-000000000014";
const DISABLED = "a0000000-0000-4000-8000-000000000015";
const BARRED = "a0000000-0000-4000-8000-000000000016";
const NOBODY = "a0000000-0000-4000-8000-000000000017";

/** The realm's accounts, by id. */
const REALM: Record<
  string,
  { email: string; firstName: string; verified?: boolean; enabled?: boolean }
> = {
  [TALEBE]: { email: "talebe@example.com", firstName: "Talebe" },
  [OTHER]: { email: "diger@example.com", firstName: "Diğer" },
  [SELF]: { email: "kendi@example.com", firstName: "Kendi" },
  [UNVERIFIED]: {
    email: "dogrulanmamis@example.com",
    firstName: "Doğrulanmamış",
    verified: false,
  },
  [DISABLED]: {
    email: "kapali@example.com",
    firstName: "Kapalı",
    enabled: false,
  },
  [BARRED]: { email: "yasakli@example.com", firstName: "Yasaklı" },
};

async function fakeFetch(input: unknown): Promise<Response> {
  const url = new URL(String(input));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  if (url.pathname.endsWith("/protocol/openid-connect/token")) {
    return json({ access_token: "t", expires_in: 300 });
  }
  const match = /\/admin\/realms\/[^/]+\/users\/([^/]+)$/.exec(url.pathname);
  const account = match ? REALM[match[1]] : undefined;
  if (!match || !account) return json({ error: "User not found" }, 404);
  return json({
    id: match[1],
    email: account.email,
    emailVerified: account.verified ?? true,
    firstName: account.firstName,
    lastName: "Test",
    enabled: account.enabled ?? true,
  });
}

/** The partner's service-account token: its `azp`, and the role unless told otherwise. */
const partner = (roles: string[] = ["partner-enrollment"]) =>
  bearerFor({
    sub: SERVICE_ACCOUNT,
    claims: { azp: PARTNER_ID, realm_access: { roles } },
  });

describe("Partner enrollments (e2e)", () => {
  let app: INestApplication;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let courseId: string;
  let openCourseId: string;
  let draftCourseId: string;

  const http = () => request(app.getHttpServer());
  const put = (ref: string, code: string, userId: string, auth = partner()) =>
    http()
      .put(`/integrations/enrollments/${ref}/${code}`)
      .set("Authorization", auth)
      .send({ userId });
  const del = (ref: string, code: string, auth = partner()) =>
    http()
      .delete(`/integrations/enrollments/${ref}/${code}`)
      .set("Authorization", auth);
  const addCode = (course: string, code: string, sub = NAZIM) =>
    http()
      .post(`/courses/${course}/partner-codes`)
      .set("Authorization", bearerFor({ sub }))
      .send({ partner: PARTNER_ID, code });
  const seatOf = async (userId: string, course = courseId) =>
    (
      await db
        .select()
        .from(enrollments)
        .where(
          and(eq(enrollments.userId, userId), eq(enrollments.courseId, course))
        )
    )[0] ?? null;
  const auditRows = (action: string) =>
    db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, action))
      .orderBy(asc(auditLog.seq));
  const told = (userId: string) =>
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(asc(notifications.createdAt));

  beforeAll(async () => {
    // Read when AppModule is imported, inside createTestApp.
    process.env.INTEGRATION_PARTNERS = `${PARTNER_ID}=${PARTNER_NAME}`;
    process.env.KEYCLOAK_ADMIN_CLIENT_ID = "tedrisat-admin";
    process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = "s";
    app = await createTestApp({
      overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
    });
    const databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  const clean = () =>
    dbUtils.cleanTables(
      "bans",
      "notifications",
      ...COURSE_TREE_TABLES,
      "audit_log"
    );

  beforeEach(async () => {
    await clean();
    const [kosk] = await db
      .insert(kosks)
      .values({ ownerId: NAZIM, name: "Örnek Köşkü" })
      .returning();
    koskId = kosk.id;
    const rows = await db
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM,
          title: "Tecvid",
          status: CourseStatus.PUBLISHED,
          requiresApproval: true,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Nahiv",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Taslak",
          status: CourseStatus.DRAFT,
        },
      ])
      .returning();
    [courseId, openCourseId, draftCourseId] = rows.map((r) => r.id);
    await assignRole(db, {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    await assignRole(db, {
      userId: MUDERRIS,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: NAZIM,
    });
    await db
      .insert(courseMuderris)
      .values({ courseId, userId: MUDERRIS, name: "Müderris", orderIndex: 0 });
    await db.insert(partnerCourseCodes).values([
      {
        partnerClientId: PARTNER_ID,
        code: "tecvid",
        courseId,
        createdBy: NAZIM,
      },
      {
        partnerClientId: PARTNER_ID,
        code: "tecvid-hafta-1",
        courseId,
        createdBy: NAZIM,
      },
      {
        partnerClientId: PARTNER_ID,
        code: "nahiv",
        courseId: openCourseId,
        createdBy: NAZIM,
      },
      {
        partnerClientId: PARTNER_ID,
        code: "taslak",
        courseId: draftCourseId,
        createdBy: NAZIM,
      },
    ]);
  });

  afterAll(async () => {
    await clean();
    await app?.close();
  });

  describe("who may call /integrations/*", () => {
    it("refuses a person's token, and a partner's token without the role", async () => {
      await put("R-1", "tecvid", TALEBE, bearerFor({ sub: TALEBE })).expect(
        401
      );
      await put(
        "R-1",
        "tecvid",
        TALEBE,
        bearerFor({ sub: TALEBE, claims: { azp: "tedris-dev" } })
      ).expect(401);
      const res = await put(
        "R-1",
        "tecvid",
        TALEBE,
        partner(["default-roles-medaris"])
      ).expect(403);
      expect(res.body.code).toBe("PARTNER_ROLE_MISSING");
      await http().get("/integrations/courses").expect(401);
      expect(await seatOf(TALEBE)).toBeNull();
    });

    it("refuses the partner's token on every ordinary route", async () => {
      for (const path of [
        "/partner-applications",
        `/courses/${courseId}/partner-codes`,
        "/me",
        "/flashcard/decks/collections",
      ]) {
        await http().get(path).set("Authorization", partner()).expect(401);
      }
    });

    it("never records the partner's service account as a person", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);
      const people = await db.execute(
        `select id from users where id = '${SERVICE_ACCOUNT}'`
      );
      expect(people.rows).toEqual([]);
    });
  });

  describe("PUT /integrations/enrollments/{registrationRef}/{courseCode}", () => {
    it("enrols the person as an active talebe whatever the course's approval rule, once", async () => {
      const first = await put("R-1", "tecvid", TALEBE).expect(200);
      expect(first.body).toEqual({ status: "ENROLLED", courseId });
      expect(await seatOf(TALEBE)).toMatchObject({
        status: EnrollmentStatus.ENROLLED,
        studentName: "Talebe Test",
        studentEmail: "talebe@example.com",
      });

      const again = await put("R-1", "tecvid", TALEBE).expect(200);
      expect(again.body).toEqual({ status: "ALREADY_ENROLLED", courseId });

      const added = await auditRows("enrollment.partner_add");
      expect(added).toHaveLength(1);
      expect(added[0]).toMatchObject({
        actorId: SERVICE_ACCOUNT,
        entity: "course",
        entityId: courseId,
        details: {
          partner: { clientId: PARTNER_ID, name: PARTNER_NAME },
          userId: TALEBE,
          registrationRef: "R-1",
          courseCode: "tecvid",
          outcome: "enrolled",
        },
      });
      // The audit page names the partner as the actor.
      const page = await app
        .get(AuditRepository, { strict: false })
        .list({}, undefined, 10);
      expect(
        page.find((row) => row.action === "enrollment.partner_add")
      ).toMatchObject({ actorId: SERVICE_ACCOUNT, actorName: PARTNER_NAME });
    });

    it("approves a request the person had made on their own, telling them", async () => {
      await http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", bearerFor({ sub: OTHER }))
        .expect(201);
      expect((await seatOf(OTHER))?.status).toBe(EnrollmentStatus.PENDING);

      const res = await put("R-2", "tecvid", OTHER).expect(200);
      expect(res.body.status).toBe("ENROLLED");
      expect((await seatOf(OTHER))?.status).toBe(EnrollmentStatus.ENROLLED);
      expect(await told(OTHER)).toEqual([
        expect.objectContaining({
          type: "ENROLLMENT_APPROVED",
          targetId: courseId,
        }),
      ]);
    });

    it("answers 404 for a code no course is mapped to, and for a person the realm does not have", async () => {
      const unknown = await put("R-1", "bilinmeyen", TALEBE).expect(404);
      expect(unknown.body.code).toBe("PARTNER_COURSE_UNKNOWN");
      for (const userId of [NOBODY, DISABLED]) {
        const res = await put("R-1", "tecvid", userId).expect(404);
        expect(res.body.code).toBe("PARTNER_USER_UNKNOWN");
      }
      expect(await db.select().from(partnerEnrollmentLinks)).toEqual([]);
    });

    it("refuses an account whose e-mail is not verified", async () => {
      const res = await put("R-1", "tecvid", UNVERIFIED).expect(409);
      expect(res.body.code).toBe("PARTNER_USER_UNVERIFIED");
      expect(await seatOf(UNVERIFIED)).toBeNull();
    });

    it("binds a registration to its first person", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);
      const res = await put("R-1", "tecvid", OTHER).expect(409);
      expect(res.body.code).toBe("PARTNER_REGISTRATION_USER_MISMATCH");
      expect(await seatOf(OTHER)).toBeNull();
      // The same registration for another course is another link.
      await put("R-1", "nahiv", OTHER).expect(200);
    });

    it("passes on tedrisat's own refusals with the reason, and links nothing", async () => {
      const draft = await put("R-3", "taslak", TALEBE).expect(409);
      expect(draft.body).toMatchObject({
        code: "PARTNER_ENROLLMENT_REFUSED",
        context: { reason: "COURSE_NOT_PUBLISHED" },
      });

      await db.insert(bans).values({
        userId: BARRED,
        koskId,
        courseId,
        scope: "COURSE",
        reason: "Düzeni bozdu.",
        bannedBy: MUDERRIS,
        bannedRole: "MUDERRIS",
        bannedTier: 1,
      });
      const barred = await put("R-4", "tecvid", BARRED).expect(409);
      expect(barred.body.context).toEqual({ reason: "BANNED" });
      expect(await seatOf(BARRED)).toBeNull();

      await db.insert(enrollments).values({
        userId: OTHER,
        courseId,
        status: EnrollmentStatus.REVOKED,
      });
      const removed = await put("R-5", "tecvid", OTHER).expect(409);
      expect(removed.body.context).toEqual({
        reason: "REMOVED_BY_COURSE_TEAM",
      });
      expect(await db.select().from(partnerEnrollmentLinks)).toEqual([]);
    });

    it("refuses a path or body of the wrong shape", async () => {
      await put("R 1", "tecvid", TALEBE).expect(400);
      await put("R-1", "Tecvid", TALEBE).expect(400);
      await put("R-1", "tecvid", "talebe@example.com").expect(400);
    });
  });

  describe("DELETE /integrations/enrollments/{registrationRef}/{courseCode}", () => {
    it("takes away the seat it added through the team's removal path, and says so again", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);

      const res = await del("R-1", "tecvid").expect(200);
      expect(res.body).toEqual({ status: "REMOVED" });
      expect((await seatOf(TALEBE))?.status).toBe(EnrollmentStatus.REVOKED);
      const removals = await auditRows("enrollment.remove");
      expect(removals).toHaveLength(1);
      expect(removals[0]).toMatchObject({
        actorId: SERVICE_ACCOUNT,
        details: {
          partner: { clientId: PARTNER_ID, name: PARTNER_NAME },
          userId: TALEBE,
          reason: `${PARTNER_NAME} üzerinden yapılan kayıt iptal edildi.`,
        },
      });
      expect(await told(TALEBE)).toEqual([
        expect.objectContaining({
          type: "REMOVED_FROM_COURSE",
          params: expect.objectContaining({
            reason: `${PARTNER_NAME} üzerinden yapılan kayıt iptal edildi.`,
          }),
        }),
      ]);
      const [removedRow] = await app
        .get(CourseService, { strict: false })
        .findRemovedEnrollments(courseId);
      expect(removedRow.removedBy).toEqual({
        id: SERVICE_ACCOUNT,
        name: PARTNER_NAME,
      });

      await del("R-1", "tecvid").expect(200, { status: "REMOVED" });
      expect(await auditRows("enrollment.remove")).toHaveLength(1);
    });

    it("gives back a seat it took away when the registration returns", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);
      await del("R-1", "tecvid").expect(200, { status: "REMOVED" });

      const res = await put("R-1", "tecvid", TALEBE).expect(200);
      expect(res.body.status).toBe("ENROLLED");
      expect((await seatOf(TALEBE))?.status).toBe(EnrollmentStatus.ENROLLED);
      // And it is the registration's again to take away.
      await del("R-1", "tecvid").expect(200, { status: "REMOVED" });
    });

    it("does not give back a seat the course team took away after it", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);
      await del("R-1", "tecvid").expect(200);
      // The team gives the seat back, then takes it away itself.
      await http()
        .post(`/courses/${courseId}/enrollments/${TALEBE}/approve`)
        .set("Authorization", bearerFor({ sub: MUDERRIS }))
        .expect(201);
      await http()
        .post(`/courses/${courseId}/enrollments/${TALEBE}/remove`)
        .set("Authorization", bearerFor({ sub: MUDERRIS }))
        .send({ reason: "Devamsızlık." })
        .expect(200);

      const res = await put("R-9", "tecvid", TALEBE).expect(409);
      expect(res.body.context).toEqual({ reason: "REMOVED_BY_COURSE_TEAM" });
    });

    it("keeps a seat the person took on their own", async () => {
      await http()
        .post(`/courses/${openCourseId}/enroll`)
        .set("Authorization", bearerFor({ sub: SELF }))
        .expect(201);

      const res = await put("R-6", "nahiv", SELF).expect(200);
      expect(res.body).toEqual({
        status: "ALREADY_ENROLLED",
        courseId: openCourseId,
      });
      await del("R-6", "nahiv").expect(200, { status: "KEPT" });
      expect((await seatOf(SELF, openCourseId))?.status).toBe(
        EnrollmentStatus.ENROLLED
      );
      await del("R-6", "nahiv").expect(200, { status: "KEPT" });
    });

    it("keeps a seat the person took again on their own after leaving", async () => {
      await put("R-7", "nahiv", SELF).expect(200, {
        status: "ENROLLED",
        courseId: openCourseId,
      });
      const talebe = bearerFor({ sub: SELF });
      await http()
        .delete(`/courses/${openCourseId}/enrollment`)
        .set("Authorization", talebe)
        .expect(200);
      await http()
        .post(`/courses/${openCourseId}/enroll`)
        .set("Authorization", talebe)
        .expect(201);

      await del("R-7", "nahiv").expect(200, { status: "KEPT" });
      expect((await seatOf(SELF, openCourseId))?.status).toBe(
        EnrollmentStatus.ENROLLED
      );
    });

    it("hands the seat to the registration still standing for it", async () => {
      await put("R-8", "tecvid", TALEBE).expect(200, {
        status: "ENROLLED",
        courseId,
      });
      await put("R-9", "tecvid-hafta-1", TALEBE).expect(200, {
        status: "ALREADY_ENROLLED",
        courseId,
      });

      await del("R-8", "tecvid").expect(200, { status: "KEPT" });
      expect((await seatOf(TALEBE))?.status).toBe(EnrollmentStatus.ENROLLED);
      await del("R-9", "tecvid-hafta-1").expect(200, { status: "REMOVED" });
      expect((await seatOf(TALEBE))?.status).toBe(EnrollmentStatus.REVOKED);
    });

    it("answers NOT_FOUND for a registration it never saw", async () => {
      await del("R-404", "tecvid").expect(200, { status: "NOT_FOUND" });
    });
  });

  describe("course staff: Ortak uygulama kodları", () => {
    it("lists the configured partners, display names only, to anyone signed in", async () => {
      const res = await http()
        .get("/partner-applications")
        .set("Authorization", bearerFor({ sub: TALEBE }))
        .expect(200);
      expect(res.body).toEqual([{ id: PARTNER_ID, name: PARTNER_NAME }]);
    });

    it("is the köşk nazımı's and the başnazım's, not the müderris'", async () => {
      const mine = async (sub: string, auth = bearerFor({ sub })) =>
        (
          await http()
            .get(`/courses/${courseId}/my-permissions`)
            .set("Authorization", auth)
            .expect(200)
        ).body.permissions as string[];
      expect(await mine(NAZIM)).toContain("course.partner_codes");
      expect(await mine(ADMIN, asSystemAdmin(ADMIN))).toContain(
        "course.partner_codes"
      );
      expect(await mine(MUDERRIS)).not.toContain("course.partner_codes");

      await http()
        .get(`/courses/${courseId}/partner-codes`)
        .set("Authorization", bearerFor({ sub: MUDERRIS }))
        .expect(403);
      await addCode(courseId, "yeni-kod", MUDERRIS).expect(403);
      await http()
        .get(`/courses/${courseId}/partner-codes`)
        .set("Authorization", asSystemAdmin(ADMIN))
        .expect(200);
    });

    it("adds a code, once, and refuses one another course has without naming it", async () => {
      await addCode(openCourseId, "sarf-2026").expect(201);
      await addCode(openCourseId, "sarf-2026").expect(201);
      const taken = await addCode(courseId, "sarf-2026").expect(409);
      expect(taken.body.code).toBe("PARTNER_CODE_TAKEN");
      expect(JSON.stringify(taken.body)).not.toContain("Nahiv");
      expect(JSON.stringify(taken.body)).not.toContain(openCourseId);

      const res = await http()
        .get(`/courses/${openCourseId}/partner-codes`)
        .set("Authorization", bearerFor({ sub: NAZIM }))
        .expect(200);
      expect(res.body.partners).toEqual([
        {
          id: PARTNER_ID,
          name: PARTNER_NAME,
          codes: [
            { code: "nahiv", createdAt: expect.any(String) },
            { code: "sarf-2026", createdAt: expect.any(String) },
          ],
        },
      ]);
      expect(await auditRows("course.partner_code_add")).toEqual([
        expect.objectContaining({
          actorId: NAZIM,
          entityId: openCourseId,
          details: {
            partner: { clientId: PARTNER_ID, name: PARTNER_NAME },
            code: "sarf-2026",
          },
        }),
      ]);
    });

    it("refuses a malformed code and a partner this server does not know", async () => {
      await addCode(courseId, "Büyük Harf").expect(400);
      const res = await http()
        .post(`/courses/${courseId}/partner-codes`)
        .set("Authorization", bearerFor({ sub: NAZIM }))
        .send({ partner: "baska-uygulama", code: "tecvid-2" })
        .expect(404);
      expect(res.body.code).toBe("PARTNER_UNKNOWN");
    });

    it("takes a code off its own course only; the people it enrolled stay reachable", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);
      const remove = (course: string, code: string) =>
        http()
          .delete(`/courses/${course}/partner-codes/${PARTNER_ID}/${code}`)
          .set("Authorization", bearerFor({ sub: NAZIM }));

      await remove(openCourseId, "tecvid").expect(204);
      expect(await db.select().from(partnerCourseCodes)).toHaveLength(4);
      await remove(courseId, "tecvid").expect(204);
      expect(await db.select().from(partnerCourseCodes)).toHaveLength(3);
      expect(await auditRows("course.partner_code_remove")).toHaveLength(1);

      await put("R-2", "tecvid", OTHER).expect(404);
      await del("R-1", "tecvid").expect(200, { status: "REMOVED" });
    });

    it("lists the partner's codes to the partner", async () => {
      const res = await http()
        .get("/integrations/courses")
        .set("Authorization", partner())
        .expect(200);
      expect(res.body).toEqual([
        { code: "nahiv", courseId: openCourseId, title: "Nahiv" },
        { code: "taslak", courseId: draftCourseId, title: "Taslak" },
        { code: "tecvid", courseId, title: "Tecvid" },
        { code: "tecvid-hafta-1", courseId, title: "Tecvid" },
      ]);
    });
  });

  it("takes the codes and the registrations with a course deleted for real", async () => {
    await put("R-1", "tecvid", TALEBE).expect(200);
    await http()
      .delete(`/courses/${courseId}`)
      .set("Authorization", asSystemAdmin(ADMIN))
      .expect(200);
    expect(
      await db
        .select()
        .from(partnerCourseCodes)
        .where(eq(partnerCourseCodes.courseId, courseId))
    ).toEqual([]);
    expect(await db.select().from(partnerEnrollmentLinks)).toEqual([]);
    await del("R-1", "tecvid").expect(200, { status: "NOT_FOUND" });
  });

  // Last: what it spends stays spent for a window, on every partner route.
  it("gives a partner a budget of its own, and says when to come back", async () => {
    process.env.THROTTLE_PARTNER_LIMIT = "2";
    try {
      const statuses: number[] = [];
      let retryAfter: string | undefined;
      for (let i = 0; i < 3; i += 1) {
        const res = await http()
          .get("/integrations/courses")
          .set("Authorization", partner());
        statuses.push(res.status);
        retryAfter ??= res.headers["retry-after"];
      }
      expect(statuses).toContain(429);
      expect(retryAfter).toBeDefined();
    } finally {
      delete process.env.THROTTLE_PARTNER_LIMIT;
    }
  });
});
