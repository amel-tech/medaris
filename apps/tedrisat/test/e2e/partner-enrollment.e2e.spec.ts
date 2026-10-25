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
import {
  integrationPartnerKosks,
  integrationPartners,
} from "../../src/database/schema/integration-partner.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import {
  partnerCourseCodes,
  partnerEnrollmentLinks,
} from "../../src/database/schema/partner-enrollment.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { PartnerRegistry } from "../../src/integration/partner-registry";
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
 * The partner is a row of `integration_partners`, bound to the köşk of the
 * courses below, as the başnazım registers it in nizam; a test that writes
 * those rows by hand empties the registry's cache (`invalidate`), as the
 * routes' writes do. `KEYCLOAK_ALLOWED_CLIENTS` is empty here
 * (test-app.helper.ts), the configuration where a partner's token would pass
 * `AuthGuard` but for the registry the verifier asks.
 */
const PARTNER_ID = "ornek-uygulama";
const PARTNER_NAME = "Örnek Uygulama";
const OTHER_PARTNER_ID = "ikinci-uygulama";
const OTHER_PARTNER_NAME = "İkinci Uygulama";
const MEDARIS = "a0000000-0000-4000-8000-000000000004";
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
  // A köşk the partner is not bound to, with a published course.
  let otherKoskId: string;
  let otherCourseId: string;

  const http = () => request(app.getHttpServer());
  /** What the routes' writes do; a test that writes the rows by hand calls it. */
  const forget = () => app.get(PartnerRegistry, { strict: false }).invalidate();
  const register = async (
    clientId: string,
    name: string,
    boundTo: string[],
    enabled = true
  ) => {
    await db.insert(integrationPartners).values({ clientId, name, enabled });
    if (boundTo.length > 0) {
      await db
        .insert(integrationPartnerKosks)
        .values(boundTo.map((id) => ({ clientId, koskId: id })));
    }
    forget();
  };
  /** nizam's "Ortak uygulamalar" routes, as the başnazım unless told otherwise. */
  const admin = {
    list: (auth = asSystemAdmin(ADMIN)) =>
      http().get("/nizam/partner-applications").set("Authorization", auth),
    create: (body: object, auth = asSystemAdmin(ADMIN)) =>
      http()
        .post("/nizam/partner-applications")
        .set("Authorization", auth)
        .send(body),
    update: (clientId: string, body: object, auth = asSystemAdmin(ADMIN)) =>
      http()
        .patch(`/nizam/partner-applications/${clientId}`)
        .set("Authorization", auth)
        .send(body),
    kosks: (clientId: string, koskIds: string[], auth = asSystemAdmin(ADMIN)) =>
      http()
        .put(`/nizam/partner-applications/${clientId}/kosks`)
        .set("Authorization", auth)
        .send({ koskIds }),
  };
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
    // Read when the app's configuration loads, inside createTestApp. The
    // partners are the database's; the value only seeds it (see the last
    // describe).
    delete process.env.INTEGRATION_PARTNERS;
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
      "permission_grants",
      // Takes its köşk bindings with it (ON DELETE CASCADE).
      "integration_partners",
      ...COURSE_TREE_TABLES,
      "audit_log"
    );

  beforeEach(async () => {
    await clean();
    const [kosk, otherKosk] = await db
      .insert(kosks)
      .values([
        { ownerId: NAZIM, name: "Örnek Köşkü" },
        { ownerId: ADMIN, name: "Başka Köşk" },
      ])
      .returning();
    koskId = kosk.id;
    otherKoskId = otherKosk.id;
    const [other] = await db
      .insert(courses)
      .values({
        koskId: otherKoskId,
        authorId: ADMIN,
        title: "Belâgat",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    otherCourseId = other.id;
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
    await register(PARTNER_ID, PARTNER_NAME, [koskId]);
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
        "/nizam/partner-applications",
        `/courses/${courseId}/partner-codes`,
        "/me",
        "/flashcard/decks/collections",
      ]) {
        await http().get(path).set("Authorization", partner()).expect(401);
      }
    });

    it("reads the partners from the registry: none registered is no route, one registered is admitted at once", async () => {
      await db.delete(integrationPartners);
      forget();
      const none = await http()
        .get("/integrations/courses")
        .set("Authorization", partner())
        .expect(404);
      expect(none.body.message).toBe("Cannot GET /integrations/courses");

      await admin
        .create({ clientId: PARTNER_ID, name: PARTNER_NAME })
        .expect(201);
      // No restart, no waiting out the cache: the write emptied it.
      const res = await http()
        .get("/integrations/courses")
        .set("Authorization", partner())
        .expect(200);
      // Bound to no köşk yet: none of its codes counts.
      expect(res.body).toEqual([]);
      // And refused on every ordinary route from then on, by the same read.
      await http().get("/me").set("Authorization", partner()).expect(401);
    });

    it("refuses a disabled partner with 403 on /integrations/*, and still on every other route", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);
      await admin.update(PARTNER_ID, { enabled: false }).expect(200);

      const listed = await http()
        .get("/integrations/courses")
        .set("Authorization", partner())
        .expect(403);
      expect(listed.body.code).toBe("PARTNER_DISABLED");
      expect((await put("R-2", "tecvid", OTHER).expect(403)).body.code).toBe(
        "PARTNER_DISABLED"
      );
      expect((await del("R-1", "tecvid").expect(403)).body.code).toBe(
        "PARTNER_DISABLED"
      );
      for (const path of ["/me", `/courses/${courseId}/partner-codes`]) {
        await http().get(path).set("Authorization", partner()).expect(401);
      }
      expect(await seatOf(OTHER)).toBeNull();
      expect((await seatOf(TALEBE))?.status).toBe(EnrollmentStatus.ENROLLED);

      await admin.update(PARTNER_ID, { enabled: true }).expect(200);
      await del("R-1", "tecvid").expect(200, { status: "REMOVED" });
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
      // Back on the roster, so off the team's removed list.
      expect(
        await app
          .get(CourseService, { strict: false })
          .findRemovedEnrollments(courseId)
      ).toEqual([]);
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

  describe("the köşk scope: a partner works with the köşks it is bound to", () => {
    const codesOf = async (course: string) =>
      (
        await http()
          .get(`/courses/${course}/partner-codes`)
          .set("Authorization", asSystemAdmin(ADMIN))
          .expect(200)
      ).body.partners as { id: string; codes: { code: string }[] }[];
    /** A code mapped in the other köşk, as if while the partner was bound to it. */
    const mappedElsewhere = () =>
      db.insert(partnerCourseCodes).values({
        partnerClientId: PARTNER_ID,
        code: "belagat",
        courseId: otherCourseId,
        createdBy: ADMIN,
      });

    it("lists a course's partners: the enabled ones bound to its köşk, each with its codes", async () => {
      await register(OTHER_PARTNER_ID, OTHER_PARTNER_NAME, [otherKoskId]);
      await register("kapali-uygulama", "Kapalı Uygulama", [koskId], false);

      expect(await codesOf(courseId)).toEqual([
        {
          id: PARTNER_ID,
          name: PARTNER_NAME,
          codes: [
            { code: "tecvid", createdAt: expect.any(String) },
            { code: "tecvid-hafta-1", createdAt: expect.any(String) },
          ],
        },
      ]);
      expect(await codesOf(otherCourseId)).toEqual([
        { id: OTHER_PARTNER_ID, name: OTHER_PARTNER_NAME, codes: [] },
      ]);

      await admin.kosks(PARTNER_ID, []).expect(200);
      expect(await codesOf(courseId)).toEqual([]);
    });

    it("maps a code only for a partner of the course's köşk", async () => {
      const add = (course: string, partnerId: string) =>
        http()
          .post(`/courses/${course}/partner-codes`)
          .set("Authorization", asSystemAdmin(ADMIN))
          .send({ partner: partnerId, code: "belagat" });

      const res = await add(otherCourseId, PARTNER_ID).expect(404);
      expect(res.body.code).toBe("PARTNER_UNKNOWN");
      await register(
        "kapali-uygulama",
        "Kapalı Uygulama",
        [otherKoskId],
        false
      );
      await add(otherCourseId, "kapali-uygulama").expect(404);
      expect(await db.select().from(partnerCourseCodes)).toHaveLength(4);

      await admin.kosks(PARTNER_ID, [koskId, otherKoskId]).expect(200);
      await add(otherCourseId, PARTNER_ID).expect(201);
    });

    it("enrols nobody through a code in a köşk the partner is not bound to, and names nothing", async () => {
      await mappedElsewhere();
      const res = await put("R-1", "belagat", TALEBE).expect(404);
      expect(res.body.code).toBe("PARTNER_COURSE_UNKNOWN");
      expect(JSON.stringify(res.body)).not.toContain(otherCourseId);
      expect(await seatOf(TALEBE, otherCourseId)).toBeNull();

      // A köşk unbound since: its codes stop at once.
      await admin.kosks(PARTNER_ID, [otherKoskId]).expect(200);
      expect((await put("R-2", "tecvid", TALEBE).expect(404)).body.code).toBe(
        "PARTNER_COURSE_UNKNOWN"
      );
      await put("R-1", "belagat", TALEBE).expect(200, {
        status: "ENROLLED",
        courseId: otherCourseId,
      });
      expect(await db.select().from(partnerEnrollmentLinks)).toHaveLength(1);
    });

    it("lists to the partner only its codes in the köşks it is bound to", async () => {
      await mappedElsewhere();
      const listed = async () =>
        (
          await http()
            .get("/integrations/courses")
            .set("Authorization", partner())
            .expect(200)
        ).body.map((row: { code: string }) => row.code);

      expect(await listed()).toEqual([
        "nahiv",
        "taslak",
        "tecvid",
        "tecvid-hafta-1",
      ]);
      await admin.kosks(PARTNER_ID, [otherKoskId]).expect(200);
      expect(await listed()).toEqual(["belagat"]);
    });

    it("still undoes, after an unbinding, a seat the partner made", async () => {
      await put("R-1", "tecvid", TALEBE).expect(200);
      await admin.kosks(PARTNER_ID, []).expect(200);

      await del("R-1", "tecvid").expect(200, { status: "REMOVED" });
      expect((await seatOf(TALEBE))?.status).toBe(EnrollmentStatus.REVOKED);
      // And no new one there.
      await put("R-1", "tecvid", TALEBE).expect(404);
    });

    it("takes the partner's codes off an unbound köşk's courses, each in the audit log, and binding it again brings none back", async () => {
      // Another partner's code in the same köşk, and this partner's code in
      // another köşk: neither is the unbinding's.
      await register(OTHER_PARTNER_ID, OTHER_PARTNER_NAME, [koskId]);
      await db.insert(partnerCourseCodes).values({
        partnerClientId: OTHER_PARTNER_ID,
        code: "tecvid",
        courseId,
        createdBy: NAZIM,
      });
      await mappedElsewhere();

      await admin.kosks(PARTNER_ID, [otherKoskId]).expect(200);

      expect(
        await db
          .select({
            partner: partnerCourseCodes.partnerClientId,
            code: partnerCourseCodes.code,
          })
          .from(partnerCourseCodes)
          .orderBy(asc(partnerCourseCodes.code))
      ).toEqual([
        { partner: PARTNER_ID, code: "belagat" },
        { partner: OTHER_PARTNER_ID, code: "tecvid" },
      ]);
      const removed = await auditRows("course.partner_code_remove");
      expect(
        removed.map((row) => (row.details as { code: string }).code).sort()
      ).toEqual(["nahiv", "taslak", "tecvid", "tecvid-hafta-1"]);
      expect(removed.find((row) => row.entityId === courseId)).toMatchObject({
        actorId: ADMIN,
        entity: "course",
        details: {
          partner: { clientId: PARTNER_ID, name: PARTNER_NAME },
          unboundKosk: "Örnek Köşkü",
        },
      });

      await admin.kosks(PARTNER_ID, [koskId, otherKoskId]).expect(200);
      const listed = await codesOf(courseId);
      expect(listed.find((p) => p.id === PARTNER_ID)?.codes).toEqual([]);
      expect(
        listed.find((p) => p.id === OTHER_PARTNER_ID)?.codes.map((c) => c.code)
      ).toEqual(["tecvid"]);
      expect(await auditRows("course.partner_code_remove")).toHaveLength(4);
    });

    it("lets the partner map a code it lost with an unbinding in another köşk", async () => {
      await admin.kosks(PARTNER_ID, [otherKoskId]).expect(200);

      await http()
        .post(`/courses/${otherCourseId}/partner-codes`)
        .set("Authorization", asSystemAdmin(ADMIN))
        .send({ partner: PARTNER_ID, code: "tecvid" })
        .expect(201);
      await put("R-1", "tecvid", TALEBE).expect(200, {
        status: "ENROLLED",
        courseId: otherCourseId,
      });
    });

    it("lets course staff take off a code of a partner that is no longer the course's", async () => {
      const remove = (course: string, partnerId: string, code: string) =>
        http()
          .delete(`/courses/${course}/partner-codes/${partnerId}/${code}`)
          .set("Authorization", asSystemAdmin(ADMIN));
      const codeRows = (code: string) =>
        db
          .select()
          .from(partnerCourseCodes)
          .where(eq(partnerCourseCodes.code, code));

      // A code left in a köşk the partner is not bound to.
      await mappedElsewhere();
      await remove(otherCourseId, PARTNER_ID, "belagat").expect(204);
      expect(await codeRows("belagat")).toEqual([]);
      expect(await auditRows("course.partner_code_remove")).toEqual([
        expect.objectContaining({ actorId: ADMIN, entityId: otherCourseId }),
      ]);

      // A disabled partner's code, by the köşk nazımı.
      await admin.update(PARTNER_ID, { enabled: false }).expect(200);
      await http()
        .delete(`/courses/${courseId}/partner-codes/${PARTNER_ID}/tecvid`)
        .set("Authorization", bearerFor({ sub: NAZIM }))
        .expect(204);
      expect(await codeRows("tecvid")).toEqual([]);

      // An id nobody registered is still nobody's.
      const res = await remove(courseId, "baska-uygulama", "nahiv").expect(404);
      expect(res.body.code).toBe("PARTNER_UNKNOWN");
      // And adding still asks for one of the course's partners.
      await http()
        .post(`/courses/${courseId}/partner-codes`)
        .set("Authorization", asSystemAdmin(ADMIN))
        .send({ partner: PARTNER_ID, code: "tecvid" })
        .expect(404);
    });

    it("loses a köşk's bindings with the köşk deleted for real", async () => {
      await http()
        .delete(`/kosks/${koskId}`)
        .set("Authorization", asSystemAdmin(ADMIN))
        .expect(200);
      expect(await db.select().from(integrationPartnerKosks)).toEqual([]);
      expect(
        await db
          .select()
          .from(integrationPartners)
          .where(eq(integrationPartners.clientId, PARTNER_ID))
      ).toHaveLength(1);
    });
  });

  describe("the registry: Ortak uygulamalar in nizam", () => {
    it("is the başnazım's, and a Medaris nazımı's only when given platform.partner_manage", async () => {
      await admin.list().expect(200);
      for (const sub of [NAZIM, MUDERRIS, TALEBE, MEDARIS]) {
        await admin.list(bearerFor({ sub })).expect(403);
        await admin
          .create(
            { clientId: "yeni-uygulama", name: "Yeni" },
            bearerFor({ sub })
          )
          .expect(403);
        await admin
          .update(PARTNER_ID, { enabled: false }, bearerFor({ sub }))
          .expect(403);
        await admin.kosks(PARTNER_ID, [], bearerFor({ sub })).expect(403);
      }

      await db.insert(roleAssignments).values({
        userId: MEDARIS,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN,
      });
      await admin.list(bearerFor({ sub: MEDARIS })).expect(403);
      await db.insert(permissionGrants).values({
        userId: MEDARIS,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: "platform.partner_manage",
        grantedBy: ADMIN,
      });
      await admin.list(bearerFor({ sub: MEDARIS })).expect(200);
      await admin
        .create(
          { clientId: "yeni-uygulama", name: "Yeni" },
          bearerFor({ sub: MEDARIS })
        )
        .expect(201);
      // The köşk nazımı still is not.
      await admin.list(bearerFor({ sub: NAZIM })).expect(403);
    });

    it("lists every partner with its köşks, and every köşk to choose from", async () => {
      await register(OTHER_PARTNER_ID, OTHER_PARTNER_NAME, [], false);
      const res = await admin.list().expect(200);
      // By name, as the database's collation orders "İ" and "Ö": not pinned.
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items).toEqual(
        expect.arrayContaining([
          {
            clientId: OTHER_PARTNER_ID,
            name: OTHER_PARTNER_NAME,
            enabled: false,
            createdAt: expect.any(String),
            kosks: [],
          },
          {
            clientId: PARTNER_ID,
            name: PARTNER_NAME,
            enabled: true,
            createdAt: expect.any(String),
            kosks: [{ id: koskId, name: "Örnek Köşkü" }],
          },
        ])
      );
      expect(res.body.kosks).toEqual([
        { id: otherKoskId, name: "Başka Köşk" },
        { id: koskId, name: "Örnek Köşkü" },
      ]);
    });

    it("registers a partner, enabled and bound to nothing, and writes it to the audit log", async () => {
      const res = await admin
        .create({
          clientId: OTHER_PARTNER_ID,
          name: `  ${OTHER_PARTNER_NAME} `,
        })
        .expect(201);
      expect(res.body).toEqual({
        clientId: OTHER_PARTNER_ID,
        name: OTHER_PARTNER_NAME,
        enabled: true,
        createdAt: expect.any(String),
        kosks: [],
      });
      const [row] = await db
        .select()
        .from(integrationPartners)
        .where(eq(integrationPartners.clientId, OTHER_PARTNER_ID));
      expect(row.createdBy).toBe(ADMIN);
      expect(await auditRows("integration_partner.create")).toEqual([
        expect.objectContaining({
          actorId: ADMIN,
          entity: "integration_partner",
          details: { clientId: OTHER_PARTNER_ID, name: OTHER_PARTNER_NAME },
        }),
      ]);
    });

    it("refuses an id registered already, a malformed id and a blank or long name", async () => {
      await admin.update(PARTNER_ID, { enabled: false }).expect(200);
      const taken = await admin
        .create({ clientId: PARTNER_ID, name: "Başka Ad" })
        .expect(409);
      expect(taken.body.code).toBe("PARTNER_EXISTS");
      for (const body of [
        { clientId: "ornek uygulama", name: "Örnek" },
        { clientId: "-ornek", name: "Örnek" },
        { clientId: OTHER_PARTNER_ID, name: "   " },
        { clientId: OTHER_PARTNER_ID, name: "x".repeat(101) },
        { clientId: OTHER_PARTNER_ID },
      ]) {
        await admin.create(body).expect(400);
      }
      await admin.update(PARTNER_ID, { name: " " }).expect(400);
      expect(await auditRows("integration_partner.create")).toEqual([]);
    });

    it("renames, disables and enables, one audit row per change", async () => {
      const res = await admin
        .update(PARTNER_ID, { name: "Örnek Uygulama 2", enabled: false })
        .expect(200);
      expect(res.body).toMatchObject({
        clientId: PARTNER_ID,
        name: "Örnek Uygulama 2",
        enabled: false,
      });
      await admin.update(PARTNER_ID, { enabled: false }).expect(200);
      await admin.update(PARTNER_ID, { enabled: true }).expect(200);
      await admin.update("bilinmeyen", { enabled: true }).expect(404);

      expect(
        (await auditRows("integration_partner.rename")).map((r) => r.details)
      ).toEqual([
        { clientId: PARTNER_ID, name: "Örnek Uygulama 2", was: PARTNER_NAME },
      ]);
      expect(await auditRows("integration_partner.disable")).toHaveLength(1);
      expect(await auditRows("integration_partner.enable")).toHaveLength(1);
      // The new name is the one the next audit row of the partner carries.
      await put("R-1", "tecvid", TALEBE).expect(200);
      expect(
        (await auditRows("enrollment.partner_add"))[0].details
      ).toMatchObject({
        partner: { clientId: PARTNER_ID, name: "Örnek Uygulama 2" },
      });
    });

    it("binds and unbinds köşks, each under its köşk in the audit log", async () => {
      const both = await admin
        .kosks(PARTNER_ID, [koskId, otherKoskId, koskId])
        .expect(200);
      expect(both.body.kosks).toEqual([
        { id: otherKoskId, name: "Başka Köşk" },
        { id: koskId, name: "Örnek Köşkü" },
      ]);
      await admin.kosks(PARTNER_ID, [otherKoskId]).expect(200);
      const missing = await admin
        .kosks(PARTNER_ID, ["c0000000-0000-4000-8000-0000000000ff"])
        .expect(404);
      expect(missing.body.code).toBe("KOSK_NOT_FOUND");
      await admin.kosks("bilinmeyen", []).expect(404);
      await admin.kosks(PARTNER_ID, ["not-a-uuid"]).expect(400);

      expect(await auditRows("integration_partner.kosk_bind")).toEqual([
        expect.objectContaining({
          actorId: ADMIN,
          entity: "kosk",
          entityId: otherKoskId,
          details: {
            clientId: PARTNER_ID,
            name: PARTNER_NAME,
            kosk: "Başka Köşk",
          },
        }),
      ]);
      expect(await auditRows("integration_partner.kosk_unbind")).toEqual([
        expect.objectContaining({ entity: "kosk", entityId: koskId }),
      ]);
      expect(
        await db
          .select({ koskId: integrationPartnerKosks.koskId })
          .from(integrationPartnerKosks)
      ).toEqual([{ koskId: otherKoskId }]);
    });
  });

  describe("a second boot, with its own configuration", () => {
    let booted: INestApplication | undefined;
    afterEach(async () => {
      delete process.env.INTEGRATION_PARTNERS;
      delete process.env.KEYCLOAK_ALLOWED_CLIENTS;
      await booted?.close();
      booted = undefined;
    });
    const boot = async (allowedClients?: string) => {
      booted = await createTestApp({
        overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
        allowedClients,
      });
      return booted;
    };
    const partnersNow = () =>
      db
        .select()
        .from(integrationPartners)
        .orderBy(asc(integrationPartners.clientId));
    const bindingsNow = () =>
      db
        .select({
          clientId: integrationPartnerKosks.clientId,
          koskId: integrationPartnerKosks.koskId,
          createdBy: integrationPartnerKosks.createdBy,
        })
        .from(integrationPartnerKosks)
        .orderBy(asc(integrationPartnerKosks.clientId));

    it("seeds INTEGRATION_PARTNERS at boot: a partner not registered is, bound to the köşks of its codes; one registered is left alone", async () => {
      // What a deployment had before this release: a partner in the value,
      // with a code mapped, and nothing in the table. The partner of the
      // fixture stands for one the başnazım has already changed.
      await db.insert(partnerCourseCodes).values({
        partnerClientId: OTHER_PARTNER_ID,
        code: "belagat",
        courseId: otherCourseId,
        createdBy: ADMIN,
      });
      await db
        .update(integrationPartners)
        .set({ enabled: false })
        .where(eq(integrationPartners.clientId, PARTNER_ID));
      await admin.kosks(PARTNER_ID, []).expect(200);
      process.env.INTEGRATION_PARTNERS = `${PARTNER_ID}=Başka Ad,${OTHER_PARTNER_ID}=${OTHER_PARTNER_NAME}`;

      const second = await boot();

      expect(await partnersNow()).toEqual([
        expect.objectContaining({
          clientId: OTHER_PARTNER_ID,
          name: OTHER_PARTNER_NAME,
          enabled: true,
          createdBy: null,
        }),
        expect.objectContaining({
          clientId: PARTNER_ID,
          name: PARTNER_NAME,
          enabled: false,
        }),
      ]);
      expect(await bindingsNow()).toEqual([
        { clientId: OTHER_PARTNER_ID, koskId: otherKoskId, createdBy: null },
      ]);
      expect(
        (await auditRows("integration_partner.create")).map((r) => r.details)
      ).toEqual([
        {
          clientId: OTHER_PARTNER_ID,
          name: OTHER_PARTNER_NAME,
          seededFrom: "INTEGRATION_PARTNERS",
        },
      ]);
      expect(await auditRows("integration_partner.kosk_bind")).toEqual([
        expect.objectContaining({
          entity: "kosk",
          entityId: otherKoskId,
          details: expect.objectContaining({
            seededFrom: "INTEGRATION_PARTNERS",
          }),
        }),
      ]);

      // The seeded partner works at once, in its köşk.
      const seeded = bearerFor({
        sub: SERVICE_ACCOUNT,
        claims: {
          azp: OTHER_PARTNER_ID,
          realm_access: { roles: ["partner-enrollment"] },
        },
      });
      await request(second.getHttpServer())
        .put(`/integrations/enrollments/R-1/belagat`)
        .set("Authorization", seeded)
        .send({ userId: TALEBE })
        .expect(200, { status: "ENROLLED", courseId: otherCourseId });

      // A boot after the başnazım unbound it does not bind it again.
      await admin.kosks(OTHER_PARTNER_ID, []).expect(200);
      await second.close();
      booted = undefined;
      await boot();
      expect(await bindingsNow()).toEqual([]);
      expect(await auditRows("integration_partner.create")).toHaveLength(1);
    });

    it("refuses to register one of the front-ends in KEYCLOAK_ALLOWED_CLIENTS (409)", async () => {
      const second = await boot("nizam-dev,tedris-dev");
      const nizam = bearerFor({
        sub: ADMIN,
        claims: { azp: "nizam-dev", realm_access: { roles: ["SYSTEM_ADMIN"] } },
      });
      const registerAs = (clientId: string) =>
        request(second.getHttpServer())
          .post("/nizam/partner-applications")
          .set("Authorization", nizam)
          .send({ clientId, name: "Ön yüz" });

      const res = await registerAs("tedris-dev").expect(409);
      expect(res.body).toMatchObject({
        code: "PARTNER_FRONT_END_CLIENT",
        context: { clientId: "tedris-dev" },
      });
      expect(
        await db
          .select()
          .from(integrationPartners)
          .where(eq(integrationPartners.clientId, "tedris-dev"))
      ).toEqual([]);
      await registerAs(OTHER_PARTNER_ID).expect(201);
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
