import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses, lessons } from "../../src/database/schema/course.schema";
import { lessonExams } from "../../src/database/schema/lesson-exam.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import {
  madrasahZerothOptions,
  madrasahZerothQuestions,
  onlineExams,
} from "../../src/database/schema/online-exam.schema";
import {
  bearerOf,
  CAST,
  type ICourseScopeIds,
  seedCourseScope,
} from "../helpers/course-scope-cast";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

/**
 * Publishing an online exam (MDRS-299): the draft has no celse, and
 * publishing plans one at the earliest start with its exam row, in the same
 * transaction that links the exam to it. Taken back before it opens, the
 * celse goes and the exam is a draft again. The session plan does not move,
 * cancel or hide that celse.
 */
describe("online exams, publishing (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let madrasahId: string;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const muderris = bearerOf(CAST.MUDERRIS);
  const MINUTE = 60_000;
  const inDays = (days: number) => {
    const at = new Date(Date.now() + days * 86_400_000);
    at.setUTCSeconds(0, 0);
    return at;
  };

  /** A draft with one complete question, at version 3. */
  const readyExam = async (): Promise<string> => {
    const examId = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title: "Ara sınav" })
        .expect(201)
    ).body.id as string;
    const topic = (
      await http()
        .post(`/courses/${ids.courseId}/exam-topics`)
        .set("Authorization", muderris)
        .send({ name: "Kıyas" })
        .expect(201)
    ).body.id as string;
    const added = await http()
      .post(`/online-exams/${examId}/questions`)
      .set("Authorization", muderris)
      .send({ version: 1 })
      .expect(201);
    await http()
      .put(`/online-exams/${examId}/questions/${added.body.question.id}`)
      .set("Authorization", muderris)
      .send({
        version: 2,
        text: "Kıyasın rükünleri kaç tanedir?",
        options: [
          { text: "Üç", correct: false },
          { text: "Dört", correct: true },
        ],
        answerMode: "SINGLE",
        topicIds: [topic],
      })
      .expect(200);
    return examId;
  };
  const publish = (examId: string, body: object, sub = muderris) =>
    http()
      .post(`/online-exams/${examId}/publish`)
      .set("Authorization", sub)
      .send(body);
  const unpublish = (examId: string, version: number) =>
    http()
      .post(`/online-exams/${examId}/unpublish`)
      .set("Authorization", muderris)
      .send({ version });
  const celseOf = async (examId: string) => {
    const [exam] = await db()
      .select({ lessonId: onlineExams.lessonId })
      .from(onlineExams)
      .where(eq(onlineExams.id, examId));
    return exam.lessonId;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log"
    );
    ids = await seedCourseScope(db());
    // The course is a medrese's, and the medrese asks its zeroth question.
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye",
        createdBy: CAST.MANAGER,
      })
      .returning();
    madrasahId = madrasah.id;
    await db()
      .update(courses)
      .set({ madrasahId })
      .where(eq(courses.id, ids.courseId));
    await askZeroth("Bu sınavda kopya çekmeyeceğime söz veriyor musun?", [
      "Evet, söz veriyorum",
      "Hayır",
    ]);
  });

  const askZeroth = async (text: string, options: string[]) => {
    await db()
      .delete(madrasahZerothQuestions)
      .where(eq(madrasahZerothQuestions.madrasahId, madrasahId));
    await db()
      .insert(madrasahZerothQuestions)
      .values({ madrasahId, text, updatedBy: CAST.MANAGER });
    await db()
      .insert(madrasahZerothOptions)
      .values(
        options.map((o, position) => ({ madrasahId, position, text: o }))
      );
  };

  afterAll(async () => {
    await app.close();
  });

  it("plans the celse at the start, with its exam row, and locks the exam", async () => {
    const examId = await readyExam();
    const startsAt = inDays(3);
    const res = await publish(examId, {
      version: 3,
      startsAt: new Date(startsAt.getTime() + 25_000).toISOString(),
    }).expect(200);
    // The seconds are dropped; the latest start is ten minutes later.
    expect(res.body).toMatchObject({
      status: "SCHEDULED",
      startsAt: startsAt.toISOString(),
      latestStartAt: new Date(startsAt.getTime() + 10 * MINUTE).toISOString(),
      problems: [],
      version: 4,
    });

    const lessonId = await celseOf(examId);
    expect(lessonId).not.toBeNull();
    const [celse] = await db()
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId as string));
    expect(celse).toMatchObject({
      title: "Ara sınav",
      scheduledAt: startsAt,
      // The hour and the ten minutes a late talebe may still start in.
      durationMinutes: 70,
    });
    const [row] = await db()
      .select()
      .from(lessonExams)
      .where(eq(lessonExams.lessonId, lessonId as string));
    expect(row).toMatchObject({ format: "MULTIPLE_CHOICE", maxScore: 100 });
    // The medrese's zeroth question is copied; a later change does not reach it.
    await askZeroth("Başka bir soru", ["Bir", "İki"]);
    const copied = await http()
      .get(`/online-exams/${examId}`)
      .set("Authorization", muderris)
      .expect(200);
    expect(copied.body.zerothQuestion).toBe(
      "Bu sınavda kopya çekmeyeceğime söz veriyor musun?"
    );
    expect(
      copied.body.zerothOptions.map((o: { text: string }) => o.text)
    ).toEqual(["Evet, söz veriyorum", "Hayır"]);

    const listed = await http()
      .get(`/courses/${ids.courseId}/online-exams`)
      .set("Authorization", muderris)
      .expect(200);
    expect(listed.body[0]).toMatchObject({
      status: "SCHEDULED",
      startsAt: startsAt.toISOString(),
    });
    const locked = await http()
      .post(`/online-exams/${examId}/questions`)
      .set("Authorization", muderris)
      .send({ version: 4 })
      .expect(409);
    expect(locked.body.code).toBe("EXAM_LOCKED");
    expect((await publish(examId, { version: 4 }).expect(409)).body.code).toBe(
      "EXAM_LOCKED"
    );

    const audit = await db()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, examId));
    expect(audit.map((a) => a.action)).toContain("online_exam.publish");
  });

  it("lists every problem of an exam that is not ready, and plans nothing", async () => {
    const empty = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title: "Boş sınav" })
        .expect(201)
    ).body.id as string;
    const draft = await http()
      .get(`/online-exams/${empty}`)
      .set("Authorization", muderris)
      .expect(200);
    expect(draft.body.problems).toEqual([{ kind: "NO_QUESTION" }]);
    const refused = await publish(empty, { version: 1 }).expect(409);
    expect(refused.body.code).toBe("EXAM_NOT_READY");
    expect(refused.body.context.problems).toEqual([{ kind: "NO_QUESTION" }]);

    // A medrese that asks no zeroth question publishes no exam.
    await db()
      .delete(madrasahZerothQuestions)
      .where(eq(madrasahZerothQuestions.madrasahId, madrasahId));
    expect(
      (
        await http()
          .get(`/online-exams/${empty}`)
          .set("Authorization", muderris)
          .expect(200)
      ).body.problems
    ).toEqual([{ kind: "NO_QUESTION" }, { kind: "NO_ZEROTH" }]);
    await askZeroth("Söz veriyor musun?", ["Evet", "Hayır"]);

    const examId = await readyExam();
    const [question] = (
      await http()
        .get(`/online-exams/${examId}`)
        .set("Authorization", muderris)
        .expect(200)
    ).body.questions;
    await http()
      .put(`/online-exams/${examId}/questions/${question.id}/points`)
      .set("Authorization", muderris)
      .send({ version: 3, points: "80" })
      .expect(200);
    const points = await publish(examId, { version: 4 }).expect(409);
    expect(points.body.context.problems).toEqual([
      { kind: "POINTS", total: "80.00" },
    ]);

    await http()
      .put(`/online-exams/${examId}/questions/${question.id}/points`)
      .set("Authorization", muderris)
      .send({ version: 4, points: null })
      .expect(200);
    const passed = await publish(examId, {
      version: 5,
      startsAt: new Date(Date.now() - 2 * MINUTE).toISOString(),
    }).expect(400);
    expect(passed.body).toMatchObject({
      code: "EXAM_TIME_PASSED",
      context: { reason: "START_PASSED" },
    });
    const startsAt = inDays(1);
    const before = await publish(examId, {
      version: 5,
      startsAt: startsAt.toISOString(),
      latestStartAt: new Date(startsAt.getTime() - MINUTE).toISOString(),
    }).expect(400);
    expect(before.body.context.reason).toBe("LATEST_BEFORE_START");
    expect((await publish(examId, { version: 4 }).expect(409)).body.code).toBe(
      "EXAM_STALE"
    );
    expect(await db().select().from(lessons)).toHaveLength(0);
  });

  it("takes it back until it opens: the celse goes and the draft stays", async () => {
    const examId = await readyExam();
    await publish(examId, { version: 3, startsAt: inDays(2) }).expect(200);
    const lessonId = (await celseOf(examId)) as string;

    const back = await unpublish(examId, 4).expect(200);
    expect(back.body).toMatchObject({
      status: "DRAFT",
      startsAt: null,
      latestStartAt: null,
      version: 5,
    });
    expect(back.body.questions).toHaveLength(1);
    expect(
      await db().select().from(lessons).where(eq(lessons.id, lessonId))
    ).toEqual([]);
    expect(await db().select().from(lessonExams)).toEqual([]);
    const audit = await db()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, lessonId));
    expect(audit.map((a) => a.action)).toEqual(["lesson.delete"]);
    expect((await unpublish(examId, 5).expect(409)).body.code).toBe(
      "EXAM_NOT_PUBLISHED"
    );

    // Opened now, it can no longer be taken back.
    const now = await publish(examId, { version: 5 }).expect(200);
    expect(now.body.status).toBe("OPEN");
    expect((await unpublish(examId, 6).expect(409)).body.code).toBe(
      "EXAM_LOCKED"
    );
  });

  it("keeps the session plan off its celse's time, cancel and hide", async () => {
    const examId = await readyExam();
    await publish(examId, { version: 3, startsAt: inDays(4) }).expect(200);
    const lessonId = (await celseOf(examId)) as string;
    const courseVersion = async () =>
      (
        await db()
          .select({ version: courses.version })
          .from(courses)
          .where(eq(courses.id, ids.courseId))
      )[0].version;

    const moved = await http()
      .patch(`/lessons/${lessonId}`)
      .set("Authorization", muderris)
      .send({ version: await courseVersion(), scheduledAt: inDays(5) })
      .expect(409);
    expect(moved.body).toMatchObject({
      code: "ONLINE_EXAM_SESSION",
      context: { examId },
    });
    expect(
      (
        await http()
          .post(`/lessons/${lessonId}/cancel`)
          .set("Authorization", muderris)
          .send({ version: await courseVersion() })
          .expect(409)
      ).body.code
    ).toBe("ONLINE_EXAM_SESSION");
    expect(
      (
        await http()
          .delete(`/lessons/${lessonId}`)
          .set("Authorization", muderris)
          .expect(409)
      ).body.code
    ).toBe("ONLINE_EXAM_SESSION");
    // Anything else of the celse may change.
    await http()
      .patch(`/lessons/${lessonId}`)
      .set("Authorization", muderris)
      .send({ version: await courseVersion(), title: "Ara sınav, birinci bab" })
      .expect(200);

    const planned = await http()
      .post(`/courses/${ids.courseId}/sessions/batch`)
      .set("Authorization", muderris)
      .send({
        title: "Elle çoktan seçmeli",
        weekdays: [1],
        startTime: "10:00",
        durationMinutes: 60,
        timeZone: "Europe/Istanbul",
        startDate: "2027-01-04",
        count: 1,
        exam: { format: "MULTIPLE_CHOICE" },
      })
      .expect(400);
    expect(planned.body.code).toBe("VALIDATION_ERROR");
  });

  it("publishes only with exam.prepare", async () => {
    const examId = await readyExam();
    // A ders nazırı with session.manage, who plans celses, does not prepare exams.
    const refused = await publish(
      examId,
      { version: 3 },
      bearerOf(CAST.SESSION)
    ).expect(403);
    expect(refused.body.code).toBe("AUTHZ_FORBIDDEN");
  });
});
