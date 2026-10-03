import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-158 — `GET /courses/:courseId/sessions/:sessionId`. The status and
 * neighbour rules are unit-tested in test/unit/course/session-view.spec.ts;
 * this covers what needs the app: the real guards, the content rule for a
 * caller with no token, a stranger, a PENDING and an enrolled talebe, the
 * cancellation columns from a real migration, and the 404s.
 *
 * Like `public-pages.e2e.spec.ts` the app runs the real `AuthGuard`, so each
 * request carries exactly the header the test gives it.
 */

const MANAGER_ID = "e5800000-0000-4000-8000-000000000001";
const STRANGER_ID = "e5800000-0000-4000-8000-000000000002";
const PENDING_ID = "e5800000-0000-4000-8000-000000000003";
const TALEBE_ID = "e5800000-0000-4000-8000-000000000004";
const IMAM_ID = "e5800000-0000-4000-8000-000000000005";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const MEETING_URL = "https://zoom.us/j/123456789";
const REASON = "Müderris hasta";

const HOUR = 3_600_000;

describe("GET /courses/:courseId/sessions/:sessionId (MDRS-158, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let koskId: string;
  /** Hafta 4, ended. */
  let pastId: string;
  /** Hafta 5, starts in 8 minutes. */
  let upcomingId: string;
  /** Hafta 5, cancelled, with a replacement. */
  let cancelledId: string;
  /** Hafta 5, the replacement. */
  let replacementId: string;
  /** A video lesson: not a session. */
  let videoId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) => bearerFor({ sub });
  const url = (course: string, session: string) =>
    `/courses/${course}/sessions/${session}`;

  const insertLesson = async (
    weekId: string,
    orderIndex: number,
    values: Partial<typeof lessons.$inferInsert>
  ) => {
    const [lesson] = await db()
      .insert(lessons)
      .values({
        weekId,
        orderIndex,
        title: "Celse",
        type: LessonType.LIVE,
        durationMinutes: 45,
        meetingUrl: MEETING_URL,
        agenda: [{ time: "21:00", title: "Açılış" }],
        kaynak: "Bina, s. 20–24",
        ...values,
      })
      .returning();
    return lesson.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
      grantedBy: MANAGER_ID,
    });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: MANAGER_ID,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    await db()
      .insert(courseMuderris)
      .values({ courseId, userId: IMAM_ID, name: "Abdülhamit Karaosmanoğlu" });
    await assignRole(db(), {
      userId: IMAM_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
      isImam: true,
    });
    const [week4, week5] = await db()
      .insert(courseWeeks)
      .values([
        { courseId, weekNumber: 4, title: "Mezîd fiiller", orderIndex: 0 },
        { courseId, weekNumber: 5, title: "Mehmûz fiiller", orderIndex: 1 },
      ])
      .returning();

    const now = Date.now();
    pastId = await insertLesson(week4.id, 0, {
      title: "Hafta sonu müzakeresi",
      scheduledAt: new Date(now - 48 * HOUR),
    });
    upcomingId = await insertLesson(week5.id, 0, {
      title: "Mehmûz fiiller",
      scheduledAt: new Date(now + 8 * 60_000),
      durationMinutes: 60,
    });
    cancelledId = await insertLesson(week5.id, 1, {
      title: "Hafta sonu müzakeresi (iptal)",
      scheduledAt: new Date(now + 24 * HOUR),
    });
    replacementId = await insertLesson(week5.id, 2, {
      title: "Hafta sonu müzakeresi (telafi)",
      scheduledAt: new Date(now + 72 * HOUR),
    });
    await db()
      .update(lessons)
      .set({
        cancelledAt: new Date(),
        cancelReason: REASON,
        replacementLessonId: replacementId,
      })
      .where(eq(lessons.id, cancelledId));
    videoId = await insertLesson(week5.id, 3, {
      title: "Şerh videosu",
      type: LessonType.VIDEO,
      scheduledAt: null,
      meetingUrl: null,
    });
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId, status: EnrollmentStatus.ENROLLED },
        { userId: PENDING_ID, courseId, status: EnrollmentStatus.PENDING },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    await app.close();
  });

  it("gives an enrolled talebe the status, the link, the agenda and the neighbours", async () => {
    const res = await http()
      .get(url(courseId, upcomingId))
      .set("Authorization", as(TALEBE_ID))
      .expect(200);

    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body).toMatchObject({
      id: upcomingId,
      courseId,
      title: "Mehmûz fiiller",
      weekNumber: 5,
      weekTitle: "Mehmûz fiiller",
      durationMinutes: 60,
      status: "SCHEDULED",
      cancelledAt: null,
      meetingUrl: MEETING_URL,
      kaynak: "Bina, s. 20–24",
      agenda: [{ time: "21:00", title: "Açılış" }],
      contentLocked: false,
      replacementSessionId: null,
      replacement: null,
      muderris: [
        { name: "Abdülhamit Karaosmanoğlu", title: null, isImam: true },
      ],
    });
    // Hafta 4 before it; the cancelled session is skipped, so the replacement
    // is next.
    expect(res.body.previous).toMatchObject({ id: pastId, weekNumber: 4 });
    expect(res.body.next).toMatchObject({
      id: replacementId,
      weekNumber: 5,
      status: "SCHEDULED",
    });
  });

  it("derives the status from the clock: a finished session is ENDED and has no link", async () => {
    const res = await http()
      .get(url(courseId, pastId))
      .set("Authorization", as(TALEBE_ID))
      .expect(200);
    expect(res.body.status).toBe("ENDED");
    expect(res.body.meetingUrl).toBeNull();
    expect(res.body.previous).toBeNull();
    expect(res.body.next).toMatchObject({ id: upcomingId });
  });

  it("marks a cancelled session, names its replacement and withholds the link", async () => {
    const res = await http()
      .get(url(courseId, cancelledId))
      .set("Authorization", as(TALEBE_ID))
      .expect(200);
    expect(res.body).toMatchObject({
      status: "CANCELLED",
      cancelReason: REASON,
      replacementSessionId: replacementId,
      meetingUrl: null,
    });
    expect(res.body.cancelledAt).toEqual(expect.any(String));
    expect(res.body.replacement).toMatchObject({
      id: replacementId,
      title: "Hafta sonu müzakeresi (telafi)",
      weekNumber: 5,
    });
    expect(res.body.previous).toMatchObject({ id: upcomingId });
    expect(res.body.next).toMatchObject({ id: replacementId });
  });

  it("shows the cancellation, and the replacement link, in the course programme", async () => {
    const res = await http()
      .get(`/courses/${courseId}`)
      .set("Authorization", as(TALEBE_ID))
      .expect(200);
    const lesson = res.body.weeks
      .flatMap((w: { lessons: { id: string }[] }) => w.lessons)
      .find((l: { id: string }) => l.id === cancelledId);
    expect(lesson).toMatchObject({
      replacementLessonId: replacementId,
      cancelReason: REASON,
    });
    expect(lesson.cancelledAt).toEqual(expect.any(String));
  });

  describe("the content rule", () => {
    const locked = (body: Record<string, unknown>) => {
      for (const key of ["meetingUrl", "agenda", "kaynak", "cancelReason"]) {
        expect(body).not.toHaveProperty(key);
      }
      const text = JSON.stringify(body);
      expect(text).not.toContain(MEETING_URL);
      expect(text).not.toContain(REASON);
      expect(body.contentLocked).toBe(true);
    };

    it("leaves the content out for a caller with no token — the programme stays", async () => {
      const res = await http().get(url(courseId, cancelledId)).expect(200);
      locked(res.body);
      expect(res.body).toMatchObject({
        status: "CANCELLED",
        replacementSessionId: replacementId,
        weekNumber: 5,
      });
    });

    it("leaves the content out for a stranger and for a PENDING applicant", async () => {
      for (const sub of [STRANGER_ID, PENDING_ID]) {
        const res = await http()
          .get(url(courseId, upcomingId))
          .set("Authorization", as(sub))
          .expect(200);
        locked(res.body);
        expect(res.body.status).toBe("SCHEDULED");
      }
    });

    it("gives the köşk manager the content", async () => {
      const res = await http()
        .get(url(courseId, upcomingId))
        .set("Authorization", as(MANAGER_ID))
        .expect(200);
      expect(res.body.meetingUrl).toBe(MEETING_URL);
      expect(res.body.contentLocked).toBe(false);
    });
  });

  describe("not found", () => {
    it("answers 404 for a missing session, a video lesson and another course's session", async () => {
      const auth = as(TALEBE_ID);
      for (const session of [ABSENT_ID, videoId]) {
        await http()
          .get(url(courseId, session))
          .set("Authorization", auth)
          .expect(404)
          .expect((res) => {
            expect(res.body).toHaveProperty("code", "LESSON_NOT_FOUND");
          });
      }
      const [other] = await db()
        .insert(courses)
        .values({
          koskId,
          authorId: MANAGER_ID,
          title: "Başka ders",
          status: CourseStatus.PUBLISHED,
        })
        .returning();
      await http()
        .get(url(other.id, upcomingId))
        .set("Authorization", auth)
        .expect(404);
    });

    it("answers 404 for a missing or malformed course, and 400 for a malformed session id", async () => {
      await http().get(url(ABSENT_ID, upcomingId)).expect(404);
      await http().get(url("not-a-uuid", upcomingId)).expect(404);
      await http().get(url(courseId, "not-a-uuid")).expect(400);
    });

    it("answers 404 for an archived session and for a draft course to a stranger", async () => {
      await db()
        .update(lessons)
        .set({ archivedAt: new Date() })
        .where(eq(lessons.id, upcomingId));
      await http()
        .get(url(courseId, upcomingId))
        .set("Authorization", as(TALEBE_ID))
        .expect(404);

      await db()
        .update(courses)
        .set({ status: CourseStatus.DRAFT })
        .where(eq(courses.id, courseId));
      await http()
        .get(url(courseId, pastId))
        .set("Authorization", as(STRANGER_ID))
        .expect(404);
      await http().get(url(courseId, pastId)).expect(404);
    });
  });
});
