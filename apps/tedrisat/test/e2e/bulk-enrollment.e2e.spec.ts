import { INestApplication } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import request from "supertest";
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
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import {
  KEYCLOAK_ADMIN_FETCH,
  KeycloakAdminService,
} from "../../src/keycloak-admin/keycloak-admin.service";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * "Toplu talebe ekle" (owner, 2026-10-12): `POST /courses/:id/enrollments/bulk`
 * against a real Postgres and the real guard. Only the realm's directory is
 * replaced: a fetch that answers the exact-e-mail search from `REALM`, counts
 * the searches and how many run at once, and fails for `blip@example.com`.
 */
const NAZIM = "b0000000-0000-4000-8000-000000000001";
const MUDERRIS = "b0000000-0000-4000-8000-000000000002";
const OTHER_MUDERRIS = "b0000000-0000-4000-8000-000000000003";
const TALEBE = "b0000000-0000-4000-8000-000000000004";
const NEWCOMER = "b0000000-0000-4000-8000-000000000011";
const WAITING = "b0000000-0000-4000-8000-000000000012";
const SEATED = "b0000000-0000-4000-8000-000000000013";
const REMOVED = "b0000000-0000-4000-8000-000000000014";
const FINISHED = "b0000000-0000-4000-8000-000000000015";
const BARRED = "b0000000-0000-4000-8000-000000000016";
const DISABLED = "b0000000-0000-4000-8000-000000000017";

/** The realm's accounts, by address. */
const REALM: Record<
  string,
  { id: string; firstName?: string; lastName?: string; enabled?: boolean }
> = {
  "yeni@example.com": { id: NEWCOMER, firstName: "Yeni", lastName: "Talebe" },
  "bekleyen@example.com": { id: WAITING, firstName: "Bekleyen" },
  "kayitli@example.com": { id: SEATED, firstName: "Kayıtlı" },
  "cikarilan@example.com": { id: REMOVED, firstName: "Çıkarılan" },
  "bitiren@example.com": { id: FINISHED, firstName: "Bitiren" },
  "yasakli@example.com": { id: BARRED, firstName: "Yasaklı" },
  "kapali@example.com": { id: DISABLED, firstName: "Kapalı", enabled: false },
};

const realm = { searches: 0, inFlight: 0, mostInFlight: 0 };

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
  if (url.pathname === "/admin/realms/r/users") {
    realm.searches++;
    realm.inFlight++;
    realm.mostInFlight = Math.max(realm.mostInFlight, realm.inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const email = url.searchParams.get("email") ?? "";
      if (url.searchParams.get("exact") !== "true") return json([], 400);
      if (email === "blip@example.com") return json({}, 500);
      const account = REALM[email];
      return json(
        account
          ? [
              {
                id: account.id,
                email,
                firstName: account.firstName,
                lastName: account.lastName,
                enabled: account.enabled ?? true,
              },
            ]
          : []
      );
    } finally {
      realm.inFlight--;
    }
  }
  return json({}, 404);
}

describe("Toplu talebe ekle (e2e)", () => {
  let app: INestApplication;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let configured = true;
  let koskId: string;
  let courseId: string;
  let otherCourseId: string;

  const bulk = (id: string, emails: unknown, sub: string) =>
    request(app.getHttpServer())
      .post(`/courses/${id}/enrollments/bulk`)
      .set("Authorization", bearerFor({ sub }))
      .send({ emails });

  const seatOf = async (userId: string, course = courseId) =>
    (
      await db
        .select()
        .from(enrollments)
        .where(
          and(eq(enrollments.userId, userId), eq(enrollments.courseId, course))
        )
    )[0] ?? null;
  const bulkAudit = () =>
    db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "enrollment.bulk_add"))
      .orderBy(asc(auditLog.seq));
  const seatCount = async () =>
    (await db.select().from(enrollments)).filter(
      (row) => row.courseId === courseId
    ).length;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
    });
    const databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
    const config = (
      app.get(KeycloakAdminService) as unknown as {
        config: { get: (k: string) => unknown };
      }
    ).config;
    const original = config.get.bind(config);
    config.get = (key: string) =>
      key === "keycloak.admin"
        ? configured
          ? {
              adminUrl: "http://kc.test/admin/realms/r",
              tokenUrl: "http://kc.test/realms/r/protocol/openid-connect/token",
              clientId: "tedrisat-admin",
              clientSecret: "s",
            }
          : null
        : original(key);
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
    configured = true;
    Object.assign(realm, { searches: 0, inFlight: 0, mostInFlight: 0 });
    const [kosk] = await db
      .insert(kosks)
      .values({ ownerId: NAZIM, name: "Örnek Köşk" })
      .returning();
    koskId = kosk.id;
    const rows = await db
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM,
          title: "Sarf",
          status: CourseStatus.PUBLISHED,
          requiresApproval: true,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Nahiv",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    [courseId, otherCourseId] = rows.map((r) => r.id);
    await assignRole(db, {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    for (const [userId, id] of [
      [MUDERRIS, courseId],
      [OTHER_MUDERRIS, otherCourseId],
    ]) {
      await assignRole(db, {
        userId,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: id,
        grantedBy: NAZIM,
      });
      await db
        .insert(courseMuderris)
        .values({ courseId: id, userId, name: "Müderris", orderIndex: 0 });
    }
    const row = (userId: string, status: EnrollmentStatus) => ({
      userId,
      courseId,
      status,
      studentName: "Önceki ad",
      studentEmail: "onceki@example.com",
    });
    await db
      .insert(enrollments)
      .values([
        row(WAITING, EnrollmentStatus.PENDING),
        row(SEATED, EnrollmentStatus.ENROLLED),
        row(REMOVED, EnrollmentStatus.REVOKED),
        row(FINISHED, EnrollmentStatus.COMPLETED),
        row(BARRED, EnrollmentStatus.PENDING),
      ]);
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
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("each address", () => {
    it("is enrolled, approved, already there, not found, invalid or skipped with its reason, in the order given", async () => {
      const res = await bulk(
        courseId,
        [
          "  Yeni@Example.com ",
          "bekleyen@example.com",
          "",
          "kayitli@example.com",
          "cikarilan@example.com",
          "bitiren@example.com",
          "yasakli@example.com",
          "kapali@example.com",
          "kimse@example.com",
          "adres-degil",
          "YENI@example.com",
          "adres-degil",
        ],
        MUDERRIS
      ).expect(200);

      expect(res.body).toEqual({
        enrolled: ["yeni@example.com"],
        approved: ["bekleyen@example.com"],
        already: ["kayitli@example.com"],
        notFound: ["kapali@example.com", "kimse@example.com"],
        invalid: ["adres-degil"],
        skipped: [
          { email: "cikarilan@example.com", reason: "revoked" },
          { email: "bitiren@example.com", reason: "COMPLETED" },
          { email: "yasakli@example.com", reason: "barred" },
        ],
      });
      // Each valid address once; the invalid one never.
      expect(realm.searches).toBe(8);
    });

    it("gives a newcomer an ENROLLED seat in their realm name, whatever the course's approval rule", async () => {
      await bulk(courseId, ["yeni@example.com"], MUDERRIS).expect(200);
      expect(await seatOf(NEWCOMER)).toMatchObject({
        status: EnrollmentStatus.ENROLLED,
        studentName: "Yeni Talebe",
        studentEmail: "yeni@example.com",
      });
    });

    it("approves a waiting request as the approve route does, telling the talebe", async () => {
      await bulk(courseId, ["bekleyen@example.com"], MUDERRIS).expect(200);
      expect((await seatOf(WAITING))?.status).toBe(EnrollmentStatus.ENROLLED);
      const told = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, WAITING));
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        type: "ENROLLMENT_APPROVED",
        targetType: "COURSE",
        targetId: courseId,
      });
    });

    it("leaves a removed seat, a completion and a barred person's request as they were", async () => {
      await bulk(
        courseId,
        ["cikarilan@example.com", "bitiren@example.com", "yasakli@example.com"],
        MUDERRIS
      ).expect(200);
      expect((await seatOf(REMOVED))?.status).toBe(EnrollmentStatus.REVOKED);
      expect((await seatOf(FINISHED))?.status).toBe(EnrollmentStatus.COMPLETED);
      expect((await seatOf(BARRED))?.status).toBe(EnrollmentStatus.PENDING);
      expect(await db.select().from(notifications)).toEqual([]);
    });

    it("gives no seat to a disabled account or an address nobody has", async () => {
      await bulk(
        courseId,
        ["kapali@example.com", "kimse@example.com"],
        MUDERRIS
      ).expect(200);
      expect(await seatOf(DISABLED)).toBeNull();
      expect(await seatCount()).toBe(5);
    });

    it("looks the addresses up at most five at a time", async () => {
      const emails = Array.from(
        { length: 30 },
        (_, i) => `kisi${i}@example.com`
      );
      const res = await bulk(courseId, emails, MUDERRIS).expect(200);
      expect(res.body.notFound).toEqual(emails);
      expect(realm.searches).toBe(30);
      expect(realm.mostInFlight).toBe(5);
    });

    it("does nothing new when the same list is sent again", async () => {
      await bulk(courseId, ["yeni@example.com"], MUDERRIS).expect(200);
      const again = await bulk(courseId, ["yeni@example.com"], MUDERRIS).expect(
        200
      );
      expect(again.body.enrolled).toEqual([]);
      expect(again.body.already).toEqual(["yeni@example.com"]);
    });
  });

  describe("the audit log", () => {
    it("holds one entry for the bulk add: actor, course, counts and the accounts enrolled or approved", async () => {
      await bulk(
        courseId,
        [
          "yeni@example.com",
          "bekleyen@example.com",
          "kayitli@example.com",
          "kimse@example.com",
          "adres-degil",
          "yasakli@example.com",
        ],
        MUDERRIS
      ).expect(200);
      const rows = await bulkAudit();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: MUDERRIS,
        entity: "course",
        entityId: courseId,
        details: {
          counts: {
            submitted: 6,
            enrolled: 1,
            approved: 1,
            already: 1,
            notFound: 1,
            invalid: 1,
            skipped: 1,
          },
          enrolledUserIds: [NEWCOMER],
          approvedUserIds: [WAITING],
        },
      });
    });
  });

  describe("who may call", () => {
    it("lets the course's müderris and the köşk nazımı in", async () => {
      await bulk(courseId, ["yeni@example.com"], NAZIM).expect(200);
      expect((await seatOf(NEWCOMER))?.status).toBe(EnrollmentStatus.ENROLLED);
      await bulk(courseId, ["bekleyen@example.com"], MUDERRIS).expect(200);
      expect((await bulkAudit()).map((row) => row.actorId)).toEqual([
        NAZIM,
        MUDERRIS,
      ]);
    });

    it("refuses a talebe and the müderris of another course, and writes nothing", async () => {
      for (const sub of [TALEBE, OTHER_MUDERRIS, NEWCOMER]) {
        const res = await bulk(courseId, ["yeni@example.com"], sub).expect(403);
        expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      }
      expect(await seatOf(NEWCOMER)).toBeNull();
      expect(realm.searches).toBe(0);
      expect(await bulkAudit()).toEqual([]);
    });
  });

  describe("the list", () => {
    it("takes 500 entries and refuses 501, repeats counted as sent", async () => {
      const five = Array.from({ length: 500 }, (_, i) => `adres-${i}`);
      const ok = await bulk(courseId, five, MUDERRIS).expect(200);
      expect(ok.body.invalid).toHaveLength(500);

      const res = await bulk(
        courseId,
        Array.from({ length: 501 }, () => "yeni@example.com"),
        MUDERRIS
      ).expect(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await seatOf(NEWCOMER)).toBeNull();
      expect(realm.searches).toBe(0);
    });

    it("refuses a body without a list of strings", async () => {
      for (const emails of [undefined, "yeni@example.com", [1, 2]]) {
        const res = await bulk(courseId, emails, MUDERRIS).expect(400);
        expect(res.body.code).toBe("VALIDATION_ERROR");
      }
      expect(realm.searches).toBe(0);
    });
  });

  describe("a course that cannot take enrollments", () => {
    const refused = async (sub: string) => {
      const res = await bulk(courseId, ["yeni@example.com"], sub).expect(404);
      expect(res.body.code).toBe("COURSE_NOT_FOUND");
      expect(await seatOf(NEWCOMER)).toBeNull();
      expect(realm.searches).toBe(0);
      expect(await bulkAudit()).toEqual([]);
    };

    it("refuses the whole list for a draft, even for the team who may see it", async () => {
      await db
        .update(courses)
        .set({ status: CourseStatus.DRAFT })
        .where(eq(courses.id, courseId));
      await refused(MUDERRIS);
      await refused(NAZIM);
    });

    it("refuses it for a hidden course, even for the köşk nazımı who may restore it", async () => {
      await db
        .update(courses)
        .set({ archivedAt: new Date(), archivedBy: NAZIM })
        .where(eq(courses.id, courseId));
      await refused(MUDERRIS);
      await refused(NAZIM);
    });

    it("refuses it for a course of a hidden köşk", async () => {
      await db
        .update(kosks)
        .set({ archivedAt: new Date(), archivedBy: NAZIM })
        .where(eq(kosks.id, koskId));
      await refused(MUDERRIS);
      await refused(NAZIM);
    });

    it("answers 404 for a course that is not there", async () => {
      const res = await bulk(
        "b0000000-0000-4000-8000-0000000000ff",
        ["yeni@example.com"],
        NAZIM
      ).expect(404);
      expect(res.body.code).toBe("COURSE_NOT_FOUND");
    });
  });

  describe("the realm's directory", () => {
    it("refuses with 503 when it is not configured", async () => {
      configured = false;
      const res = await bulk(courseId, ["yeni@example.com"], MUDERRIS).expect(
        503
      );
      expect(res.body.code).toBe("KEYCLOAK_ADMIN_NOT_CONFIGURED");
      expect(await seatOf(NEWCOMER)).toBeNull();
      expect(await bulkAudit()).toEqual([]);
    });

    it("refuses with 503, and enrols nobody, when it stops answering half-way", async () => {
      const res = await bulk(
        courseId,
        ["yeni@example.com", "blip@example.com", "bekleyen@example.com"],
        MUDERRIS
      ).expect(503);
      expect(res.body.code).toBe("KEYCLOAK_ADMIN_UNAVAILABLE");
      expect(await seatOf(NEWCOMER)).toBeNull();
      expect((await seatOf(WAITING))?.status).toBe(EnrollmentStatus.PENDING);
      expect(await bulkAudit()).toEqual([]);
    });
  });
});
