import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { enrollments } from "../../src/database/schema/course.schema";
import {
  examResults,
  lessonExams,
} from "../../src/database/schema/lesson-exam.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import { users } from "../../src/database/schema/user.schema";
import { ExamReminderPoller } from "../../src/exam/exam-reminder.poller";
import {
  bearerOf,
  CAST,
  type ICourseScopeIds,
  insertLiveLesson,
  seedCourseScope,
} from "../helpers/course-scope-cast";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * "Ara sınav" (MDRS-248). An exam is a celse planned as "Sınav" on "Celse
 * planla": one LIVE session with a `lesson_exams` row. The course team enters
 * each talebe's score or "Girmedi" on "Değerlendirme" and opens the results;
 * a talebe reads their own on "Notlarım".
 *
 * Pinned here: planning (defaults, one session only, the talebe told); the
 * course read carrying the exam; the score bound in the API (above
 * "tam puan", below 0, none); who may enter (`session.manage` on this course,
 * not on another, not a talebe) and for whom (a talebe seated here); that a
 * result stays closed to its talebe until released, then opens to them alone;
 * the release told once; the board's EXAM column and "Excel indir"; the
 * 24-hour reminder claimed once.
 */

/** A second enrolled talebe of course A. */
const OTHER_TALEBE = "e2480000-0000-4000-8000-0000000000d1";
/** A talebe of course B only. */
const TALEBE_OF_B = "e2480000-0000-4000-8000-0000000000d3";

const bearer = (sub: string) =>
  (Object.values(CAST) as string[]).includes(sub)
    ? bearerOf(sub as (typeof CAST)[keyof typeof CAST])
    : bearerFor({ sub });

const HOUR = 3_600_000;

/** `YYYY-MM-DD` and the ISO weekday (1 Monday … 7 Sunday) of a day ahead. */
const dayAhead = (days: number) => {
  const date = new Date(Date.now() + days * 24 * HOUR);
  const iso = date.toISOString().slice(0, 10);
  const weekday = ((date.getUTCDay() + 6) % 7) + 1;
  return { iso, weekday };
};

interface IMyGrades {
  exams: {
    lessonId: string;
    released: boolean;
    score: number | null;
    absent: boolean | null;
    maxScore: number;
    isRetake: boolean;
  }[];
  memorizations: unknown[];
}

describe("exams (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  /** A held exam of course A, out of 100. */
  let examId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const enter = (
    sub: string,
    talebe: string,
    body: Record<string, unknown>,
    lesson = examId
  ) =>
    http()
      .put(`/lessons/${lesson}/exam-results/${talebe}`)
      .set("Authorization", bearer(sub))
      .send(body);
  const release = (sub: string, lesson = examId) =>
    http()
      .post(`/lessons/${lesson}/exam-results/release`)
      .set("Authorization", bearer(sub));
  const myGrades = async (sub: string): Promise<IMyGrades> =>
    (
      await http()
        .get(`/courses/${ids.courseId}/my-grades`)
        .set("Authorization", bearer(sub))
        .expect(200)
    ).body;
  const notesOf = (userId: string, type: string) =>
    db()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .then((rows) => rows.filter((row) => row.type === type));

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "notifications",
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    ids = await seedCourseScope(db());
    await db()
      .insert(enrollments)
      .values([
        {
          userId: OTHER_TALEBE,
          courseId: ids.courseId,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: TALEBE_OF_B,
          courseId: ids.otherCourseId,
          status: EnrollmentStatus.ENROLLED,
        },
      ]);
    await db()
      .insert(users)
      .values([
        { id: CAST.TALEBE, givenName: "Zeynep", familyName: "Talebe" },
        { id: OTHER_TALEBE, givenName: "Ahmet", familyName: "Talebe" },
      ]);
    examId = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Ara sınav",
    });
    await db().insert(lessonExams).values({ lessonId: examId });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("planning", () => {
    const plan = (body: Record<string, unknown>, sub: string = CAST.MUDERRIS) =>
      http()
        .post(`/courses/${ids.courseId}/sessions/batch`)
        .set("Authorization", bearer(sub))
        .send(body);

    it("plans one celse as an exam with its defaults, marks the course read and tells the talebe", async () => {
      const day = dayAhead(5);
      const res = await plan({
        title: "Ara sınav",
        weekdays: [day.weekday],
        startTime: "10:00",
        durationMinutes: 90,
        timeZone: "Europe/Istanbul",
        startDate: day.iso,
        count: 1,
        exam: { topics: "  Emsile, birinci bab  " },
      }).expect(201);
      expect(res.body.lessons).toHaveLength(1);
      const lessonId = res.body.lessons[0].id as string;

      const [row] = await db()
        .select()
        .from(lessonExams)
        .where(eq(lessonExams.lessonId, lessonId));
      expect(row).toMatchObject({
        format: "WRITTEN",
        maxScore: 100,
        topics: "Emsile, birinci bab",
        location: null,
        isRetake: false,
        resultsReleasedAt: null,
      });

      const read = await http()
        .get(`/courses/${ids.courseId}`)
        .set("Authorization", bearer(CAST.TALEBE))
        .expect(200);
      const lesson = (
        read.body.weeks as { lessons: { id: string; exam: unknown }[] }[]
      )
        .flatMap((week) => week.lessons)
        .find((l) => l.id === lessonId);
      expect(lesson?.exam).toMatchObject({ format: "WRITTEN", maxScore: 100 });

      expect(await notesOf(CAST.TALEBE, "EXAM_SCHEDULED")).toHaveLength(1);
      // The planner is not told of their own write.
      expect(await notesOf(CAST.MUDERRIS, "EXAM_SCHEDULED")).toHaveLength(0);
    });

    it("plans an exam in person at its place, oral and a make-up", async () => {
      const day = dayAhead(6);
      const res = await plan({
        title: "Telafi sınavı",
        weekdays: [day.weekday],
        startTime: "10:00",
        durationMinutes: 60,
        startDate: day.iso,
        count: 1,
        exam: {
          format: "ORAL",
          maxScore: 20,
          location: "Medrese, 2. sınıf",
          isRetake: true,
        },
      }).expect(201);
      expect(res.body.lessons[0].inPersonOverride).toBe(true);
      const [row] = await db()
        .select()
        .from(lessonExams)
        .where(eq(lessonExams.lessonId, res.body.lessons[0].id));
      expect(row).toMatchObject({
        format: "ORAL",
        maxScore: 20,
        location: "Medrese, 2. sınıf",
        isRetake: true,
      });
    });

    it("refuses an exam that is more than one celse, and a tam puan out of bounds", async () => {
      const day = dayAhead(5);
      const weekly = {
        title: "Sınav",
        weekdays: [day.weekday],
        startTime: "10:00",
        durationMinutes: 60,
        startDate: day.iso,
      };
      const res = await plan({ ...weekly, count: 2, exam: {} }).expect(400);
      expect(res.body.code).toBe("EXAM_ONE_SESSION");
      await plan({ ...weekly, count: 1, exam: { maxScore: 0 } }).expect(400);
      await plan({ ...weekly, count: 1, exam: { maxScore: 1001 } }).expect(400);
      await plan({ ...weekly, count: 1, exam: { format: "ESSAY" } }).expect(
        400
      );
    });
  });

  describe("entering a result", () => {
    it("keeps a score up to tam puan, and Girmedi with none", async () => {
      const saved = await enter(CAST.MUDERRIS, CAST.TALEBE, {
        score: 85,
      }).expect(200);
      expect(saved.body).toMatchObject({
        lessonId: examId,
        userId: CAST.TALEBE,
        score: 85,
        absent: false,
      });
      await enter(CAST.MUDERRIS, CAST.TALEBE, { score: 100 }).expect(200);

      const absent = await enter(CAST.SESSION, OTHER_TALEBE, {
        score: 40,
        absent: true,
      }).expect(200);
      expect(absent.body).toMatchObject({ score: null, absent: true });

      const [audit] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "exam_result.save"));
      expect(audit.details).toMatchObject({ lessonId: examId });
    });

    it("refuses a score above tam puan, below 0, a fraction or none", async () => {
      for (const body of [{ score: 101 }, { score: -1 }, {}, { score: null }]) {
        const res = await enter(CAST.MUDERRIS, CAST.TALEBE, body).expect(400);
        expect(res.body.code).toBe("EXAM_SCORE_OUT_OF_RANGE");
      }
      await enter(CAST.MUDERRIS, CAST.TALEBE, { score: 50.5 }).expect(400);
      expect(await db().select().from(examResults)).toHaveLength(0);
    });

    it("is the course team's alone, on this course's exam, for its own talebe", async () => {
      for (const sub of [
        CAST.TALEBE,
        CAST.STRANGER,
        CAST.OTHER_COURSE,
        CAST.BARE,
        CAST.WEEK_HIDE,
      ]) {
        await enter(sub, CAST.TALEBE, { score: 90 }).expect(403);
      }
      const notSeated = await enter(CAST.MUDERRIS, TALEBE_OF_B, {
        score: 90,
      }).expect(404);
      expect(notSeated.body.code).toBe("EXAM_TALEBE_NOT_FOUND");

      const plain = await insertLiveLesson(db(), ids.weekId, 1);
      const notExam = await enter(
        CAST.MUDERRIS,
        CAST.TALEBE,
        { score: 90 },
        plain
      ).expect(404);
      expect(notExam.body.code).toBe("EXAM_NOT_FOUND");
      expect(await db().select().from(examResults)).toHaveLength(0);
    });
  });

  describe("results and their release", () => {
    it("keeps a talebe's score from them until it is released, then shows them their own alone", async () => {
      await enter(CAST.MUDERRIS, CAST.TALEBE, { score: 72 }).expect(200);
      await enter(CAST.MUDERRIS, OTHER_TALEBE, { absent: true }).expect(200);

      const closed = await myGrades(CAST.TALEBE);
      expect(closed.exams).toEqual([
        expect.objectContaining({
          lessonId: examId,
          released: false,
          score: null,
          absent: null,
          maxScore: 100,
        }),
      ]);
      // Nobody but the course team opens them.
      await release(CAST.TALEBE).expect(403);
      await release(CAST.OTHER_COURSE).expect(403);

      const opened = await release(CAST.MUDERRIS).expect(200);
      expect(opened.body.lessonId).toBe(examId);
      expect((await myGrades(CAST.TALEBE)).exams[0]).toMatchObject({
        released: true,
        score: 72,
        absent: false,
      });
      expect((await myGrades(OTHER_TALEBE)).exams[0]).toMatchObject({
        released: true,
        score: null,
        absent: true,
      });
      // One with no result sees the exam and nothing entered.
      expect((await myGrades(CAST.MUDERRIS)).exams[0]).toMatchObject({
        released: true,
        score: null,
        absent: null,
      });
    });

    it("tells the talebe once, and a second release changes nothing", async () => {
      await release(CAST.MUDERRIS).expect(200);
      await release(CAST.SESSION).expect(200);
      expect(await notesOf(CAST.TALEBE, "EXAM_RESULTS_RELEASED")).toHaveLength(
        1
      );
      expect(
        await db()
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, "exam.release"))
      ).toHaveLength(1);
    });

    it("shows the course team every result on the board's EXAM column", async () => {
      await enter(CAST.MUDERRIS, CAST.TALEBE, { score: 90 }).expect(200);
      const board = await http()
        .get(`/courses/${ids.courseId}/evaluations`)
        .set("Authorization", bearer(CAST.SESSION))
        .expect(200);
      expect(board.body.columns).toEqual([
        expect.objectContaining({
          kind: "EXAM",
          lessonId: examId,
          fullCount: 1,
          exam: expect.objectContaining({
            maxScore: 100,
            isRetake: false,
            resultsReleasedAt: null,
          }),
        }),
      ]);
      expect(board.body.results).toEqual([
        expect.objectContaining({
          lessonId: examId,
          userId: CAST.TALEBE,
          score: 90,
        }),
      ]);
      // The talebe never reads the board.
      await http()
        .get(`/courses/${ids.courseId}/evaluations`)
        .set("Authorization", bearer(CAST.TALEBE))
        .expect(403);
    });

    it("downloads the board as a spreadsheet for the course team alone", async () => {
      await enter(CAST.MUDERRIS, CAST.TALEBE, { score: 90 }).expect(200);
      const file = await http()
        .get(`/courses/${ids.courseId}/evaluations/export?lang=tr`)
        .set("Authorization", bearer(CAST.MUDERRIS))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(file.headers["content-type"]).toContain("spreadsheetml");
      // An .xlsx is a zip.
      expect((file.body as Buffer).subarray(0, 2).toString()).toBe("PK");
      await http()
        .get(`/courses/${ids.courseId}/evaluations/export`)
        .set("Authorization", bearer(CAST.TALEBE))
        .expect(403);
    });
  });

  describe("the 24-hour reminder", () => {
    it("is claimed once for an exam within a day, never for one further off", async () => {
      const soon = await insertLiveLesson(db(), ids.weekId, 2, {
        title: "Yarınki sınav",
        scheduledAt: new Date(Date.now() + 3 * HOUR),
      });
      const later = await insertLiveLesson(db(), ids.weekId, 3, {
        title: "Gelecek hafta",
        scheduledAt: new Date(Date.now() + 72 * HOUR),
      });
      await db()
        .insert(lessonExams)
        .values([{ lessonId: soon }, { lessonId: later }]);
      const poller = app.get(ExamReminderPoller);

      expect(await poller.remindDue()).toBe(1);
      expect(await poller.remindDue()).toBe(0);
      const told = await notesOf(CAST.TALEBE, "EXAM_REMINDER");
      expect(told).toHaveLength(1);
      expect(told[0].targetId).toBe(soon);
    });
  });
});
