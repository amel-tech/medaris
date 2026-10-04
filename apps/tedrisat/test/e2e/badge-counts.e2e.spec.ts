import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-183: the numbers behind the nazır portal's menu badges.
 *
 *   GET /madrasahs/:id/badge-counts  — VIEW_MADRASAH_ANALYTICS (the nazır)
 *   GET /courses/:id/badge-counts    — MANAGE_ENROLLMENTS (köşk manager, müderris)
 *
 * Real `AuthGuard` with minted tokens, one identity per role, as in
 * course-team.e2e.spec.ts. Roles are the ones the matrix resolves today: a
 * medrese's nazır is a MEDRESE_BASMUDERRIS row, a course's team a KOSK_NAZIM
 * on its köşk and MUDERRIS rows on the course itself.
 */
const ADMIN_ID = "a1000000-0000-4000-8000-000000000001";
const NAZIR_ID = "a1000000-0000-4000-8000-000000000002";
const OTHER_NAZIR_ID = "a1000000-0000-4000-8000-000000000003";
/** A MEDRESE_NAZIR of the first medrese: a role with no defaults, and no grants here. */
const GRANTLESS_NAZIR_ID = "a1000000-0000-4000-8000-0000000000f1";
const MANAGER_ID = "a1000000-0000-4000-8000-000000000004";
const MUDERRIS_ID = "a1000000-0000-4000-8000-000000000005";
const OTHER_MUDERRIS_ID = "a1000000-0000-4000-8000-000000000006";
const TALEBE_ID = "a1000000-0000-4000-8000-000000000007";
const STRANGER_ID = "a1000000-0000-4000-8000-000000000008";
/** Applicants, one id each so every PENDING row is its own enrollment. */
const APPLICANT_IDS = [1, 2, 3, 4, 5].map(
  (n) => `a1000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`
);

const UNKNOWN_ID = "a1000000-0000-4000-8000-00000000ffff";
const MEETING_URL = "https://meet.example.test/abc";
const HOUR = 60 * 60 * 1000;

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Badge counts (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let koskId: string;
  /** Two pending requests and the live sessions below. */
  let courseA: string;
  /** One pending request, no sessions. */
  let courseB: string;
  /** Hidden: its pending request is nobody's work. */
  let hiddenCourse: string;
  /** In no medrese at all. */
  let looseCourse: string;
  /** Another medrese's course: its pending request is not this one's. */
  let otherMadrasahCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const insertCourse = async (
    title: string,
    values: Partial<typeof courses.$inferInsert> = {}
  ) => {
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: MANAGER_ID,
        title,
        status: CourseStatus.PUBLISHED,
        ...values,
      })
      .returning();
    return course.id;
  };

  const insertWeek = async (courseId: string, archivedAt?: Date) => {
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Hafta", archivedAt })
      .returning();
    return week.id;
  };

  const liveSession = (
    weekId: string,
    title: string,
    scheduledAt: Date,
    values: Partial<typeof lessons.$inferInsert> = {}
  ) =>
    db()
      .insert(lessons)
      .values({
        weekId,
        title,
        type: LessonType.LIVE,
        scheduledAt,
        meetingUrl: null,
        ...values,
      });

  const apply = (
    userId: string,
    courseId: string,
    status = EnrollmentStatus.PENDING
  ) => db().insert(enrollments).values({ userId, courseId, status });

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");

    const [madrasah, other] = await db()
      .insert(madrasahs)
      .values([
        {
          handle: "hadis-ve-siyer",
          name: "Hadis ve Siyer",
          createdBy: ADMIN_ID,
        },
        { handle: "fikih", name: "Fıkıh", createdBy: ADMIN_ID },
      ])
      .returning();
    madrasahId = madrasah.id;
    otherMadrasahId = other.id;
    await assignRole(db(), {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: OTHER_NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: otherMadrasahId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: GRANTLESS_NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: NAZIR_ID,
    });

    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Hadis Köşkü" })
      .returning();
    koskId = kosk.id;
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });

    courseA = await insertCourse("A", { madrasahId });
    courseB = await insertCourse("B", { madrasahId });
    hiddenCourse = await insertCourse("Gizli", {
      madrasahId,
      archivedAt: new Date(),
      archivedBy: MANAGER_ID,
    });
    looseCourse = await insertCourse("Medresesiz");
    otherMadrasahCourse = await insertCourse("Başka medrese", {
      madrasahId: otherMadrasahId,
    });
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseA,
    });
    await assignRole(db(), {
      userId: OTHER_MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseB,
    });

    // Pending requests: 2 on A, 1 on B — and three that must not be counted.
    await apply(APPLICANT_IDS[0], courseA);
    await apply(APPLICANT_IDS[1], courseA);
    await apply(APPLICANT_IDS[2], courseB);
    await apply(APPLICANT_IDS[3], hiddenCourse);
    await apply(APPLICANT_IDS[4], looseCourse);
    await apply(APPLICANT_IDS[0], otherMadrasahCourse);
    await apply(TALEBE_ID, courseA, EnrollmentStatus.ENROLLED);

    // Course A's programme. Only the first two miss a link that still matters.
    const now = Date.now();
    const ahead = new Date(now + 48 * HOUR);
    const week = await insertWeek(courseA);
    await liveSession(week, "Bağlantısız", ahead);
    await liveSession(week, "Boşluklu bağlantı", ahead, { meetingUrl: "   " });
    await liveSession(week, "Bağlantılı", ahead, { meetingUrl: MEETING_URL });
    await liveSession(week, "İptal", ahead, { cancelledAt: new Date() });
    await liveSession(week, "Gizli ders", ahead, { archivedAt: new Date() });
    await liveSession(week, "Geçmiş", new Date(now - 48 * HOUR));
    await liveSession(week, "Video", ahead, { type: LessonType.VIDEO });
    await liveSession(
      await insertWeek(courseA, new Date()),
      "Gizli hafta",
      ahead
    );
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    await app.close();
  });

  describe("GET /madrasahs/:id/badge-counts", () => {
    const get = (id: string, sub?: string) => {
      const req = http().get(`/madrasahs/${id}/badge-counts`);
      return sub ? req.set("Authorization", auth(sub)) : req;
    };

    it("counts the pending requests of the medrese's visible courses and the courses holding one", async () => {
      const res = await get(madrasahId, NAZIR_ID).expect(200);
      expect(res.body).toEqual({
        pendingApplications: 3,
        coursesWithPendingApplications: 2,
      });
    });

    it("answers zeros for a medrese with no requests", async () => {
      await db().delete(enrollments);
      const res = await get(madrasahId, NAZIR_ID).expect(200);
      expect(res.body).toEqual({
        pendingApplications: 0,
        coursesWithPendingApplications: 0,
      });
    });

    it("counts another medrese's requests for that medrese only", async () => {
      const res = await get(otherMadrasahId, OTHER_NAZIR_ID).expect(200);
      expect(res.body).toEqual({
        pendingApplications: 1,
        coursesWithPendingApplications: 1,
      });
    });

    it("is open to SYSTEM_ADMIN", async () => {
      await get(madrasahId, ADMIN_ID).expect(200);
    });

    it.each([
      ["a nazır of another medrese", OTHER_NAZIR_ID],
      ["a köşk manager", MANAGER_ID],
      ["a müderris", MUDERRIS_ID],
      ["a stranger", STRANGER_ID],
    ])("refuses %s with 403", async (_who, sub) => {
      await get(madrasahId, sub).expect(403);
    });

    it("refuses a caller with no token with 401", async () => {
      await get(madrasahId).expect(401);
    });

    it("answers an unknown or malformed id with 404, not 403", async () => {
      await get(UNKNOWN_ID, STRANGER_ID).expect(404);
      await get("not-a-uuid", STRANGER_ID).expect(404);
      await get(UNKNOWN_ID, ADMIN_ID).expect(404);
    });
  });

  describe("GET /courses/:id/badge-counts", () => {
    const get = (id: string, sub?: string) => {
      const req = http().get(`/courses/${id}/badge-counts`);
      return sub ? req.set("Authorization", auth(sub)) : req;
    };

    it("counts the sessions still waiting for a link and the pending requests", async () => {
      const res = await get(courseA, MANAGER_ID).expect(200);
      expect(res.body).toEqual({
        missingMeetingLinks: 2,
        pendingApplications: 2,
      });
    });

    it("answers a course with no sessions and one request", async () => {
      const res = await get(courseB, MANAGER_ID).expect(200);
      expect(res.body).toEqual({
        missingMeetingLinks: 0,
        pendingApplications: 1,
      });
    });

    it("stops counting a session once it has a link", async () => {
      await db()
        .update(lessons)
        .set({ meetingUrl: MEETING_URL })
        .where(eq(lessons.type, LessonType.LIVE));
      const res = await get(courseA, MANAGER_ID).expect(200);
      expect(res.body.missingMeetingLinks).toBe(0);
    });

    it("is open to the course's müderris and to SYSTEM_ADMIN", async () => {
      await get(courseA, MUDERRIS_ID).expect(200);
      await get(courseA, ADMIN_ID).expect(200);
    });

    // MDRS-135 §3: a başmüderris holds every course-scoped permission in their
    // medrese's courses. Before the catalogue a medrese's head had no authority
    // over a course (PRD §4.1); the medrese's nazırs still have none by role.
    it("is open to the başmüderris of the medrese the course is held for", async () => {
      await get(courseA, NAZIR_ID).expect(200);
    });

    it("counts a hidden course for the people who may restore it", async () => {
      const res = await get(hiddenCourse, MANAGER_ID).expect(200);
      expect(res.body.pendingApplications).toBe(1);
    });

    it.each([
      ["the müderris of another course", OTHER_MUDERRIS_ID],
      ["an enrolled talebe", TALEBE_ID],
      ["a talebe whose request is pending", APPLICANT_IDS[0]],
      ["a stranger", STRANGER_ID],
      ["a nazır of the medrese with no grants", GRANTLESS_NAZIR_ID],
      ["the başmüderris of another medrese", OTHER_NAZIR_ID],
    ])("refuses %s with 403", async (_who, sub) => {
      await get(courseA, sub).expect(403);
    });

    it("refuses a caller with no token with 401", async () => {
      await get(courseA).expect(401);
    });

    it("answers an unknown or malformed id with 404, not 403", async () => {
      await get(UNKNOWN_ID, STRANGER_ID).expect(404);
      await get("not-a-uuid", STRANGER_ID).expect(404);
      await get(UNKNOWN_ID, ADMIN_ID).expect(404);
    });
  });
});
