import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import {
  examAttempts,
  examTabSwitches,
  zerothAnswers,
} from "../../src/database/schema/exam-attempt.schema";
import {
  examOptions,
  examQuestions,
  onlineExams,
  zerothOptions,
} from "../../src/database/schema/online-exam.schema";
import { AnswerMode } from "../../src/online-exam/domain/online-exam";
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

/**
 * A talebe takes a published online exam (MDRS-299): the briefing with the
 * zeroth question, the start in an order of their own, every answer saved by
 * the page's count, the attempt moving to the last page that opens it, the
 * server's clock, switches counted, and the finish with its score. An exam
 * is published here by writing what publishing writes (its celse, the
 * latest start, the zeroth question), which another change makes.
 */
describe("online exams, a talebe's sitting (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const talebe = bearerOf(CAST.TALEBE);
  const A = "page-aaaa-1111";
  let lessons = 0;
  const B = "page-bbbb-2222";

  interface IPublished {
    lessonId: string;
    examId: string;
    zeroth: string[];
    questions: Array<{ id: string; correct: string; wrong: string }>;
  }

  /** A published exam of two radio questions (A right), its celse a minute ago. */
  const publish = async (
    values: {
      startsAt?: Date;
      latestStartAt?: Date | null;
      published?: boolean;
    } = {}
  ): Promise<IPublished> => {
    const lessonId = await insertLiveLesson(db(), ids.weekId, lessons++, {
      scheduledAt: values.startsAt ?? new Date(Date.now() - 60_000),
    });
    const [exam] = await db()
      .insert(onlineExams)
      .values({
        courseId: ids.courseId,
        lessonId,
        title: "Ara sınav",
        durationMinutes: 30,
        instructions: "Kalem kâğıt yanında olsun.",
        zerothQuestion: "Bu hadisi ne zaman öğrendin?",
        latestStartAt:
          values.latestStartAt === undefined
            ? new Date(Date.now() + 10 * 60_000)
            : values.latestStartAt,
        publishedAt: values.published === false ? null : new Date(),
        createdBy: CAST.MUDERRIS,
      })
      .returning();
    const zeroth = await db()
      .insert(zerothOptions)
      .values([
        { examId: exam.id, position: 0, text: "Bu dönem" },
        { examId: exam.id, position: 1, text: "Daha önce" },
      ])
      .returning();
    const questions: IPublished["questions"] = [];
    for (const position of [0, 1]) {
      const [q] = await db()
        .insert(examQuestions)
        .values({
          examId: exam.id,
          position,
          text: `Soru ${position + 1}`,
          answerMode: AnswerMode.SINGLE,
        })
        .returning();
      const [right, wrong] = await db()
        .insert(examOptions)
        .values([
          { questionId: q.id, position: 0, text: "Doğru", correct: true },
          { questionId: q.id, position: 1, text: "Yanlış", correct: false },
        ])
        .returning();
      questions.push({ id: q.id, correct: right.id, wrong: wrong.id });
    }
    return {
      lessonId,
      examId: exam.id,
      zeroth: zeroth.map((z) => z.id),
      questions,
    };
  };

  const at = (exam: IPublished, path = "") =>
    `/lessons/${exam.lessonId}/online-exam${path}`;
  const briefing = (exam: IPublished, who = talebe) =>
    http().get(at(exam)).set("Authorization", who);
  const post = (exam: IPublished, path: string, body: object) =>
    http().post(at(exam, path)).set("Authorization", talebe).send(body);
  const answer = (
    exam: IPublished,
    questionId: string,
    body: {
      holderId: string;
      seq: number;
      optionIds: string[];
      skipped?: boolean;
    }
  ) =>
    http()
      .put(at(exam, `/attempt/answers/${questionId}`))
      .set("Authorization", talebe)
      .send({ skipped: false, ...body });
  const answerZeroth = (exam: IPublished, optionId: string) =>
    http()
      .put(at(exam, "/zeroth-answer"))
      .set("Authorization", talebe)
      .send({ optionId });
  const started = async (exam: IPublished, holderId = A) => {
    await answerZeroth(exam, exam.zeroth[0]).expect(200);
    return (await post(exam, "/attempt", { holderId }).expect(201)).body;
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
      "audit_log"
    );
    ids = await seedCourseScope(db());
    lessons = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it("briefs the enrolled talebe with no question, and no one else", async () => {
    const exam = await publish();
    const res = await briefing(exam).expect(200);
    expect(res.body).toMatchObject({
      lessonId: exam.lessonId,
      courseId: ids.courseId,
      title: "Ara sınav",
      courseTitle: "Emsile ve Bina",
      durationMinutes: 30,
      questionCount: 2,
      instructions: "Kalem kâğıt yanında olsun.",
      window: "OPEN",
      zeroth: {
        question: "Bu hadisi ne zaman öğrendin?",
        options: [
          { id: exam.zeroth[0], text: "Bu dönem" },
          { id: exam.zeroth[1], text: "Daha önce" },
        ],
        answeredOptionId: null,
      },
      attempt: null,
    });
    expect(JSON.stringify(res.body)).not.toContain("Soru 1");

    for (const who of [CAST.PENDING, CAST.STRANGER, CAST.MUDERRIS]) {
      const refused = await briefing(exam, bearerOf(who));
      expect([403, 404]).toContain(refused.status);
      if (refused.status === 404)
        expect(refused.body.code).toBe("EXAM_NOT_FOUND");
    }

    // A draft has no celse a talebe can reach, and a celse that is no online exam is none.
    const draft = await publish({ published: false });
    expect((await briefing(draft).expect(404)).body.code).toBe(
      "EXAM_NOT_FOUND"
    );
  });

  it("starts only with the zeroth question answered, in an order of the talebe's own", async () => {
    const exam = await publish();
    expect(
      (await post(exam, "/attempt", { holderId: A }).expect(409)).body.code
    ).toBe("ZEROTH_UNANSWERED");
    expect(
      (await answerZeroth(exam, exam.questions[0].correct).expect(400)).body
        .code
    ).toBe("ZEROTH_OPTION_NOT_FOUND");
    await answerZeroth(exam, exam.zeroth[1]).expect(200);
    await answerZeroth(exam, exam.zeroth[0]).expect(200);

    const attempt = (await post(exam, "/attempt", { holderId: A }).expect(201))
      .body;
    expect(attempt).toMatchObject({
      status: "IN_PROGRESS",
      secondsLeft: 1800,
      switches: 0,
      answers: [],
    });
    expect(attempt.questions).toHaveLength(2);
    expect(attempt.questions.map((q: { number: number }) => q.number)).toEqual([
      1, 2,
    ]);
    expect(attempt.questions[0]).toMatchObject({
      answerMode: "SINGLE",
      points: "50.00",
    });
    expect(JSON.stringify(attempt)).not.toContain("correct");
    expect(
      [...attempt.questions.map((q: { id: string }) => q.id)].sort()
    ).toEqual(exam.questions.map((q) => q.id).sort());

    // The zeroth answer stays once the attempt has started.
    expect(
      (await answerZeroth(exam, exam.zeroth[1]).expect(409)).body.code
    ).toBe("ZEROTH_ANSWER_LOCKED");
    const [kept] = await db()
      .select()
      .from(zerothAnswers)
      .where(eq(zerothAnswers.examId, exam.examId));
    expect(kept.optionId).toBe(exam.zeroth[0]);
    expect((await briefing(exam).expect(200)).body.attempt).toMatchObject({
      status: "IN_PROGRESS",
    });
  });

  it("refuses to start before the earliest start and after the latest", async () => {
    const early = await publish({ startsAt: new Date(Date.now() + 3_600_000) });
    expect((await briefing(early).expect(200)).body.window).toBe("BEFORE");
    expect(
      (await answerZeroth(early, early.zeroth[0]).expect(409)).body.code
    ).toBe("EXAM_NOT_OPEN");

    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    ids = await seedCourseScope(db());
    const late = await publish({
      startsAt: new Date(Date.now() - 3_600_000),
      latestStartAt: new Date(Date.now() - 60_000),
    });
    expect((await briefing(late).expect(200)).body.window).toBe("CLOSED");
    expect(
      (await post(late, "/attempt", { holderId: A }).expect(409)).body.code
    ).toBe("EXAM_NOT_OPEN");
  });

  it("saves every answer by the page's count, and only what fits the question", async () => {
    const exam = await publish();
    await started(exam);
    const [q1] = exam.questions;

    const saved = await answer(exam, q1.id, {
      holderId: A,
      seq: 2,
      optionIds: [q1.correct],
    }).expect(200);
    expect(saved.body).toMatchObject({
      optionIds: [q1.correct],
      written: true,
    });

    // An earlier save that arrives late writes nothing.
    const late = await answer(exam, q1.id, {
      holderId: A,
      seq: 1,
      optionIds: [q1.wrong],
    }).expect(200);
    expect(late.body).toMatchObject({
      optionIds: [q1.correct],
      written: false,
    });

    expect(
      (
        await answer(exam, q1.id, {
          holderId: A,
          seq: 3,
          optionIds: [q1.correct, q1.wrong],
        }).expect(400)
      ).body.code
    ).toBe("ANSWER_INVALID");
    expect(
      (
        await answer(exam, q1.id, {
          holderId: A,
          seq: 3,
          optionIds: [exam.questions[1].correct],
        }).expect(400)
      ).body.code
    ).toBe("ANSWER_INVALID");

    const resumed = (
      await post(exam, "/attempt/resume", { holderId: A }).expect(200)
    ).body;
    expect(resumed.answers).toEqual([
      { questionId: q1.id, optionIds: [q1.correct], skipped: false },
    ]);
    expect(resumed.currentQuestionId).toBe(q1.id);
  });

  it("moves the attempt to the last page that opens it, which alone saves and finishes", async () => {
    const exam = await publish();
    await started(exam, A);
    const [q1, q2] = exam.questions;
    await answer(exam, q1.id, {
      holderId: A,
      seq: 5,
      optionIds: [q1.correct],
    }).expect(200);

    await post(exam, "/attempt/resume", { holderId: B }).expect(200);
    expect(
      (
        await answer(exam, q2.id, {
          holderId: A,
          seq: 6,
          optionIds: [q2.correct],
        }).expect(409)
      ).body.code
    ).toBe("ATTEMPT_HELD_ELSEWHERE");
    expect(
      (await post(exam, "/attempt/finish", { holderId: A }).expect(409)).body
        .code
    ).toBe("ATTEMPT_HELD_ELSEWHERE");

    // The new page counts its saves from 1 again.
    await answer(exam, q2.id, {
      holderId: B,
      seq: 1,
      optionIds: [q2.wrong],
    }).expect(200);

    const finished = (
      await post(exam, "/attempt/finish", { holderId: B }).expect(200)
    ).body;
    expect(finished).toMatchObject({
      status: "FINISHED",
      finishedBy: "TALEBE",
      questions: [],
      answers: [],
    });
    const [row] = await db()
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.examId, exam.examId));
    expect(row.scoreHundredths).toBe(5000);

    expect(
      (await post(exam, "/attempt", { holderId: A }).expect(409)).body.code
    ).toBe("EXAM_ALREADY_TAKEN");
    expect((await briefing(exam).expect(200)).body.attempt).toMatchObject({
      status: "FINISHED",
      finishedBy: "TALEBE",
    });
  });

  it("counts a switch to another tab with its time, and erases nothing", async () => {
    const exam = await publish();
    await started(exam);
    const [q1] = exam.questions;
    await answer(exam, q1.id, {
      holderId: A,
      seq: 1,
      optionIds: [q1.correct],
    }).expect(200);

    const back = (
      await post(exam, "/attempt/switch", { holderId: A }).expect(200)
    ).body;
    expect(back.switches).toBe(1);
    expect(back.answers).toHaveLength(1);
    expect(
      (await post(exam, "/attempt/switch", { holderId: B }).expect(409)).body
        .code
    ).toBe("ATTEMPT_HELD_ELSEWHERE");
    const kept = await db().select().from(examTabSwitches);
    expect(kept).toHaveLength(1);
  });

  it("runs the clock only while the page calls, and ends the attempt when the time is up", async () => {
    const exam = await publish();
    await started(exam);
    const [row] = await db()
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.examId, exam.examId));

    // Away for an hour: only the cap counts, so the time is not lost.
    await db()
      .update(examAttempts)
      .set({ countedAt: new Date(Date.now() - 3_600_000) })
      .where(eq(examAttempts.id, row.id));
    const clock = (
      await post(exam, "/attempt/clock", { holderId: A }).expect(200)
    ).body;
    expect(clock.status).toBe("IN_PROGRESS");
    expect(clock.secondsLeft).toBeGreaterThanOrEqual(1800 - 91);

    // Five seconds left, and thirty since the last call.
    await db()
      .update(examAttempts)
      .set({ usedSeconds: 1795, countedAt: new Date(Date.now() - 30_000) })
      .where(eq(examAttempts.id, row.id));
    expect(
      (await post(exam, "/attempt/clock", { holderId: A }).expect(200)).body
    ).toEqual({ secondsLeft: 0, status: "FINISHED" });
    const [q1] = exam.questions;
    expect(
      (
        await answer(exam, q1.id, {
          holderId: A,
          seq: 9,
          optionIds: [q1.correct],
        }).expect(409)
      ).body.code
    ).toBe("ATTEMPT_ENDED");
    expect((await briefing(exam).expect(200)).body.attempt).toMatchObject({
      status: "FINISHED",
      finishedBy: "TIME",
    });
  });

  it("finishes the attempts of an exam the team closed early", async () => {
    const exam = await publish();
    await started(exam);
    await db()
      .update(onlineExams)
      .set({ closedEarlyAt: new Date(Date.now() - 1_000) })
      .where(eq(onlineExams.id, exam.examId));
    const res = (await briefing(exam).expect(200)).body;
    expect(res.window).toBe("CLOSED");
    expect(res.attempt).toMatchObject({
      status: "FINISHED",
      finishedBy: "CLOSED_EARLY",
    });
    expect(
      (await post(exam, "/attempt/finish", { holderId: A }).expect(200)).body
    ).toMatchObject({ status: "FINISHED", finishedBy: "CLOSED_EARLY" });
  });
});
