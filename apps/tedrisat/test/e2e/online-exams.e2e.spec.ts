import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
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
 * Preparing online multiple-choice exams (MDRS-299): the course's numbered
 * topics, a draft with no celse, its questions and their points, every write
 * held to the version the page holds, and all of it behind `exam.prepare`.
 */
describe("online exams, preparation (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: (typeof CAST)[keyof typeof CAST]) => bearerOf(sub);

  const newExam = async (title = "Ara sınav") =>
    (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", as(CAST.MUDERRIS))
        .send({ title })
        .expect(201)
    ).body.id as string;
  const draft = async (examId: string) =>
    (
      await http()
        .get(`/online-exams/${examId}`)
        .set("Authorization", as(CAST.MUDERRIS))
        .expect(200)
    ).body;
  const topic = async (name: string, number?: number) =>
    (
      await http()
        .post(`/courses/${ids.courseId}/exam-topics`)
        .set("Authorization", as(CAST.MUDERRIS))
        .send(number === undefined ? { name } : { name, number })
        .expect(201)
    ).body as { id: string; number: number; name: string };

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
      "audit_log"
    );
    ids = await seedCourseScope(db());
  });

  afterAll(async () => {
    await app.close();
  });

  it("numbers the course's topics, and refuses a name or a number twice", async () => {
    const kiyas = await topic("Kıyas");
    const icma = await topic("İcma");
    const nesih = await topic("Nesih ve mensuh", 7);
    expect([kiyas.number, icma.number, nesih.number]).toEqual([1, 2, 7]);

    const again = (body: object) =>
      http()
        .post(`/courses/${ids.courseId}/exam-topics`)
        .set("Authorization", as(CAST.MUDERRIS))
        .send(body);
    expect((await again({ name: "icma" }).expect(409)).body.code).toBe(
      "TOPIC_EXISTS"
    );
    expect(
      (await again({ name: "Sünnet", number: 7 }).expect(409)).body.code
    ).toBe("TOPIC_NUMBER_TAKEN");
    expect(
      (await again({ name: "Bir iki üç dört" }).expect(400)).body.code
    ).toBe("TOPIC_TOO_LONG");

    const renumbered = await http()
      .patch(`/courses/${ids.courseId}/exam-topics/${kiyas.id}`)
      .set("Authorization", as(CAST.MUDERRIS))
      .send({ number: 3, name: "Kıyas-ı fıkhi" })
      .expect(200);
    expect(renumbered.body).toMatchObject({ number: 3, name: "Kıyas-ı fıkhi" });
    const listed = await http()
      .get(`/courses/${ids.courseId}/exam-topics`)
      .set("Authorization", as(CAST.MUDERRIS))
      .expect(200);
    expect(listed.body.map((t: { number: number }) => t.number)).toEqual([
      2, 3, 7,
    ]);
  });

  it("opens a draft with no celse, and keeps a question as written", async () => {
    const kiyas = await topic("Kıyas");
    const examId = await newExam();
    const listed = await http()
      .get(`/courses/${ids.courseId}/online-exams`)
      .set("Authorization", as(CAST.MUDERRIS))
      .expect(200);
    expect(listed.body).toEqual([
      expect.objectContaining({
        id: examId,
        title: "Ara sınav",
        questionCount: 0,
        status: "DRAFT",
      }),
    ]);

    const first = await draft(examId);
    expect(first).toMatchObject({
      durationMinutes: 60,
      questions: [],
      status: "DRAFT",
      version: 1,
    });
    expect(first.courseTopics).toEqual([
      expect.objectContaining({ id: kiyas.id, number: 1, picked: false }),
    ]);

    const added = await http()
      .post(`/online-exams/${examId}/questions`)
      .set("Authorization", as(CAST.MUDERRIS))
      .send({ version: 1 })
      .expect(201);
    expect(added.body.version).toBe(2);
    expect(added.body.question).toMatchObject({
      number: 1,
      complete: false,
      lacks: ["text", "option", "correct", "topic"],
    });
    const questionId = added.body.question.id as string;

    // The topic typed by its number is picked for the exam with the question.
    const saved = await http()
      .put(`/online-exams/${examId}/questions/${questionId}`)
      .set("Authorization", as(CAST.MUDERRIS))
      .send({
        version: 2,
        text: "Kıyasın rükünleri kaç tanedir?",
        options: [
          { text: "Üç", correct: false },
          { text: "Dört", correct: true },
        ],
        answerMode: "SINGLE",
        topicIds: [kiyas.id],
      })
      .expect(200);
    expect(saved.body.version).toBe(3);
    expect(saved.body.question).toMatchObject({
      complete: true,
      lacks: [],
      points: "100.00",
      options: [
        expect.objectContaining({ text: "Üç", correct: false }),
        expect.objectContaining({ text: "Dört", correct: true }),
      ],
      topicIds: [kiyas.id],
    });
    const after = await draft(examId);
    expect(after.topicIds).toEqual([kiyas.id]);
    expect(after.courseTopics[0]).toMatchObject({
      picked: true,
      questionCount: 1,
    });

    const audit = await db()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, questionId));
    expect(audit.map((a) => a.action).sort()).toEqual(["exam_question.save"]);
  });

  it("refuses an old version, check boxes with one correct option, and a topic of another course", async () => {
    const examId = await newExam();
    const added = await http()
      .post(`/online-exams/${examId}/questions`)
      .set("Authorization", as(CAST.MUDERRIS))
      .send({ version: 1 })
      .expect(201);
    const questionId = added.body.question.id as string;
    const save = (body: object) =>
      http()
        .put(`/online-exams/${examId}/questions/${questionId}`)
        .set("Authorization", as(CAST.MUDERRIS))
        .send({
          text: "Soru",
          options: [
            { text: "A", correct: true },
            { text: "B", correct: false },
          ],
          answerMode: "SINGLE",
          topicIds: [],
          ...body,
        });

    expect((await save({ version: 1 }).expect(409)).body.code).toBe(
      "EXAM_STALE"
    );
    expect(
      (
        await save({
          version: 2,
          answerMode: "MULTIPLE",
          scoring: "ALL_OR_NOTHING",
        }).expect(400)
      ).body.code
    ).toBe("QUESTION_MODE_INVALID");
    const elsewhere = await http()
      .post(`/courses/${ids.otherCourseId}/exam-topics`)
      .set("Authorization", bearerOf(CAST.ADMIN))
      .send({ name: "Başka" })
      .expect(201);
    expect(
      (await save({ version: 2, topicIds: [elsewhere.body.id] }).expect(400))
        .body.code
    ).toBe("TOPIC_NOT_FOUND");
    // Nothing of the refused writes was kept.
    expect((await draft(examId)).version).toBe(2);
  });

  it("shares the points left exactly, and refuses own points past 100", async () => {
    const examId = await newExam();
    let version = 1;
    const questionIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const added = await http()
        .post(`/online-exams/${examId}/questions`)
        .set("Authorization", as(CAST.MUDERRIS))
        .send({ version })
        .expect(201);
      version = added.body.version;
      questionIds.push(added.body.question.id);
    }
    expect(
      (await draft(examId)).questions.map((q: { points: string }) => q.points)
    ).toEqual(["33.33", "33.33", "33.33"]);
    const points = (questionId: string, value: string | null) =>
      http()
        .put(`/online-exams/${examId}/questions/${questionId}/points`)
        .set("Authorization", as(CAST.MUDERRIS))
        .send({ version, points: value });
    const own = await points(questionIds[0], "40").expect(200);
    version = own.body.version;
    expect(own.body.questions.map((q: { points: string }) => q.points)).toEqual(
      ["40.00", "30.00", "30.00"]
    );
    const over = await points(questionIds[1], "60").expect(409);
    expect(over.body).toMatchObject({
      code: "POINTS_OVER_TOTAL",
      context: { pointsLeft: "60.00" },
    });
    const removed = await http()
      .delete(
        `/online-exams/${examId}/questions/${questionIds[0]}?version=${version}`
      )
      .set("Authorization", as(CAST.MUDERRIS))
      .expect(200);
    expect(removed.body.version).toBe(version + 1);
    expect((await draft(examId)).pointsTotal).toBe("100.00");
  });

  it("deletes a topic no question carries, and refuses one that questions carry, naming them", async () => {
    const kiyas = await topic("Kıyas");
    const icma = await topic("İcma");
    const examId = await newExam();
    const added = await http()
      .post(`/online-exams/${examId}/questions`)
      .set("Authorization", as(CAST.MUDERRIS))
      .send({ version: 1 })
      .expect(201);
    await http()
      .put(`/online-exams/${examId}/questions/${added.body.question.id}`)
      .set("Authorization", as(CAST.MUDERRIS))
      .send({
        version: 2,
        text: "Kıyasın rükünleri kaç tanedir?",
        options: [
          { text: "Üç", correct: false },
          { text: "Dört", correct: true },
        ],
        answerMode: "SINGLE",
        topicIds: [kiyas.id],
      })
      .expect(200);
    // İcma is picked for the exam, but no question carries it.
    await http()
      .patch(`/online-exams/${examId}`)
      .set("Authorization", as(CAST.MUDERRIS))
      .send({ version: 3, topicIds: [kiyas.id, icma.id] })
      .expect(200);
    const remove = (topicId: string) =>
      http()
        .delete(`/courses/${ids.courseId}/exam-topics/${topicId}`)
        .set("Authorization", as(CAST.MUDERRIS));

    const inUse = await remove(kiyas.id).expect(409);
    expect(inUse.body).toMatchObject({
      code: "TOPIC_IN_USE",
      context: {
        topicId: kiyas.id,
        questions: [{ examId, examTitle: "Ara sınav", number: 1 }],
      },
    });

    await remove(icma.id).expect(204);
    const after = await draft(examId);
    expect(after.version).toBe(5);
    expect(after.topicIds).toEqual([kiyas.id]);
    expect(after.courseTopics.map((t: { id: string }) => t.id)).toEqual([
      kiyas.id,
    ]);
    expect((await remove(icma.id).expect(404)).body.code).toBe(
      "TOPIC_NOT_FOUND"
    );
    const audit = await db()
      .select({ action: auditLog.action, details: auditLog.details })
      .from(auditLog)
      .where(eq(auditLog.entityId, icma.id));
    expect(audit.map((a) => a.action).sort()).toEqual([
      "exam_topic.create",
      "exam_topic.remove",
    ]);
    // Only the course team removes a topic.
    await remove(kiyas.id).set("Authorization", as(CAST.TALEBE)).expect(403);
  });

  it("asks exam.prepare on the course: a hoca and a nazır given it, not session.manage or a talebe", async () => {
    const examId = await newExam();
    for (const who of [
      CAST.SESSION,
      CAST.TALEBE,
      CAST.STRANGER,
      CAST.OTHER_COURSE,
    ]) {
      await http()
        .get(`/online-exams/${examId}`)
        .set("Authorization", as(who))
        .expect(403);
      await http()
        .get(`/courses/${ids.courseId}/exam-topics`)
        .set("Authorization", as(who))
        .expect(403);
    }
    await db().insert(permissionGrants).values({
      scopeType: "course",
      scopeId: ids.courseId,
      userId: CAST.BARE,
      grantedBy: CAST.MANAGER,
      permission: "exam.prepare",
    });
    await http()
      .get(`/online-exams/${examId}`)
      .set("Authorization", as(CAST.BARE))
      .expect(200);
    await http()
      .get("/online-exams/00000000-0000-4000-8000-000000000000")
      .set("Authorization", as(CAST.MUDERRIS))
      .expect(404);
  });
});
