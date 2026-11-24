import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { ROSTER_READ_ACTION } from "../../src/course/domain/course-content";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../../src/course/domain/recording";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  enrollments,
  lessonRecordings,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
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
 * MDRS-211: the köşk-wide Celseler, Talebeler and Ders kayıtları of Nizam's
 * köşk menu. Each lists across every course of one köşk, answers only that
 * köşk's management, hands out no meeting link and no recording address, and
 * the talebe list goes on the record. Real Postgres, real guard, minted
 * tokens.
 */
const ADMIN_ID = "c2110000-0000-4000-8000-000000000001";
const NAZIM_ID = "c2110000-0000-4000-8000-000000000002";
const OTHER_NAZIM_ID = "c2110000-0000-4000-8000-000000000003";
const MEDARIS_ID = "c2110000-0000-4000-8000-000000000004";
const GONE_ID = "c2110000-0000-4000-8000-000000000005";
const S1 = "c2110000-0000-4000-8000-000000000011";
const S2 = "c2110000-0000-4000-8000-000000000012";
const S3 = "c2110000-0000-4000-8000-000000000013";
const S4 = "c2110000-0000-4000-8000-000000000014";
const S5 = "c2110000-0000-4000-8000-000000000015";

const LINK = "https://meet.google.com/aaa-bbbb-ccc";
const RECORDING_URL = "https://drive.google.com/file/d/abc/view";
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("The köşk-wide lists (MDRS-211, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let emptyKoskId: string;
  let binaId: string;
  let emsileId: string;
  let passiveId: string;

  const db = () => databaseService.db;
  const get = (path: string, sub: string) =>
    request(app.getHttpServer()).get(path).set("Authorization", auth(sub));
  const list = (what: string, sub = NAZIM_ID, query = "", kosk = koskId) =>
    get(`/kosks/${kosk}/${what}${query}`, sub);

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "audit_log",
      "users"
    );
    await db()
      .insert(users)
      .values([
        { id: ADMIN_ID },
        { id: NAZIM_ID },
        { id: OTHER_NAZIM_ID },
        { id: MEDARIS_ID },
        { id: GONE_ID },
        {
          id: S1,
          givenName: "Rümeysa Nur",
          familyName: "Karaca",
          email: "rumeysa@example.com",
        },
      ]);
    const [kosk, empty] = await db()
      .insert(kosks)
      .values([
        { ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" },
        { ownerId: OTHER_NAZIM_ID, name: "Fatih Köşkü" },
      ])
      .returning({ id: kosks.id });
    koskId = kosk.id;
    emptyKoskId = empty.id;
    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: OTHER_NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: emptyKoskId,
      grantedBy: ADMIN_ID,
    });
    await db().insert(roleAssignments).values({
      userId: MEDARIS_ID,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN_ID,
    });

    const course = async (title: string, status = CourseStatus.PUBLISHED) => {
      const [row] = await db()
        .insert(courses)
        .values({ koskId, authorId: NAZIM_ID, title, status })
        .returning({ id: courses.id });
      return row.id;
    };
    const week = async (courseId: string, weekNumber: number) => {
      const [row] = await db()
        .insert(courseWeeks)
        .values({ courseId, weekNumber, title: `Hafta ${weekNumber} konusu` })
        .returning({ id: courseWeeks.id });
      return row.id;
    };
    const session = async (
      weekId: string,
      title: string,
      at: number,
      over: Partial<typeof lessons.$inferInsert> = {}
    ) => {
      const [row] = await db()
        .insert(lessons)
        .values({
          weekId,
          title,
          type: LessonType.LIVE,
          scheduledAt: new Date(Date.now() + at),
          durationMinutes: 60,
          meetingUrl: LINK,
          ...over,
        })
        .returning({ id: lessons.id });
      return row.id;
    };

    binaId = await course("Bina");
    emsileId = await course("Emsile");
    passiveId = await course("Maksud");
    const draftId = await course("Taslak ders", CourseStatus.DRAFT);

    const binaWeek1 = await week(binaId, 1);
    const binaWeek2 = await week(binaId, 2);
    const emsileWeek = await week(emsileId, 1);
    const passiveWeek = await week(passiveId, 1);
    const draftWeek = await week(draftId, 1);

    const binaPast = await session(binaWeek1, "Bina: geçen celse", -2 * DAY);
    await session(binaWeek2, "Bina: süren celse", -20 * 60 * 1000);
    await session(binaWeek2, "Bina: yarınki celse", DAY);
    await session(binaWeek2, "Bina: iptal edilen celse", 2 * DAY, {
      cancelledAt: new Date(),
      cancelReason: "Hoca rahatsız.",
    });
    const emsilePast = await session(emsileWeek, "Emsile: ilk celse", -5 * DAY);
    await session(emsileWeek, "Emsile: uzak celse", 20 * DAY);
    await session(passiveWeek, "Maksud: celse", 3 * DAY);
    await session(draftWeek, "Taslak: celse", DAY);
    // Not a live session: it is no celse.
    await db()
      .insert(lessons)
      .values({ weekId: binaWeek1, title: "Okuma", type: LessonType.DOCUMENT });

    await db()
      .insert(lessonRecordings)
      .values([
        {
          lessonId: binaPast,
          title: "Bina: celse kaydı",
          provider: RecordingProvider.DRIVE,
          url: RECORDING_URL,
          durationMinutes: 58,
          visibility: RecordingVisibility.PUBLIC,
          status: RecordingStatus.READY,
        },
        {
          lessonId: emsilePast,
          title: "Emsile: celse kaydı",
          provider: RecordingProvider.YOUTUBE,
          url: "https://youtu.be/abc",
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.READY,
        },
      ]);

    const seat = (
      userId: string,
      courseId: string,
      status: EnrollmentStatus,
      createdAt: string,
      name?: string
    ) => ({
      userId,
      courseId,
      status,
      createdAt: new Date(createdAt),
      studentName: name ?? null,
      studentEmail: name ? `${userId.slice(-2)}@example.com` : null,
    });
    await db()
      .insert(enrollments)
      .values([
        seat(S1, binaId, EnrollmentStatus.ENROLLED, "2026-09-01T10:00:00Z"),
        seat(S1, emsileId, EnrollmentStatus.COMPLETED, "2026-09-05T10:00:00Z"),
        seat(
          S2,
          binaId,
          EnrollmentStatus.ENROLLED,
          "2026-09-10T10:00:00Z",
          "Bilal Hamza Yurtsever"
        ),
        seat(
          S3,
          emsileId,
          EnrollmentStatus.PENDING,
          "2026-09-11T10:00:00Z",
          "Bekleyen Talebe"
        ),
        seat(
          S4,
          binaId,
          EnrollmentStatus.REVOKED,
          "2026-09-12T10:00:00Z",
          "Çıkarılan Talebe"
        ),
        seat(
          S5,
          passiveId,
          EnrollmentStatus.ENROLLED,
          "2026-09-13T10:00:00Z",
          "Pasif Dersin Talebesi"
        ),
      ]);

    // Maksud's müderris has gone: the course is in a passive scope (MDRS-136).
    await db().insert(roleAssignments).values({
      userId: GONE_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeType: SCOPE_TYPES.COURSE,
      scopeId: passiveId,
      grantedBy: NAZIM_ID,
      revokedAt: new Date(),
      revokedBy: NAZIM_ID,
    });
  });

  const grantMedaris = (permission: string) =>
    db().insert(permissionGrants).values({
      userId: MEDARIS_ID,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      permission,
      grantedBy: ADMIN_ID,
    });

  describe("GET /kosks/:id/sessions (Celseler)", () => {
    it("lists every course's sessions that are not over, soonest first, the cancelled one marked", async () => {
      const { body } = await list("sessions").expect(200);
      expect(body.items.map((s: { title: string }) => s.title)).toEqual([
        "Bina: süren celse",
        "Bina: yarınki celse",
        "Bina: iptal edilen celse",
        "Maksud: celse",
        "Emsile: uzak celse",
      ]);
      expect(body).toMatchObject({
        total: 5,
        page: 1,
        limit: 20,
        upcomingCount: 5,
        pastCount: 2,
      });
      expect(body.items[0]).toMatchObject({
        courseId: binaId,
        courseTitle: "Bina",
        weekNumber: 2,
        durationMinutes: 60,
        cancelled: false,
        inPerson: false,
        madrasahName: null,
      });
      expect(body.items[2].cancelled).toBe(true);
    });

    it("lists the ones that are over, latest first, a page at a time", async () => {
      const first = await list("sessions", NAZIM_ID, "?tab=PAST&limit=1");
      expect(first.status).toBe(200);
      expect(first.body.items.map((s: { title: string }) => s.title)).toEqual([
        "Bina: geçen celse",
      ]);
      expect(first.body).toMatchObject({ total: 2, page: 1, limit: 1 });
      const second = await list(
        "sessions",
        NAZIM_ID,
        "?tab=PAST&limit=1&page=2"
      ).expect(200);
      expect(second.body.items.map((s: { title: string }) => s.title)).toEqual([
        "Emsile: ilk celse",
      ]);
    });

    it("hands out no meeting link", async () => {
      const { text } = await list("sessions").expect(200);
      expect(text).not.toContain("meet.google.com");
      expect(text).not.toContain("meetingUrl");
    });

    it("refuses a tab that is none", async () => {
      await list("sessions", NAZIM_ID, "?tab=CANCELLED").expect(400);
    });
  });

  describe("GET /kosks/:id/students (Talebeler)", () => {
    it("lists a row a person with all of their courses, newest first, and how many applications wait", async () => {
      const { body } = await list("students").expect(200);
      expect(body).toMatchObject({
        total: 3,
        page: 1,
        limit: 20,
        pendingCount: 1,
      });
      expect(body.items.map((s: { userId: string }) => s.userId)).toEqual([
        S5,
        S2,
        S1,
      ]);
      expect(body.items[2]).toMatchObject({
        userId: S1,
        name: "Rümeysa Nur Karaca",
        email: "rumeysa@example.com",
        courses: [
          { id: binaId, title: "Bina", status: "ENROLLED" },
          { id: emsileId, title: "Emsile", status: "COMPLETED" },
        ],
      });
      expect(new Date(body.items[2].firstEnrolledAt).toISOString()).toBe(
        "2026-09-01T10:00:00.000Z"
      );
      // Neither the one who waits nor the one taken out is a talebe.
      expect(JSON.stringify(body)).not.toContain("Bekleyen Talebe");
      expect(JSON.stringify(body)).not.toContain("Çıkarılan Talebe");
    });

    it("searches by name or e-mail address, and pages", async () => {
      const byName = await list("students", NAZIM_ID, "?q=bilal").expect(200);
      expect(
        byName.body.items.map((s: { userId: string }) => s.userId)
      ).toEqual([S2]);
      expect(byName.body.total).toBe(1);
      const byMail = await list(
        "students",
        NAZIM_ID,
        "?q=rumeysa@example"
      ).expect(200);
      expect(
        byMail.body.items.map((s: { userId: string }) => s.userId)
      ).toEqual([S1]);
      const paged = await list("students", NAZIM_ID, "?limit=1&page=2").expect(
        200
      );
      expect(paged.body.items.map((s: { userId: string }) => s.userId)).toEqual(
        [S2]
      );
      expect(paged.body.total).toBe(3);
      // A wildcard is a letter here, not a pattern.
      const literal = await list("students", NAZIM_ID, "?q=%25").expect(200);
      expect(literal.body.total).toBe(0);
    });

    it("writes every read to the record as a roster read on the köşk", async () => {
      await list("students").expect(200);
      const rows = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, ROSTER_READ_ACTION));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: NAZIM_ID,
        entity: "kosk",
        entityId: koskId,
      });
      expect(rows[0].details).toMatchObject({
        via: "kosk-students",
        systemAdmin: false,
        permission: PERMISSIONS.KOSK_MANAGE,
      });
      expect(
        [...(rows[0].details as { courseIds: string[] }).courseIds].sort()
      ).toEqual([binaId, emsileId, passiveId].sort());
    });

    it("is not opened by platform.kosk_edit, which opens no personal data", async () => {
      await grantMedaris(PERMISSIONS.PLATFORM_KOSK_EDIT);
      await list("students", MEDARIS_ID).expect(403);
      await list("sessions", MEDARIS_ID).expect(200);
      await list("recordings", MEDARIS_ID).expect(200);
    });
  });

  describe("GET /kosks/:id/recordings (Ders kayıtları)", () => {
    it("lists every course's ders kayıtları by course, with week, session and state, and no address", async () => {
      const res = await list("recordings").expect(200);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 20 });
      expect(res.body.items).toMatchObject([
        {
          title: "Bina: celse kaydı",
          courseId: binaId,
          courseTitle: "Bina",
          weekNumber: 1,
          weekTitle: "Hafta 1 konusu",
          durationMinutes: 58,
          provider: "DRIVE",
          status: "READY",
          visibility: "PUBLIC",
        },
        {
          title: "Emsile: celse kaydı",
          courseId: emsileId,
          provider: "YOUTUBE",
          visibility: "ENROLLED",
        },
      ]);
      expect(res.body.items[0].sessionAt).toEqual(expect.any(String));
      expect(res.text).not.toContain("drive.google.com");
      expect(res.text).not.toContain("youtu.be");
      expect(res.text).not.toContain('"url"');
    });

    it("pages", async () => {
      const { body } = await list(
        "recordings",
        NAZIM_ID,
        "?limit=1&page=2"
      ).expect(200);
      expect(body.items.map((r: { title: string }) => r.title)).toEqual([
        "Emsile: celse kaydı",
      ]);
      expect(body.total).toBe(2);
    });
  });

  describe("who is answered", () => {
    const LISTS = ["sessions", "students", "recordings"] as const;

    it("answers the köşk's nazım and the başnazım, and refuses another köşk's nazım, a stranger and no token", async () => {
      for (const what of LISTS) {
        await list(what, NAZIM_ID).expect(200);
        await list(what, ADMIN_ID).expect(200);
        await list(what, OTHER_NAZIM_ID).expect(403);
        await list(what, S1).expect(403);
        await list(what, MEDARIS_ID).expect(403);
        await request(app.getHttpServer())
          .get(`/kosks/${koskId}/${what}`)
          .expect(401);
        await list(
          what,
          ADMIN_ID,
          "",
          "c2110000-0000-4000-8000-0000000000ff"
        ).expect(404);
      }
    });

    it("answers an empty köşk with empty lists", async () => {
      const sessions = await list(
        "sessions",
        OTHER_NAZIM_ID,
        "",
        emptyKoskId
      ).expect(200);
      expect(sessions.body).toMatchObject({
        items: [],
        total: 0,
        upcomingCount: 0,
        pastCount: 0,
      });
      const students = await list(
        "students",
        OTHER_NAZIM_ID,
        "",
        emptyKoskId
      ).expect(200);
      expect(students.body).toMatchObject({
        items: [],
        total: 0,
        pendingCount: 0,
      });
      const recordings = await list(
        "recordings",
        OTHER_NAZIM_ID,
        "",
        emptyKoskId
      ).expect(200);
      expect(recordings.body).toMatchObject({ items: [], total: 0 });
    });

    it("leaves a course in a passive scope out for a platform.kosk_edit holder, and in for the köşk's nazım", async () => {
      await grantMedaris(PERMISSIONS.PLATFORM_KOSK_EDIT);
      const locked = await list("sessions", MEDARIS_ID).expect(200);
      expect(
        locked.body.items.map((s: { courseId: string }) => s.courseId)
      ).not.toContain(passiveId);
      expect(locked.body.upcomingCount).toBe(4);
      const own = await list("sessions", NAZIM_ID).expect(200);
      expect(
        own.body.items.map((s: { courseId: string }) => s.courseId)
      ).toContain(passiveId);
    });
  });
});
