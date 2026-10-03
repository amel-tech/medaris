import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../../src/course/domain/recording";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessonRecordings,
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
 * MDRS-162 — `GET /courses/:id/recordings`, and the recording and live stream
 * keys of `GET /courses/:courseId/sessions/:sessionId`. The ordering and the
 * visibility filter are unit-tested (test/unit/course/recording.spec.ts); this
 * covers the real migration, the guards and the content rule for a visitor, a
 * stranger, a PENDING and an enrolled talebe.
 */

const MANAGER_ID = "e6200000-0000-4000-8000-000000000001";
const STRANGER_ID = "e6200000-0000-4000-8000-000000000002";
const PENDING_ID = "e6200000-0000-4000-8000-000000000003";
const TALEBE_ID = "e6200000-0000-4000-8000-000000000004";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const HOUR = 3_600_000;
const STREAM = "https://www.youtube.com/watch?v=live123";
const RECORDING_URL = "https://www.youtube.com/watch?v=rec456";

describe("lesson recordings (MDRS-162, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let week1Id: string;
  let week2Id: string;
  let publicLessonId: string;
  let enrolledLessonId: string;
  let processingLessonId: string;
  let liveLessonId: string;
  let draftCourseId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) => bearerFor({ sub });

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
        durationMinutes: 60,
        scheduledAt: new Date(Date.now() - 48 * HOUR),
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
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
      grantedBy: MANAGER_ID,
    });
    const [course, draft] = await db()
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Taslak",
          status: CourseStatus.DRAFT,
        },
      ])
      .returning();
    courseId = course.id;
    draftCourseId = draft.id;
    [{ id: week1Id }, { id: week2Id }] = await db()
      .insert(courseWeeks)
      .values([
        { courseId, weekNumber: 1, title: "Emsile-i muhtelife", orderIndex: 0 },
        { courseId, weekNumber: 2, title: "Emsile-i muttaride", orderIndex: 1 },
      ])
      .returning();

    publicLessonId = await insertLesson(week1Id, 0, { title: "Bir" });
    enrolledLessonId = await insertLesson(week2Id, 0, { title: "İki" });
    processingLessonId = await insertLesson(week2Id, 1, { title: "İki b" });
    liveLessonId = await insertLesson(week2Id, 2, {
      title: "Canlı",
      scheduledAt: new Date(Date.now() - 14 * 60_000),
      liveStreamUrl: STREAM,
      meetingUrl: "https://zoom.us/j/1",
    });
    await db()
      .insert(lessonRecordings)
      .values([
        {
          lessonId: publicLessonId,
          title: "Bir: celse kaydı",
          provider: RecordingProvider.YOUTUBE,
          url: RECORDING_URL,
          durationMinutes: 47,
          recordedAt: new Date("2026-09-05T18:00:00Z"),
          visibility: RecordingVisibility.PUBLIC,
          status: RecordingStatus.READY,
        },
        {
          lessonId: enrolledLessonId,
          title: "İki: celse kaydı",
          provider: RecordingProvider.DRIVE,
          url: "https://drive.google.com/file/d/xyz/view",
          durationMinutes: 55,
          recordedAt: new Date("2026-09-12T18:00:00Z"),
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.READY,
        },
        {
          lessonId: processingLessonId,
          title: "İki b: celse kaydı",
          provider: RecordingProvider.YOUTUBE,
          url: "https://www.youtube.com/watch?v=hidden",
          recordedAt: new Date("2026-09-13T18:00:00Z"),
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.PROCESSING,
        },
      ]);
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

  describe("GET /courses/:id/recordings", () => {
    it("lists every recording for an enrolled talebe, newest week first, with no link while PROCESSING", async () => {
      const res = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.body.map((r: { title: string }) => r.title)).toEqual([
        "İki b: celse kaydı",
        "İki: celse kaydı",
        "Bir: celse kaydı",
      ]);
      expect(res.body[0]).toMatchObject({
        status: "PROCESSING",
        url: null,
        weekNumber: 2,
        lessonId: processingLessonId,
      });
      expect(res.body[1]).toMatchObject({
        provider: "DRIVE",
        weekTitle: "Emsile-i muttaride",
        durationMinutes: 55,
      });
    });

    it("lists only PUBLIC recordings for a visitor with no token", async () => {
      const res = await http()
        .get(`/courses/${courseId}/recordings`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        visibility: "PUBLIC",
        url: RECORDING_URL,
      });
      expect(JSON.stringify(res.body)).not.toContain("drive.google.com");
    });

    it("lists no PUBLIC recording to a visitor once the course is closed, and all of them to the talebe (MDRS-176)", async () => {
      await db()
        .update(courses)
        .set({ isClosed: true })
        .where(eq(courses.id, courseId));
      const visitor = await http()
        .get(`/courses/${courseId}/recordings`)
        .expect(200);
      expect(visitor.body).toEqual([]);
      const talebe = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(talebe.body).toHaveLength(3);
    });

    it.each([
      ["a stranger", STRANGER_ID],
      ["a PENDING applicant", PENDING_ID],
    ])("lists only PUBLIC recordings for %s", async (_name, sub) => {
      const res = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(sub))
        .expect(200);
      expect(res.body.map((r: { visibility: string }) => r.visibility)).toEqual(
        ["PUBLIC"]
      );
    });

    it("leaves out a recording whose lesson is archived", async () => {
      await db()
        .update(lessons)
        .set({ archivedAt: new Date() })
        .where(eq(lessons.id, enrolledLessonId));
      const res = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(
        res.body.map((r: { lessonId: string }) => r.lessonId)
      ).not.toContain(enrolledLessonId);
    });

    it("answers 404 for a draft and for a course that does not exist", async () => {
      await http()
        .get(`/courses/${draftCourseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(404);
      await http().get(`/courses/${ABSENT_ID}/recordings`).expect(404);
    });
  });

  describe("session recording and live stream", () => {
    const session = (id: string) => `/courses/${courseId}/sessions/${id}`;

    it("gives an enrolled talebe the recording of an ended session", async () => {
      const res = await http()
        .get(session(enrolledLessonId))
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(res.body.status).toBe("ENDED");
      expect(res.body.recording).toMatchObject({
        title: "İki: celse kaydı",
        provider: "DRIVE",
        durationMinutes: 55,
        status: "READY",
      });
      expect(res.body.liveStreamUrl).toBeNull();
    });

    it("gives the live stream link only while the session is LIVE", async () => {
      const live = await http()
        .get(session(liveLessonId))
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(live.body.status).toBe("LIVE");
      expect(live.body.liveStreamUrl).toBe(STREAM);
      expect(live.body.recording).toBeNull();

      await db()
        .update(lessons)
        .set({ scheduledAt: new Date(Date.now() - 3 * HOUR) })
        .where(eq(lessons.id, liveLessonId));
      const ended = await http()
        .get(session(liveLessonId))
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(ended.body.liveStreamUrl).toBeNull();
    });

    it("names neither key to a caller who may not read content", async () => {
      for (const token of [undefined, as(STRANGER_ID), as(PENDING_ID)]) {
        for (const id of [enrolledLessonId, publicLessonId, liveLessonId]) {
          const req = http().get(session(id));
          const res = await (token
            ? req.set("Authorization", token)
            : req
          ).expect(200);
          expect(res.body.contentLocked).toBe(true);
          expect(res.body).not.toHaveProperty("recording");
          expect(res.body).not.toHaveProperty("liveStreamUrl");
          expect(JSON.stringify(res.body)).not.toContain(STREAM);
          expect(JSON.stringify(res.body)).not.toContain(RECORDING_URL);
        }
      }
    });

    it("gives a locked caller the PUBLIC recording of a sample session, and only that", async () => {
      await db()
        .update(lessons)
        .set({ isPreview: true })
        .where(eq(lessons.id, publicLessonId));
      await db()
        .update(lessons)
        .set({ isPreview: true })
        .where(eq(lessons.id, enrolledLessonId));
      for (const token of [undefined, as(STRANGER_ID), as(PENDING_ID)]) {
        const open = http().get(session(publicLessonId));
        const res = await (token
          ? open.set("Authorization", token)
          : open
        ).expect(200);
        expect(res.body.contentLocked).toBe(true);
        expect(res.body.recording).toMatchObject({
          title: "Bir: celse kaydı",
          status: "READY",
        });
        expect(res.body).not.toHaveProperty("liveStreamUrl");

        const closed = http().get(session(enrolledLessonId));
        const hidden = await (token
          ? closed.set("Authorization", token)
          : closed
        ).expect(200);
        expect(hidden.body.recording).toBeNull();
        expect(JSON.stringify(hidden.body)).not.toContain(
          "drive.google.com/file/d/xyz"
        );
      }
    });
  });
});
