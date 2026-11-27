import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { onlineExams } from "../../src/database/schema/online-exam.schema";
import { practiceAttempts } from "../../src/database/schema/practice.schema";
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
 * The course's question pool (MDRS-248 Faz 4): a talebe solves every
 * question of the course's published çalışma setleri, or some of them at
 * random, on the same attempt routes as a set; no exam's question and no
 * draft's is drawn. The team sees how each set was solved.
 */
describe("çalışma havuzu (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const muderris = bearerOf(CAST.MUDERRIS);
  const talebe = bearerOf(CAST.TALEBE);

  interface IDraft {
    id: string;
    version: number;
    /** Its complete questions. */
    questions: string[];
  }

  /**
   * A draft of the course with `complete` complete radio questions (the
   * right answer "Doğru") and one incomplete question.
   */
  const draft = async (
    title: string,
    complete: number,
    kind: "PRACTICE" | "EXAM" = "PRACTICE"
  ): Promise<IDraft> => {
    const id = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title, kind })
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
    const questions: string[] = [];
    for (let n = 0; n <= complete; n += 1) {
      const added = await http()
        .post(`/online-exams/${id}/questions`)
        .set("Authorization", muderris)
        .send({ version })
        .expect(201);
      version = added.body.version;
      if (n === complete) break; // left empty: incomplete
      const saved = await http()
        .put(`/online-exams/${id}/questions/${added.body.question.id}`)
        .set("Authorization", muderris)
        .send({
          version,
          text: `${title} ${n + 1}`,
          options: [
            { text: "Doğru", correct: true },
            { text: "Yanlış", correct: false },
          ],
          answerMode: "SINGLE",
          topicIds: [topic],
        })
        .expect(200);
      version = saved.body.version;
      questions.push(added.body.question.id);
    }
    return { id, version, questions };
  };

  const publish = async (set: IDraft) => {
    const res = await http()
      .post(`/online-exams/${set.id}/publish`)
      .set("Authorization", muderris)
      .send({ version: set.version })
      .expect(200);
    set.version = res.body.version;
  };

  /** Two published sets (3 + 2 complete questions), a draft set and an exam, each with complete questions. */
  const seedPool = async () => {
    const a = await draft("Emsile", 3);
    const b = await draft("Bina", 2);
    await publish(a);
    await publish(b);
    const drafted = await draft("Taslak", 2);
    const exam = await draft("Sınav", 2, "EXAM");
    // Published as an exam is, without the celse this test does not need:
    // still no question of the pool.
    await db()
      .update(onlineExams)
      .set({ publishedAt: new Date() })
      .where(eq(onlineExams.id, exam.id));
    return { a, b, drafted, exam };
  };

  const pool = (who = talebe) =>
    http()
      .get(`/courses/${ids.courseId}/practice-pool`)
      .set("Authorization", who);
  const startPool = (body: object, who = talebe) =>
    http()
      .post(`/courses/${ids.courseId}/practice-pool/attempts`)
      .set("Authorization", who)
      .send(body);
  const finish = (attemptId: string) =>
    http()
      .post(`/practice-attempts/${attemptId}/finish`)
      .set("Authorization", talebe);

  interface IAttemptQuestion {
    id: string;
    setTitle: string;
    options: Array<{ id: string; text: string; correct?: boolean }>;
  }

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

  it("draws every question of the published sets under ALL, and no exam's or draft's", async () => {
    const { a, b, drafted, exam } = await seedPool();
    expect((await pool().expect(200)).body).toEqual({
      courseId: ids.courseId,
      questionCount: 5,
      openAttemptId: null,
      attempts: [],
    });
    const attempt = (await startPool({ mode: "ALL" }).expect(201)).body;
    expect(attempt).toMatchObject({
      setId: null,
      poolMode: "ALL",
      courseId: ids.courseId,
      status: "IN_PROGRESS",
      result: null,
    });
    const drawn = attempt.questions as IAttemptQuestion[];
    expect(drawn.map((q) => q.id).sort()).toEqual(
      [...a.questions, ...b.questions].sort()
    );
    for (const q of [...drafted.questions, ...exam.questions]) {
      expect(drawn.map((d) => d.id)).not.toContain(q);
    }
    for (const q of drawn) {
      expect(q.setTitle).toBe(a.questions.includes(q.id) ? "Emsile" : "Bina");
      for (const o of q.options) expect(o).not.toHaveProperty("correct");
    }
    expect((await pool().expect(200)).body.openAttemptId).toBe(attempt.id);
  });

  it("draws N questions at random, none twice, and goes on with the open one", async () => {
    const { a, b } = await seedPool();
    const all = [...a.questions, ...b.questions];
    const attempt = (await startPool({ mode: "RANDOM", count: 3 }).expect(201))
      .body;
    const drawn = (attempt.questions as IAttemptQuestion[]).map((q) => q.id);
    expect(attempt.poolMode).toBe("RANDOM");
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
    for (const id of drawn) expect(all).toContain(id);
    // One pool attempt in progress per talebe and course, whatever is asked.
    const again = (await startPool({ mode: "ALL" }).expect(201)).body;
    expect(again.id).toBe(attempt.id);
    expect(
      await db()
        .select()
        .from(practiceAttempts)
        .where(eq(practiceAttempts.userId, CAST.TALEBE))
    ).toHaveLength(1);
  });

  it("refuses a count out of the pool's range", async () => {
    await seedPool();
    for (const body of [
      { mode: "RANDOM" },
      { mode: "RANDOM", count: 6 },
      { mode: "RANDOM", count: 0 },
      { mode: "RANDOM", count: 1.5 },
      { mode: "SOME", count: 1 },
    ]) {
      await startPool(body).expect(400);
    }
    expect(
      (await startPool({ mode: "RANDOM", count: 6 }).expect(400)).body.code
    ).toBe("PRACTICE_POOL_COUNT_INVALID");
    expect(await db().select().from(practiceAttempts)).toEqual([]);
    await startPool({ mode: "RANDOM", count: 5 }).expect(201);
  });

  it("refuses an empty pool", async () => {
    await draft("Taslak", 2);
    expect((await startPool({ mode: "ALL" }).expect(400)).body.code).toBe(
      "PRACTICE_POOL_COUNT_INVALID"
    );
  });

  it("answers and finishes on the attempt routes, each question with its set's title", async () => {
    await seedPool();
    const attempt = (await startPool({ mode: "RANDOM", count: 2 }).expect(201))
      .body;
    const [first, second] = attempt.questions as IAttemptQuestion[];
    const right = first.options.find((o) => o.text === "Doğru")?.id as string;
    await http()
      .put(`/practice-attempts/${attempt.id}/answers/${first.id}`)
      .set("Authorization", talebe)
      .send({ optionIds: [right] })
      .expect(200);
    expect(
      (
        await http()
          .get(`/practice-attempts/${attempt.id}`)
          .set("Authorization", talebe)
          .expect(200)
      ).body.questions[0].chosenOptionIds
    ).toEqual([right]);
    const done = (await finish(attempt.id).expect(200)).body;
    expect(done.status).toBe("FINISHED");
    expect(done.result).toEqual({
      correct: 1,
      wrong: 0,
      blank: 1,
      total: 2,
      percent: "50.00",
    });
    expect(done.questions[0]).toMatchObject({
      id: first.id,
      setTitle: first.setTitle,
      outcome: "CORRECT",
    });
    expect(done.questions[1]).toMatchObject({
      id: second.id,
      outcome: "BLANK",
    });
    const listed = (await pool().expect(200)).body;
    expect(listed.openAttemptId).toBeNull();
    expect(listed.attempts).toEqual([
      expect.objectContaining({
        id: attempt.id,
        mode: "RANDOM",
        questionCount: 2,
        status: "FINISHED",
        result: expect.objectContaining({ percent: "50.00" }),
      }),
    ]);
    // A new one may start once the last is finished.
    const next = (await startPool({ mode: "ALL" }).expect(201)).body;
    expect(next.id).not.toBe(attempt.id);
  });

  it("refuses anyone who is no talebe of the course", async () => {
    await seedPool();
    for (const who of [CAST.PENDING, CAST.STRANGER, CAST.MUDERRIS]) {
      expect((await pool(bearerOf(who)).expect(403)).body.code).toBe(
        "PRACTICE_FORBIDDEN"
      );
      expect(
        (await startPool({ mode: "ALL" }, bearerOf(who)).expect(403)).body.code
      ).toBe("PRACTICE_FORBIDDEN");
    }
    expect(await db().select().from(practiceAttempts)).toEqual([]);
  });

  it("locks a set once a pool attempt drew one of its questions", async () => {
    const { a, b } = await seedPool();
    await startPool({ mode: "ALL" }).expect(201);
    for (const set of [a, b]) {
      const locked = await http()
        .post(`/online-exams/${set.id}/unpublish`)
        .set("Authorization", muderris)
        .send({ version: set.version })
        .expect(409);
      expect(locked.body.code).toBe("EXAM_LOCKED");
    }
  });

  it("shows the team how each set was solved, pool attempts apart", async () => {
    const { a, b } = await seedPool();
    const attempt = (
      await http()
        .post(`/practice-sets/${a.id}/attempts`)
        .set("Authorization", talebe)
        .expect(201)
    ).body;
    for (const q of attempt.questions as IAttemptQuestion[]) {
      const right = q.options.find((o) => o.text === "Doğru")?.id as string;
      await http()
        .put(`/practice-attempts/${attempt.id}/answers/${q.id}`)
        .set("Authorization", talebe)
        .send({ optionIds: [right] })
        .expect(200);
    }
    await finish(attempt.id).expect(200);
    const second = (
      await http()
        .post(`/practice-sets/${a.id}/attempts`)
        .set("Authorization", talebe)
        .expect(201)
    ).body;
    await finish(second.id).expect(200);
    const pooled = (await startPool({ mode: "ALL" }).expect(201)).body;
    await finish(pooled.id).expect(200);

    const stats = (
      await http()
        .get(`/courses/${ids.courseId}/practice-set-stats`)
        .set("Authorization", muderris)
        .expect(200)
    ).body;
    expect(stats).toEqual([
      {
        setId: a.id,
        talebeCount: 1,
        attemptCount: 2,
        averagePercent: "50.00",
      },
    ]);
    expect(stats.map((s: { setId: string }) => s.setId)).not.toContain(b.id);
    await http()
      .get(`/courses/${ids.courseId}/practice-set-stats`)
      .set("Authorization", talebe)
      .expect(403);
  });
});
