import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { purgeCourses } from "../../src/course/course-purge";
import { DatabaseService } from "../../src/database/database.service";
import { lessons } from "../../src/database/schema/course.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import {
  examQuestions,
  onlineExams,
} from "../../src/database/schema/online-exam.schema";
import {
  practiceAnswers,
  practiceAttempts,
} from "../../src/database/schema/practice.schema";
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
 * Çalışma soruları (MDRS-248): the team prepares a çalışma seti as an online
 * exam of kind PRACTICE and publishes it with no celse; the course's talebe
 * solve it as often as they like, see how it went and the correct options
 * once they finish, and nothing before.
 */
describe("çalışma setleri (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const muderris = bearerOf(CAST.MUDERRIS);
  const talebe = bearerOf(CAST.TALEBE);

  interface ISet {
    id: string;
    version: number;
    /** The complete questions, each with its correct and a wrong option's text. */
    questions: Array<{ id: string }>;
  }

  /**
   * A draft set of the course with two complete radio questions (the right
   * answer "Doğru") and one incomplete question.
   */
  const draftSet = async (title = "Kıyas tekrar"): Promise<ISet> => {
    const id = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title, kind: "PRACTICE" })
        .expect(201)
    ).body.id as string;
    const topics = await http()
      .get(`/courses/${ids.courseId}/exam-topics`)
      .set("Authorization", muderris)
      .expect(200);
    const topic =
      (topics.body as Array<{ id: string }>)[0]?.id ??
      (
        await http()
          .post(`/courses/${ids.courseId}/exam-topics`)
          .set("Authorization", muderris)
          .send({ name: "Kıyas" })
          .expect(201)
      ).body.id;
    let version = 1;
    const questions: ISet["questions"] = [];
    for (const n of [1, 2, 3]) {
      const added = await http()
        .post(`/online-exams/${id}/questions`)
        .set("Authorization", muderris)
        .send({ version })
        .expect(201);
      version = added.body.version;
      if (n === 3) break; // left empty: incomplete
      const saved = await http()
        .put(`/online-exams/${id}/questions/${added.body.question.id}`)
        .set("Authorization", muderris)
        .send({
          version,
          text: `Soru ${n}`,
          options: [
            { text: "Doğru", correct: true },
            { text: "Yanlış", correct: false },
          ],
          answerMode: "SINGLE",
          topicIds: [topic],
        })
        .expect(200);
      version = saved.body.version;
      questions.push({ id: added.body.question.id });
    }
    return { id, version, questions };
  };

  const publish = async (set: ISet) => {
    const res = await http()
      .post(`/online-exams/${set.id}/publish`)
      .set("Authorization", muderris)
      .send({ version: set.version })
      .expect(200);
    set.version = res.body.version;
    return res;
  };

  const start = (setId: string, who = talebe) =>
    http().post(`/practice-sets/${setId}/attempts`).set("Authorization", who);
  const read = (attemptId: string, who = talebe) =>
    http().get(`/practice-attempts/${attemptId}`).set("Authorization", who);
  const answer = (attemptId: string, questionId: string, optionIds: string[]) =>
    http()
      .put(`/practice-attempts/${attemptId}/answers/${questionId}`)
      .set("Authorization", talebe)
      .send({ optionIds });
  const finish = (attemptId: string) =>
    http()
      .post(`/practice-attempts/${attemptId}/finish`)
      .set("Authorization", talebe);
  const courseSets = (who = talebe) =>
    http()
      .get(`/courses/${ids.courseId}/practice-sets`)
      .set("Authorization", who);

  interface IAttemptQuestion {
    id: string;
    options: Array<{ id: string; text: string; correct?: boolean }>;
  }
  const optionOf = (q: IAttemptQuestion, text: string) =>
    q.options.find((o) => o.text === text)?.id as string;

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      "notifications",
      ...COURSE_TREE_TABLES,
      "audit_log"
    );
    ids = await seedCourseScope(db());
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps a draft from every talebe", async () => {
    const set = await draftSet();
    expect((await courseSets().expect(200)).body).toEqual([]);
    expect(
      (
        await http()
          .get("/my-practice-sets")
          .set("Authorization", talebe)
          .expect(200)
      ).body
    ).toEqual([]);
    expect((await start(set.id).expect(404)).body.code).toBe(
      "PRACTICE_SET_NOT_FOUND"
    );
  });

  it("publishes with no celse, no notification and no length, off the exam list", async () => {
    // No complete question: not ready.
    const empty = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title: "Boş", kind: "PRACTICE" })
        .expect(201)
    ).body.id as string;
    const refused = await http()
      .post(`/online-exams/${empty}/publish`)
      .set("Authorization", muderris)
      .send({ version: 1 })
      .expect(409);
    expect(refused.body.code).toBe("EXAM_NOT_READY");
    expect(refused.body.context.problems).toEqual([{ kind: "NO_QUESTION" }]);

    const lessonsBefore = (await db().select().from(lessons)).length;
    const set = await draftSet();
    const res = await publish(set);
    expect(res.body).toMatchObject({
      kind: "PRACTICE",
      status: "OPEN",
      startsAt: null,
      latestStartAt: null,
      problems: [],
    });
    const [row] = await db()
      .select()
      .from(onlineExams)
      .where(eq(onlineExams.id, set.id));
    expect(row.lessonId).toBeNull();
    expect(row.publishedAt).not.toBeNull();
    expect((await db().select().from(lessons)).length).toBe(lessonsBefore);
    expect(
      await db()
        .select()
        .from(notifications)
        .where(eq(notifications.userId, CAST.TALEBE))
    ).toEqual([]);

    // The exams list leaves the sets out unless asked for them.
    const exams = await http()
      .get(`/courses/${ids.courseId}/online-exams`)
      .set("Authorization", muderris)
      .expect(200);
    expect(exams.body).toEqual([]);
    const sets = await http()
      .get(`/courses/${ids.courseId}/online-exams?kind=PRACTICE`)
      .set("Authorization", muderris)
      .expect(200);
    expect(
      (sets.body as Array<{ id: string; kind: string; status: string }>).map(
        (s) => [s.kind, s.status]
      )
    ).toEqual([
      ["PRACTICE", "OPEN"],
      ["PRACTICE", "DRAFT"],
    ]);

    // Locked as a published exam is.
    await http()
      .post(`/online-exams/${set.id}/questions`)
      .set("Authorization", muderris)
      .send({ version: set.version })
      .expect(409);
  });

  it("refuses an exam's routes on a set", async () => {
    const set = await draftSet();
    const points = await http()
      .put(`/online-exams/${set.id}/questions/${set.questions[0].id}/points`)
      .set("Authorization", muderris)
      .send({ version: set.version, points: "10" })
      .expect(409);
    expect(points.body.code).toBe("EXAM_KIND_MISMATCH");
    const length = await http()
      .patch(`/online-exams/${set.id}`)
      .set("Authorization", muderris)
      .send({ version: set.version, durationMinutes: 30 })
      .expect(409);
    expect(length.body.code).toBe("EXAM_KIND_MISMATCH");
    await publish(set);
    for (const path of ["results", `results/${CAST.TALEBE}`]) {
      const res = await http()
        .get(`/online-exams/${set.id}/${path}`)
        .set("Authorization", muderris)
        .expect(409);
      expect(res.body.code).toBe("EXAM_KIND_MISMATCH");
    }
    const close = await http()
      .post(`/online-exams/${set.id}/close`)
      .set("Authorization", muderris)
      .expect(409);
    expect(close.body.code).toBe("EXAM_KIND_MISMATCH");

    // And a set's routes on an exam: no such set.
    const exam = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title: "Ara sınav" })
        .expect(201)
    ).body.id as string;
    await db()
      .update(onlineExams)
      .set({ publishedAt: new Date() })
      .where(eq(onlineExams.id, exam));
    expect((await start(exam).expect(404)).body.code).toBe(
      "PRACTICE_SET_NOT_FOUND"
    );
  });

  it("starts, saves each answer, finishes and shows the result, never the correct options before", async () => {
    const set = await draftSet();
    await publish(set);

    const listed = (await courseSets().expect(200)).body;
    expect(listed).toEqual([
      expect.objectContaining({
        id: set.id,
        courseId: ids.courseId,
        courseTitle: "Emsile ve Bina",
        title: "Kıyas tekrar",
        questionCount: 2,
        attemptCount: 0,
        lastPercent: null,
        openAttemptId: null,
      }),
    ]);

    const started = (await start(set.id).expect(201)).body;
    expect(started).toMatchObject({
      setId: set.id,
      courseId: ids.courseId,
      title: "Kıyas tekrar",
      status: "IN_PROGRESS",
      finishedAt: null,
      result: null,
    });
    // Only the complete questions, in an order of the attempt's own.
    expect(started.questions).toHaveLength(2);
    expect(started.questions.map((q: { id: string }) => q.id).sort()).toEqual(
      set.questions.map((q) => q.id).sort()
    );
    expect(JSON.stringify(started)).not.toContain("correct");

    const [first, second] = started.questions as IAttemptQuestion[];
    const saved = await answer(started.id, first.id, [
      optionOf(first, "Doğru"),
    ]).expect(200);
    expect(saved.body.optionIds).toEqual([optionOf(first, "Doğru")]);
    await answer(started.id, second.id, [optionOf(second, "Doğru")]).expect(
      200
    );
    // Changed: the last save wins.
    await answer(started.id, second.id, [optionOf(second, "Yanlış")]).expect(
      200
    );

    // Not one of its options, two on a radio question, another question.
    expect(
      (
        await answer(started.id, first.id, [optionOf(second, "Doğru")]).expect(
          400
        )
      ).body.code
    ).toBe("PRACTICE_ANSWER_INVALID");
    expect(
      (
        await answer(
          started.id,
          first.id,
          first.options.map((o) => o.id)
        ).expect(400)
      ).body.code
    ).toBe("PRACTICE_ANSWER_INVALID");
    expect(
      (await answer(started.id, ids.courseId, []).expect(404)).body.code
    ).toBe("PRACTICE_QUESTION_NOT_FOUND");

    const during = (await read(started.id).expect(200)).body;
    expect(JSON.stringify(during)).not.toContain("correct");
    expect(during.currentQuestionId).toBe(second.id);
    expect(during.result).toBeNull();

    // Starting again goes on with the attempt in progress.
    const again = (await start(set.id).expect(201)).body;
    expect(again.id).toBe(started.id);
    expect(again.questions.map((q: { id: string }) => q.id)).toEqual(
      started.questions.map((q: { id: string }) => q.id)
    );
    expect((await courseSets().expect(200)).body[0].openAttemptId).toBe(
      started.id
    );

    const done = (await finish(started.id).expect(200)).body;
    expect(done.status).toBe("FINISHED");
    expect(done.result).toEqual({
      correct: 1,
      wrong: 1,
      blank: 0,
      total: 2,
      percent: "50.00",
    });
    const firstDone = done.questions.find(
      (q: { id: string }) => q.id === first.id
    );
    expect(firstDone).toMatchObject({
      outcome: "CORRECT",
      part: "1.00",
      chosenOptionIds: [optionOf(first, "Doğru")],
    });
    expect(
      firstDone.options.map((o: { text: string; correct: boolean }) => [
        o.text,
        o.correct,
      ])
    ).toEqual(
      expect.arrayContaining([
        ["Doğru", true],
        ["Yanlış", false],
      ])
    );
    expect(
      done.questions.find((q: { id: string }) => q.id === second.id)
    ).toMatchObject({ outcome: "WRONG", part: "0.00" });
    // Reading it again says the same; finishing again changes nothing.
    expect((await read(started.id).expect(200)).body.result).toEqual(
      done.result
    );
    expect((await finish(started.id).expect(200)).body.finishedAt).toBe(
      done.finishedAt
    );
    expect((await answer(started.id, first.id, []).expect(409)).body.code).toBe(
      "PRACTICE_ATTEMPT_FINISHED"
    );

    // A new attempt once it is finished, left blank this time.
    const next = (await start(set.id).expect(201)).body;
    expect(next.id).not.toBe(started.id);
    expect((await finish(next.id).expect(200)).body.result).toMatchObject({
      correct: 0,
      wrong: 0,
      blank: 2,
      percent: "0.00",
    });

    const attempts = (
      await http()
        .get(`/practice-sets/${set.id}/attempts`)
        .set("Authorization", talebe)
        .expect(200)
    ).body;
    expect(attempts.map((a: { id: string }) => a.id)).toEqual([
      next.id,
      started.id,
    ]);
    const mine = (
      await http()
        .get("/my-practice-sets")
        .set("Authorization", talebe)
        .expect(200)
    ).body;
    expect(mine).toEqual([
      expect.objectContaining({
        id: set.id,
        courseTitle: "Emsile ve Bina",
        attemptCount: 2,
        lastPercent: "0.00",
        openAttemptId: null,
      }),
    ]);
  });

  it("refuses anyone who is no talebe of the course, and anyone else's attempt", async () => {
    const set = await draftSet();
    await publish(set);
    const attempt = (await start(set.id).expect(201)).body;
    for (const who of [CAST.PENDING, CAST.STRANGER, CAST.MUDERRIS]) {
      expect((await courseSets(bearerOf(who)).expect(403)).body.code).toBe(
        "PRACTICE_FORBIDDEN"
      );
      expect((await start(set.id, bearerOf(who)).expect(404)).body.code).toBe(
        "PRACTICE_SET_NOT_FOUND"
      );
      expect(
        (await read(attempt.id, bearerOf(who)).expect(404)).body.code
      ).toBe("PRACTICE_ATTEMPT_NOT_FOUND");
    }
    // A refused start leaves nothing behind: the talebe's attempt alone.
    expect(
      (await db().select().from(practiceAttempts)).map((a) => a.userId)
    ).toEqual([CAST.TALEBE]);
    expect(
      (
        await http()
          .get("/my-practice-sets")
          .set("Authorization", bearerOf(CAST.PENDING))
          .expect(200)
      ).body
    ).toEqual([]);
  });

  it("takes a set back to a draft until a talebe starts it", async () => {
    const set = await draftSet();
    await publish(set);
    const back = await http()
      .post(`/online-exams/${set.id}/unpublish`)
      .set("Authorization", muderris)
      .send({ version: set.version })
      .expect(200);
    expect(back.body.status).toBe("DRAFT");
    set.version = back.body.version;
    await publish(set);
    const lockedNow = async () => ({
      draft: (
        await http()
          .get(`/online-exams/${set.id}`)
          .set("Authorization", muderris)
          .expect(200)
      ).body.locked,
      listed: (
        (
          await http()
            .get(`/courses/${ids.courseId}/online-exams?kind=PRACTICE`)
            .set("Authorization", muderris)
            .expect(200)
        ).body as Array<{ id: string; locked: boolean }>
      ).find((e) => e.id === set.id)?.locked,
    });
    expect(await lockedNow()).toEqual({ draft: false, listed: false });
    await start(set.id).expect(201);
    // Started, not finished (MDRS-248): the stats have no row for it, yet
    // the set is locked, and both of nazar's reads say so.
    expect(
      (
        await http()
          .get(`/courses/${ids.courseId}/practice-set-stats`)
          .set("Authorization", muderris)
          .expect(200)
      ).body
    ).toEqual([]);
    expect(await lockedNow()).toEqual({ draft: true, listed: true });
    const locked = await http()
      .post(`/online-exams/${set.id}/unpublish`)
      .set("Authorization", muderris)
      .send({ version: set.version })
      .expect(409);
    expect(locked.body.code).toBe("EXAM_LOCKED");
  });

  it("publishes and solves a set whose question has no topic, while an exam's still lacks one (MDRS-248)", async () => {
    const question = {
      text: "Kıyasın rükünleri kaç tanedir?",
      options: [
        { text: "Doğru", correct: true },
        { text: "Yanlış", correct: false },
      ],
      answerMode: "SINGLE",
      topicIds: [],
    };
    const withUntopiced = async (kind: "EXAM" | "PRACTICE") => {
      const id = (
        await http()
          .post(`/courses/${ids.courseId}/online-exams`)
          .set("Authorization", muderris)
          .send({ title: `Konusuz ${kind}`, kind })
          .expect(201)
      ).body.id as string;
      const added = await http()
        .post(`/online-exams/${id}/questions`)
        .set("Authorization", muderris)
        .send({ version: 1 })
        .expect(201);
      const saved = await http()
        .put(`/online-exams/${id}/questions/${added.body.question.id}`)
        .set("Authorization", muderris)
        .send({ version: added.body.version, ...question })
        .expect(200);
      return { id, version: saved.body.version, saved: saved.body.question };
    };

    const exam = await withUntopiced("EXAM");
    expect(exam.saved).toMatchObject({ complete: false, lacks: ["topic"] });
    const examDraft = await http()
      .get(`/online-exams/${exam.id}`)
      .set("Authorization", muderris)
      .expect(200);
    expect(examDraft.body.problems).toContainEqual({
      kind: "QUESTION",
      number: 1,
      lacks: ["topic"],
    });

    const set = await withUntopiced("PRACTICE");
    expect(set.saved).toMatchObject({ complete: true, lacks: [] });
    const published = await http()
      .post(`/online-exams/${set.id}/publish`)
      .set("Authorization", muderris)
      .send({ version: set.version })
      .expect(200);
    expect(published.body.status).toBe("OPEN");
    expect(
      (
        (await courseSets().expect(200)).body as Array<{
          id: string;
          questionCount: number;
        }>
      ).find((s) => s.id === set.id)?.questionCount
    ).toBe(1);
    const attempt = (await start(set.id).expect(201)).body;
    expect(attempt.questions).toHaveLength(1);
    const q = attempt.questions[0] as IAttemptQuestion;
    await answer(attempt.id, q.id, [optionOf(q, "Doğru")]).expect(200);
    const done = await finish(attempt.id).expect(200);
    expect(done.body.status).toBe("FINISHED");
    expect(done.body.result).toMatchObject({ correct: 1, percent: "100.00" });
  });

  it("goes with its course, attempts and answers first", async () => {
    const set = await draftSet();
    await publish(set);
    const attempt = (await start(set.id).expect(201)).body;
    const q = attempt.questions[0] as IAttemptQuestion;
    await answer(attempt.id, q.id, [q.options[0].id]).expect(200);
    await db().transaction((tx) => purgeCourses(tx, [ids.courseId]));
    expect(await db().select().from(practiceAnswers)).toEqual([]);
    expect(await db().select().from(practiceAttempts)).toEqual([]);
    expect(
      await db()
        .select()
        .from(examQuestions)
        .where(eq(examQuestions.examId, set.id))
    ).toEqual([]);
    expect(
      await db().select().from(onlineExams).where(eq(onlineExams.id, set.id))
    ).toEqual([]);
  });
});
