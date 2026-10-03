import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
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
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
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
 * MDRS-187, nazir/10 and nazir/01: the medrese's talebe list and the Pano's
 * one read, against a real Postgres. Real `AuthGuard` with minted tokens; the
 * medrese's başmüderris (MEDRESE_BASMUDERRIS) is the only medrese-side role the
 * matrix resolves, so a MEDRESE_NAZIR is refused like a stranger.
 */
const ADMIN_ID = "e8000000-0000-4000-8000-000000000001";
const HEAD_ID = "e8000000-0000-4000-8000-000000000002";
const TEACHING_HEAD_ID = "e8000000-0000-4000-8000-000000000003";
const NAZIR_ID = "e8000000-0000-4000-8000-000000000004";
const OTHER_HEAD_ID = "e8000000-0000-4000-8000-000000000005";
const MANAGER_ID = "e8000000-0000-4000-8000-000000000006";
const STRANGER_ID = "e8000000-0000-4000-8000-000000000007";
const ANOTHER_NAZIR_ID = "e8000000-0000-4000-8000-000000000008";
const REVOKED_NAZIR_ID = "e8000000-0000-4000-8000-000000000009";
const MISSING_ID = "e8000000-0000-4000-8000-00000000ffff";
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const talebe = (n: number) =>
  `e8000000-0000-4000-8000-${(0x1000 + n).toString(16).padStart(12, "0")}`;

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Medrese talebe list and Pano (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let nuruId: string;
  let fatihId: string;
  let binaId: string;
  let mantikId: string;
  let draftId: string;
  let hiddenId: string;
  let foreignId: string;
  let ownId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (sub: string, path: string, id = madrasahId) =>
    http().get(`/madrasahs/${id}${path}`).set("Authorization", auth(sub));
  const students = (query = "", sub = HEAD_ID) => get(sub, `/students${query}`);
  const dashboard = (sub = HEAD_ID) => get(sub, "/dashboard");

  const seat = (
    n: number,
    courseId: string,
    over: Partial<typeof enrollments.$inferInsert> = {}
  ) => ({
    userId: talebe(n),
    courseId,
    studentName: `Talebe ${n}`,
    studentEmail: `talebe${n}@example.com`,
    createdAt: daysAgo(30 - n),
    ...over,
  });

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
    const [nuru, fatih] = await db()
      .insert(kosks)
      .values([
        {
          ownerId: MANAGER_ID,
          name: "Nûruosmaniye Köşkü",
          field: "Arapça dil ilimleri",
        },
        { ownerId: MANAGER_ID, name: "Fatih Köşkü", field: "Fıkıh" },
      ])
      .returning();
    nuruId = nuru.id;
    fatihId = fatih.id;
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: nuruId,
    });
    await db()
      .insert(madrasahKoskHosting)
      .values([
        { madrasahId, koskId: nuruId, grantedBy: ADMIN_ID },
        { madrasahId, koskId: fatihId, grantedBy: ADMIN_ID },
      ]);
    for (const [userId, role, scopeId] of [
      [HEAD_ID, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasahId],
      [TEACHING_HEAD_ID, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasahId],
      [OTHER_HEAD_ID, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, otherMadrasahId],
    ] as const) {
      await assignRole(db(), { userId, role, scopeId });
    }
    const seeded = await db()
      .insert(courses)
      .values(
        [
          ["Bina ve İzhar Şerhi", nuruId, madrasahId, CourseStatus.PUBLISHED],
          ["Mantığa giriş", fatihId, madrasahId, CourseStatus.PUBLISHED],
          ["Taslak ders", nuruId, madrasahId, CourseStatus.DRAFT],
          ["Gizlenmiş ders", nuruId, madrasahId, CourseStatus.PUBLISHED],
          ["Başka medresenin dersi", nuruId, otherMadrasahId, "PUBLISHED"],
          ["Köşkün kendi dersi", nuruId, null, "PUBLISHED"],
        ].map(([title, koskId, medrese, status], i) => ({
          title: title as string,
          koskId: koskId as string,
          madrasahId: medrese,
          status: status as CourseStatus,
          authorId: MANAGER_ID,
          coverHue: 200 + i,
          archivedAt: i === 3 ? new Date() : null,
          archivedBy: i === 3 ? MANAGER_ID : null,
        }))
      )
      .returning();
    [binaId, mantikId, draftId, hiddenId, foreignId, ownId] = seeded.map(
      (c) => c.id
    );
    await assignRole(db(), {
      userId: TEACHING_HEAD_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: binaId,
    });
    await assignRole(db(), {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
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

  describe("GET /madrasahs/:id/students", () => {
    beforeEach(async () => {
      await db()
        .insert(users)
        .values([
          { id: talebe(0), givenName: "Sümeyye Nur", familyName: "Ekincioğlu" },
        ]);
      await db()
        .insert(enrollments)
        .values([
          // Two seats in the medrese: "İlk kayıt" is the older, 25 days ago.
          seat(0, binaId, { createdAt: daysAgo(25), studentName: null }),
          seat(0, mantikId, { createdAt: daysAgo(3) }),
          // Attends one course and finished the other.
          seat(1, binaId, { createdAt: daysAgo(20) }),
          seat(1, mantikId, {
            createdAt: daysAgo(10),
            status: EnrollmentStatus.COMPLETED,
            completedAt: daysAgo(2),
          }),
          // Finished their only course.
          seat(2, binaId, {
            createdAt: daysAgo(15),
            status: EnrollmentStatus.COMPLETED,
            completedAt: null,
          }),
          // Not talebe of the medrese: waiting, or only in a course that is
          // hidden, another medrese's or a köşk's own.
          seat(3, binaId, { status: EnrollmentStatus.PENDING }),
          seat(4, foreignId),
          seat(5, hiddenId),
          seat(6, ownId),
          // Talebe of the draft course and of Bina.
          seat(7, binaId, { createdAt: daysAgo(5) }),
          seat(8, draftId, { createdAt: daysAgo(4) }),
          seat(9, binaId, { createdAt: daysAgo(1) }),
        ]);
    });

    const ids = (body: { items: { userId: string }[] }) =>
      body.items.map((s) => s.userId);

    it("lists everyone enrolled in or finished a shown course of the medrese, newest first, and no one else", async () => {
      const res = await students().expect(200);
      expect(res.body).toMatchObject({ total: 6, page: 1, limit: 10 });
      expect(ids(res.body)).toEqual([9, 8, 7, 2, 1, 0].map(talebe));
    });

    it("gives each talebe's name, e-mail and all their courses of the medrese", async () => {
      const { items } = (await students().expect(200)).body;
      const byId = (n: number) =>
        items.find((s: { userId: string }) => s.userId === talebe(n));
      // The users row first; the seat's snapshot when there is none.
      expect(byId(0)).toMatchObject({
        name: "Sümeyye Nur Ekincioğlu",
        email: "talebe0@example.com",
        ongoingCourses: [
          { title: "Bina ve İzhar Şerhi", completedAt: null },
          { title: "Mantığa giriş", completedAt: null },
        ],
        completedCourses: [],
      });
      expect(new Date(byId(0).firstEnrolledAt).getTime()).toBeCloseTo(
        daysAgo(25).getTime(),
        -4
      );
      expect(byId(9)).toMatchObject({
        name: "Talebe 9",
        email: "talebe9@example.com",
      });
      expect(byId(1)).toMatchObject({
        ongoingCourses: [{ title: "Bina ve İzhar Şerhi" }],
        completedCourses: [
          { title: "Mantığa giriş", completedAt: expect.any(String) },
        ],
      });
      // A completion recorded before the date was kept has none.
      expect(byId(2)).toMatchObject({
        ongoingCourses: [],
        completedCourses: [{ title: "Bina ve İzhar Şerhi", completedAt: null }],
      });
      expect(JSON.stringify(items)).not.toContain("Başka medrese");
    });

    it("pages ten at a time, clamps the page and the size, and counts all of them", async () => {
      const first = await students("?limit=4").expect(200);
      expect(first.body).toMatchObject({ total: 6, page: 1, limit: 4 });
      expect(ids(first.body)).toEqual([9, 8, 7, 2].map(talebe));
      const second = await students("?limit=4&page=2").expect(200);
      expect(ids(second.body)).toEqual([1, 0].map(talebe));
      expect(
        (await students("?page=9&limit=4").expect(200)).body
      ).toMatchObject({ items: [], total: 6 });
      expect(
        (await students("?page=0&limit=-3").expect(200)).body
      ).toMatchObject({ page: 1, limit: 1 });
      expect((await students("?limit=500").expect(200)).body.limit).toBe(50);
    });

    it("keeps the talebe of a course, of a state, and of a state in a course", async () => {
      const inMantik = await students(`?courseId=${mantikId}`).expect(200);
      expect(ids(inMantik.body)).toEqual([1, 0].map(talebe));
      expect(inMantik.body.total).toBe(2);
      // Picked by that course, each still lists all of theirs.
      expect(inMantik.body.items[0].ongoingCourses).toMatchObject([
        { title: "Bina ve İzhar Şerhi" },
      ]);
      expect(
        ids((await students("?status=COMPLETED").expect(200)).body)
      ).toEqual([2, 1].map(talebe));
      expect(
        ids(
          (await students(`?courseId=${mantikId}&status=COMPLETED`).expect(200))
            .body
        )
      ).toEqual([talebe(1)]);
      expect(
        ids(
          (await students(`?courseId=${mantikId}&status=ENROLLED`).expect(200))
            .body
        )
      ).toEqual([talebe(0)]);
      expect(
        (await students(`?courseId=${draftId}`).expect(200)).body.total
      ).toBe(1);
      expect(
        (await students(`?courseId=${hiddenId}`).expect(200)).body.total
      ).toBe(0);
    });

    it("searches the name and the e-mail address, ignoring case, and reads % and _ as themselves", async () => {
      const find = async (q: string) =>
        ids((await students(`?q=${encodeURIComponent(q)}`).expect(200)).body);
      expect(await find("ekinci")).toEqual([talebe(0)]);
      expect(await find("TALEBE 7")).toEqual([talebe(7)]);
      expect(await find("talebe9@")).toEqual([talebe(9)]);
      expect(await find("%")).toEqual([]);
      expect(await find("talebe_")).toEqual([]);
      expect(await find("nobody")).toEqual([]);
    });

    it("validates the query", async () => {
      await students("?status=PENDING").expect(400);
      await students("?courseId=nope").expect(400);
      await students("?page=abc").expect(400);
    });

    it("answers the başmüderris and the başnazım, and no one else", async () => {
      await students("", ADMIN_ID).expect(200);
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIR_ID, MANAGER_ID]) {
        await students("", sub).expect(403);
      }
      await get(HEAD_ID, "/students", MISSING_ID).expect(404);
      await http().get(`/madrasahs/${madrasahId}/students`).expect(401);
    });
  });

  describe("GET /madrasahs/:id/dashboard", () => {
    let weekId: string;
    const session = (
      over: Partial<typeof lessons.$inferInsert> & { weekId?: string }
    ) => ({
      weekId,
      title: "Celse",
      type: LessonType.LIVE,
      durationMinutes: 60,
      scheduledAt: inDays(1),
      meetingUrl: null,
      ...over,
    });

    beforeEach(async () => {
      await assignRole(db(), {
        userId: ANOTHER_NAZIR_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: madrasahId,
        grantedBy: HEAD_ID,
      });
      // A revoked nazır is not counted.
      await db().insert(roleAssignments).values({
        userId: REVOKED_NAZIR_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeType: "madrasah",
        scopeId: madrasahId,
        grantedBy: HEAD_ID,
        revokedAt: new Date(),
        revokedBy: HEAD_ID,
      });
    });

    /** One week per course, and the sessions the Pano must and must not list. */
    const seedSessions = async () => {
      const weeks = await db()
        .insert(courseWeeks)
        .values(
          [binaId, mantikId, draftId, hiddenId, foreignId].map((courseId) => ({
            courseId,
            weekNumber: courseId === mantikId ? 4 : 2,
            title: "Hafta",
          }))
        )
        .returning();
      const weekOf = (courseId: string) =>
        weeks.find((w) => w.courseId === courseId)?.id as string;
      weekId = weekOf(binaId);
      const [archivedWeek] = await db()
        .insert(courseWeeks)
        .values({
          courseId: binaId,
          weekNumber: 9,
          title: "Kaldırılan hafta",
          archivedAt: new Date(),
        })
        .returning();
      await db()
        .insert(lessons)
        .values([
          session({
            title: "Meet",
            scheduledAt: inDays(2),
            meetingUrl: "https://MEET.google.com/abc-defg-hij",
          }),
          session({ title: "Bağlantısız", scheduledAt: inDays(6) }),
          session({ title: "Çok ileri", scheduledAt: inDays(8) }),
          session({ title: "Geçmiş", scheduledAt: daysAgo(1) }),
          session({
            title: "İptal",
            scheduledAt: inDays(3),
            cancelledAt: new Date(),
          }),
          session({
            title: "Kaldırılan celse",
            scheduledAt: inDays(3),
            archivedAt: new Date(),
          }),
          session({
            title: "Kayıt",
            type: LessonType.VIDEO,
            scheduledAt: inDays(3),
          }),
          session({ weekId: archivedWeek.id, title: "Kaldırılan haftada" }),
          session({
            weekId: weekOf(mantikId),
            title: "Zoom",
            scheduledAt: inDays(1),
            meetingUrl: "https://us02web.zoom.us/j/123456789",
          }),
          session({ weekId: weekOf(draftId), title: "Taslakta" }),
          session({ weekId: weekOf(hiddenId), title: "Gizlide" }),
          session({ weekId: weekOf(foreignId), title: "Başkasında" }),
        ]);
    };

    it("counts the nazırs and the shown courses, and lists the köşks that gave the medrese a right", async () => {
      const res = await dashboard().expect(200);
      expect(res.body).toMatchObject({ nazirCount: 2, courseCount: 3 });
      expect(res.body.hostingKosks).toEqual([
        {
          id: fatihId,
          name: "Fatih Köşkü",
          field: "Fıkıh",
          courseCount: 1,
        },
        {
          id: nuruId,
          name: "Nûruosmaniye Köşkü",
          field: "Arapça dil ilimleri",
          courseCount: 2,
        },
      ]);
      // The same list the köşk side of the course screens reads.
      const listed = await get(HEAD_ID, "/hosting-kosks").expect(200);
      expect(res.body.hostingKosks).toEqual(listed.body);
    });

    it("lists the live sessions of the next 7 days of published courses, soonest first, naming the host and never the link", async () => {
      await seedSessions();
      const res = await dashboard().expect(200);
      expect(
        res.body.upcomingSessions.map(
          (s: {
            courseTitle: string;
            weekNumber: number;
            meetingHost: string;
          }) => [s.courseTitle, s.weekNumber, s.meetingHost]
        )
      ).toEqual([
        ["Mantığa giriş", 4, "us02web.zoom.us"],
        ["Bina ve İzhar Şerhi", 2, "meet.google.com"],
        ["Bina ve İzhar Şerhi", 2, null],
      ]);
      expect(res.body.upcomingSessions[0]).toMatchObject({
        koskId: fatihId,
        koskName: "Fatih Köşkü",
        courseId: mantikId,
        courseCoverHue: 201,
        scheduledAt: expect.any(String),
        lessonId: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toContain("abc-defg-hij");
    });

    it("lists the pending applications newest first with the whole count, and says which the caller may decide", async () => {
      await db()
        .insert(enrollments)
        .values([
          seat(3, binaId, {
            status: EnrollmentStatus.PENDING,
            createdAt: daysAgo(5),
          }),
          seat(9, binaId, {
            status: EnrollmentStatus.PENDING,
            createdAt: daysAgo(1),
            studentName: null,
            studentEmail: null,
          }),
          seat(10, mantikId, {
            status: EnrollmentStatus.PENDING,
            createdAt: daysAgo(3),
          }),
          // Not pending applications to a shown course of the medrese.
          seat(11, binaId),
          seat(12, hiddenId, { status: EnrollmentStatus.PENDING }),
          seat(13, foreignId, { status: EnrollmentStatus.PENDING }),
        ]);
      await db()
        .insert(users)
        .values({ id: talebe(9), givenName: "Zeynep Betül", familyName: "K." });

      const res = await dashboard().expect(200);
      expect(res.body).toMatchObject({
        pendingApplicationCount: 3,
        pendingCourseCount: 2,
      });
      expect(
        res.body.pendingApplications.map(
          (a: { userId: string; courseTitle: string; studentName: string }) => [
            a.userId,
            a.courseTitle,
            a.studentName,
          ]
        )
      ).toEqual([
        [talebe(9), "Bina ve İzhar Şerhi", "Zeynep Betül K."],
        [talebe(10), "Mantığa giriş", "Talebe 10"],
        [talebe(3), "Bina ve İzhar Şerhi", "Talebe 3"],
      ]);
      expect(res.body.pendingApplications[1]).toMatchObject({
        courseId: mantikId,
        studentEmail: "talebe10@example.com",
        appliedAt: expect.any(String),
      });

      // The başmüderris alone cannot decide: the course routes answer the
      // course's müderris, the köşk's nazım and the başnazım.
      const decide = (body: {
        pendingApplications: { viewerMayDecide: boolean }[];
      }) => body.pendingApplications.map((a) => a.viewerMayDecide);
      expect(decide(res.body)).toEqual([false, false, false]);
      expect(decide((await dashboard(TEACHING_HEAD_ID)).body)).toEqual([
        true,
        false,
        true,
      ]);
      expect(decide((await dashboard(ADMIN_ID)).body)).toEqual([
        true,
        true,
        true,
      ]);
    });

    it("lists at most 50 applications and counts them all", async () => {
      await db()
        .insert(enrollments)
        .values(
          Array.from({ length: 55 }, (_, i) =>
            seat(100 + i, binaId, {
              status: EnrollmentStatus.PENDING,
              createdAt: daysAgo(60 - i / 10),
            })
          )
        );
      const { body } = (await dashboard().expect(200)) as {
        body: {
          pendingApplicationCount: number;
          pendingApplications: unknown[];
        };
      };
      expect(body.pendingApplicationCount).toBe(55);
      expect(body.pendingApplications).toHaveLength(50);
    });

    it("is empty and zero for a medrese with nothing yet", async () => {
      const res = await get(
        OTHER_HEAD_ID,
        "/dashboard",
        otherMadrasahId
      ).expect(200);
      expect(res.body).toMatchObject({
        nazirCount: 0,
        courseCount: 1,
        hostingKosks: [],
        upcomingSessions: [],
        pendingApplicationCount: 0,
        pendingCourseCount: 0,
        pendingApplications: [],
      });
    });

    it("answers the başmüderris and the başnazım, and no one else", async () => {
      await dashboard(ADMIN_ID).expect(200);
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIR_ID, MANAGER_ID]) {
        await dashboard(sub).expect(403);
      }
      await get(HEAD_ID, "/dashboard", MISSING_ID).expect(404);
      await http().get(`/madrasahs/${madrasahId}/dashboard`).expect(401);
    });
  });
});
