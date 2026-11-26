import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { enrollments } from "../../src/database/schema/course.schema";
import {
  examAnswers,
  examAttempts,
} from "../../src/database/schema/exam-attempt.schema";
import {
  examResults,
  lessonExams,
} from "../../src/database/schema/lesson-exam.schema";
import {
  examOptions,
  examQuestions,
  onlineExams,
  zerothOptions,
} from "../../src/database/schema/online-exam.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
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
 * The course team's results of an online exam and its early close (MDRS-299):
 * who took it and how, the scores written where Değerlendirme reads them, and
 * an attempt whose page went away ended by the close. An exam is published
 * here by writing what publishing writes (its celse with its exam row, the
 * latest start, the zeroth question), which another change makes.
 */
describe("online exams, the team's results (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const talebe = bearerOf(CAST.TALEBE);
  const muderris = bearerOf(CAST.MUDERRIS);
  const HOLDER = "page-aaaa-1111";
  let lessons = 0;

  interface IPublished {
    lessonId: string;
    examId: string;
    zeroth: string[];
    questions: Array<{ id: string; correct: string; wrong: string }>;
  }

  /** A published exam of two radio questions, its celse a minute ago, with its Değerlendirme row. */
  const publish = async (
    values: { startsAt?: Date; published?: boolean } = {}
  ): Promise<IPublished> => {
    const lessonId = await insertLiveLesson(db(), ids.weekId, lessons++, {
      scheduledAt: values.startsAt ?? new Date(Date.now() - 60_000),
    });
    await db().insert(lessonExams).values({ lessonId });
    const [exam] = await db()
      .insert(onlineExams)
      .values({
        courseId: ids.courseId,
        lessonId,
        title: "Ara sınav",
        durationMinutes: 30,
        zerothQuestion: "Bu hadisi ne zaman öğrendin?",
        latestStartAt: new Date(Date.now() + 10 * 60_000),
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

  const take = (exam: IPublished, path: string) =>
    `/lessons/${exam.lessonId}/online-exam${path}`;
  /** The talebe answers the zeroth question, starts, and chooses the given options. */
  const sit = async (exam: IPublished, chosen: string[]) => {
    await http()
      .put(take(exam, "/zeroth-answer"))
      .set("Authorization", talebe)
      .send({ optionId: exam.zeroth[1] })
      .expect(200);
    await http()
      .post(take(exam, "/attempt"))
      .set("Authorization", talebe)
      .send({ holderId: HOLDER })
      .expect(201);
    let seq = 0;
    for (const [i, optionId] of chosen.entries()) {
      seq += 1;
      await http()
        .put(take(exam, `/attempt/answers/${exam.questions[i].id}`))
        .set("Authorization", talebe)
        .send({ holderId: HOLDER, seq, optionIds: [optionId], skipped: false })
        .expect(200);
    }
  };
  const results = (exam: IPublished, who = muderris) =>
    http()
      .get(`/online-exams/${exam.examId}/results`)
      .set("Authorization", who);
  const answersOf = (exam: IPublished, userId: string, who = muderris) =>
    http()
      .get(`/online-exams/${exam.examId}/results/${userId}`)
      .set("Authorization", who);
  const close = (exam: IPublished, who = muderris) =>
    http().post(`/online-exams/${exam.examId}/close`).set("Authorization", who);
  const resultOf = async (exam: IPublished) => {
    const [row] = await db()
      .select({ score: examResults.score, gradedBy: examResults.gradedBy })
      .from(examResults)
      .innerJoin(lessonExams, eq(lessonExams.id, examResults.examId))
      .where(
        and(
          eq(lessonExams.lessonId, exam.lessonId),
          eq(examResults.userId, CAST.TALEBE)
        )
      );
    return row ?? null;
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

  it("reads a finished talebe's score, counts and zeroth answer, and writes the score to Değerlendirme", async () => {
    const exam = await publish();
    await sit(exam, [exam.questions[0].correct, exam.questions[1].wrong]);
    await http()
      .post(take(exam, "/attempt/finish"))
      .set("Authorization", talebe)
      .send({ holderId: HOLDER })
      .expect(200);

    const res = await results(exam).expect(200);
    expect(res.body.exam).toMatchObject({
      id: exam.examId,
      lessonId: exam.lessonId,
      closed: false,
      mayClose: true,
    });
    expect(res.body.talebe).toEqual([
      expect.objectContaining({
        userId: CAST.TALEBE,
        state: "FINISHED",
        finishedBy: "TALEBE",
        score: "50.00",
        right: 1,
        wrong: 1,
        blank: 0,
        switches: [],
        zerothOptionId: exam.zeroth[1],
      }),
    ]);
    expect(res.body.counts).toMatchObject({
      seats: 1,
      started: 1,
      inProgress: 0,
      finished: 1,
      missed: 0,
      average: "50.00",
    });
    expect(
      res.body.questions.map((q: { rightPercent: number }) => q.rightPercent)
    ).toEqual([100, 0]);
    expect(res.body.questions[1].options).toEqual([
      expect.objectContaining({ text: "Doğru", correct: true, chosen: 0 }),
      expect.objectContaining({ text: "Yanlış", correct: false, chosen: 1 }),
    ]);
    expect(res.body.zeroth.options).toEqual([
      { id: exam.zeroth[0], text: "Bu dönem", count: 0 },
      { id: exam.zeroth[1], text: "Daha önce", count: 1 },
    ]);
    expect(res.body).toMatchObject({
      released: false,
      mayRelease: true,
      releasable: true,
    });
    expect(await resultOf(exam)).toEqual({
      score: 50,
      gradedBy: CAST.MUDERRIS,
    });
  });

  it("closes early: an attempt in progress ends with its saved answers, and nothing starts or closes again", async () => {
    const exam = await publish();
    await sit(exam, [exam.questions[0].correct]);

    const closed = await close(exam).expect(200);
    expect(closed.body).toMatchObject({ examId: exam.examId, finished: 1 });
    const [attempt] = await db()
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.examId, exam.examId));
    expect(attempt).toMatchObject({
      finishedBy: "CLOSED_EARLY",
      scoreHundredths: 5000,
    });
    expect(await resultOf(exam)).toEqual({
      score: 50,
      gradedBy: CAST.MUDERRIS,
    });
    const [audit] = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "online_exam.close"));
    expect(audit).toMatchObject({
      actorId: CAST.MUDERRIS,
      entityId: exam.examId,
      details: { courseId: ids.courseId, finished: 1 },
    });

    const after = await results(exam).expect(200);
    expect(after.body.exam).toMatchObject({ closed: true, mayClose: false });
    expect(after.body.talebe[0]).toMatchObject({
      state: "FINISHED",
      finishedBy: "CLOSED_EARLY",
      right: 1,
      blank: 1,
    });
    expect((await close(exam).expect(409)).body.code).toBe("EXAM_NOT_OPEN");
    await http()
      .put(take(exam, `/attempt/answers/${exam.questions[1].id}`))
      .set("Authorization", talebe)
      .send({
        holderId: HOLDER,
        seq: 9,
        optionIds: [exam.questions[1].correct],
        skipped: false,
      })
      .expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));
  });

  it("refuses to close an exam that has not opened, and has no results for a draft", async () => {
    const later = await publish({
      startsAt: new Date(Date.now() + 60 * 60_000),
    });
    expect((await close(later).expect(409)).body.code).toBe("EXAM_NOT_OPEN");
    const draft = await publish({ published: false });
    expect((await results(draft).expect(404)).body.code).toBe("EXAM_NOT_FOUND");
  });

  /** "Sonuçları talebelere aç", Değerlendirme's release of the exam celse's results. */
  const release = (exam: IPublished, who = muderris) =>
    http()
      .post(`/lessons/${exam.lessonId}/exam-results/release`)
      .set("Authorization", who);
  const examRow = async (exam: IPublished) => {
    const [row] = await db()
      .select({ closedEarlyAt: onlineExams.closedEarlyAt })
      .from(onlineExams)
      .where(eq(onlineExams.id, exam.examId));
    const [celse] = await db()
      .select({ releasedAt: lessonExams.resultsReleasedAt })
      .from(lessonExams)
      .where(eq(lessonExams.lessonId, exam.lessonId));
    return { closedEarlyAt: row.closedEarlyAt, releasedAt: celse.releasedAt };
  };
  const closeAudits = () =>
    db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "online_exam.close"));

  it("ends the exam for everyone when its results are released: an attempt in progress ends with its saved answers, and the talebe reads their answers with the correct ones", async () => {
    const exam = await publish();
    // The talebe answered one question and left without "Sınavı bitir".
    await sit(exam, [exam.questions[0].correct]);

    await release(exam).expect(200);
    const [attempt] = await db()
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.examId, exam.examId));
    expect(attempt).toMatchObject({
      finishedBy: "CLOSED_EARLY",
      scoreHundredths: 5000,
    });
    expect(await resultOf(exam)).toEqual({
      score: 50,
      gradedBy: CAST.MUDERRIS,
    });
    // Closed early at the release's own time.
    const row = await examRow(exam);
    expect(row.releasedAt).not.toBeNull();
    expect(row.closedEarlyAt?.getTime()).toBe(row.releasedAt?.getTime());
    const audits = await closeAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: CAST.MUDERRIS,
      entityId: exam.examId,
      details: { courseId: ids.courseId, finished: 1, via: "exam.release" },
    });

    const after = await results(exam).expect(200);
    expect(after.body.exam).toMatchObject({ closed: true, mayClose: false });
    expect(after.body).toMatchObject({ released: true });
    expect(after.body.talebe[0]).toMatchObject({
      state: "FINISHED",
      finishedBy: "CLOSED_EARLY",
    });
    // Nothing is saved after it, and it cannot be closed again.
    await http()
      .put(take(exam, `/attempt/answers/${exam.questions[1].id}`))
      .set("Authorization", talebe)
      .send({
        holderId: HOLDER,
        seq: 9,
        optionIds: [exam.questions[1].correct],
        skipped: false,
      })
      .expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));
    expect((await close(exam).expect(409)).body.code).toBe("EXAM_NOT_OPEN");

    // The talebe's own screen: the score, and "Cevaplarım" with the correct options.
    const mine = await http()
      .get(take(exam, "/my-result"))
      .set("Authorization", talebe)
      .expect(200);
    expect(mine.body).toMatchObject({
      released: true,
      closed: true,
      score: "50.00",
      counts: { right: 1, wrong: 0, blank: 1 },
    });
    expect(mine.body.questions).toHaveLength(2);
    expect(
      (
        mine.body.questions as Array<{
          options: Array<{ correct: boolean }>;
        }>
      ).every((q) => q.options.some((o) => o.correct))
    ).toBe(true);
  });

  it("refuses to release an online exam that has not opened, and changes nothing", async () => {
    const later = await publish({
      startsAt: new Date(Date.now() + 60 * 60_000),
    });
    expect((await release(later).expect(409)).body.code).toBe("EXAM_NOT_OPEN");
    expect(await examRow(later)).toEqual({
      closedEarlyAt: null,
      releasedAt: null,
    });
    expect(await closeAudits()).toHaveLength(0);
    expect(
      await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "exam.release"))
    ).toHaveLength(0);
  });

  it("keeps the close of an exam that has closed for everyone as it was", async () => {
    // Closed early before the release.
    const early = await publish();
    await sit(early, [early.questions[0].correct]);
    await close(early).expect(200);
    const closedAt = (await examRow(early)).closedEarlyAt;
    expect(closedAt).not.toBeNull();
    await release(early).expect(200);
    expect((await examRow(early)).closedEarlyAt?.getTime()).toBe(
      closedAt?.getTime()
    );
    expect(await closeAudits()).toHaveLength(1);

    // Past its latest start with no one in it: not closed early by the release.
    const past = await publish();
    await db()
      .update(onlineExams)
      .set({ latestStartAt: new Date(Date.now() - 1_000) })
      .where(eq(onlineExams.id, past.examId));
    await release(past).expect(200);
    expect(await examRow(past)).toMatchObject({ closedEarlyAt: null });
    expect((await results(past).expect(200)).body.exam).toMatchObject({
      closed: true,
    });
    expect(await closeAudits()).toHaveLength(1);
  });

  it("is read by those who prepare the exam, and says who may release it", async () => {
    const exam = await publish();
    for (const who of [CAST.SESSION, CAST.TALEBE, CAST.STRANGER]) {
      await results(exam, bearerOf(who)).expect(403);
      await close(exam, bearerOf(who)).expect(403);
    }
    await db().insert(permissionGrants).values({
      scopeType: "course",
      scopeId: ids.courseId,
      userId: CAST.BARE,
      grantedBy: CAST.MANAGER,
      permission: "exam.prepare",
    });
    const res = await results(exam, bearerOf(CAST.BARE)).expect(200);
    expect(res.body.mayRelease).toBe(false);
    expect(res.body.talebe[0]).toMatchObject({
      state: "NOT_STARTED",
      score: null,
    });
  });

  it("opens one talebe's answers: the exam's order, the correct marks, the choices and the points, and only that talebe's", async () => {
    const exam = await publish();
    await sit(exam, [exam.questions[0].correct, exam.questions[1].wrong]);
    await http()
      .post(take(exam, "/attempt/finish"))
      .set("Authorization", talebe)
      .send({ holderId: HOLDER })
      .expect(200);
    // A second talebe of the course, seated, who answered the other way round.
    const second = "e2470000-0000-4000-8000-0000000000f1";
    await db().insert(enrollments).values({
      userId: second,
      courseId: ids.courseId,
      status: EnrollmentStatus.ENROLLED,
      studentName: "İkinci Talebe",
    });
    const [attempt] = await db()
      .insert(examAttempts)
      .values({
        examId: exam.examId,
        userId: second,
        // Their own order: the exam's order is what the team reads.
        questionOrder: [exam.questions[1].id, exam.questions[0].id],
        optionOrder: {},
        countedAt: new Date(),
        holderId: "page-bbbb-2222",
      })
      .returning();
    await db()
      .insert(examAnswers)
      .values({
        attemptId: attempt.id,
        questionId: exam.questions[1].id,
        optionIds: [exam.questions[1].correct],
      });

    const res = await answersOf(exam, CAST.TALEBE).expect(200);
    expect(res.body).toMatchObject({
      exam: { id: exam.examId, title: "Ara sınav" },
      userId: CAST.TALEBE,
      state: "FINISHED",
      finishedBy: "TALEBE",
      score: "50.00",
      switches: [],
      zeroth: { optionId: exam.zeroth[1], answer: "Daha önce" },
    });
    expect(
      res.body.questions.map(
        (q: {
          number: number;
          text: string;
          verdict: string;
          earned: string;
        }) => [q.number, q.text, q.verdict, q.earned]
      )
    ).toEqual([
      [1, "Soru 1", "RIGHT", "50.00"],
      [2, "Soru 2", "WRONG", "0.00"],
    ]);
    expect(res.body.questions[1]).toMatchObject({
      points: "50.00",
      skipped: false,
      options: [
        expect.objectContaining({
          text: "Doğru",
          correct: true,
          chosen: false,
        }),
        expect.objectContaining({
          text: "Yanlış",
          correct: false,
          chosen: true,
        }),
      ],
    });

    const theirs = await answersOf(exam, second).expect(200);
    expect(theirs.body).toMatchObject({
      name: "İkinci Talebe",
      state: "IN_PROGRESS",
      score: null,
      zeroth: { optionId: null, answer: null },
    });
    expect(
      theirs.body.questions.map(
        (q: { verdict: string; savedAt: string | null }) => [
          q.verdict,
          q.savedAt === null,
        ]
      )
    ).toEqual([
      ["BLANK", true],
      ["RIGHT", false],
    ]);
  });

  it("finds no answers for a talebe with no attempt or no seat, and is read only by those who prepare the exam", async () => {
    const exam = await publish();
    const other = await publish();
    await sit(exam, [exam.questions[0].correct]);
    // Their attempt of one exam is not an answer sheet of another.
    expect((await answersOf(other, CAST.TALEBE).expect(404)).body.code).toBe(
      "ATTEMPT_NOT_FOUND"
    );
    expect((await answersOf(exam, CAST.STRANGER).expect(404)).body.code).toBe(
      "ATTEMPT_NOT_FOUND"
    );
    for (const who of [CAST.SESSION, CAST.TALEBE, CAST.STRANGER]) {
      await answersOf(exam, CAST.TALEBE, bearerOf(who)).expect(403);
    }
    const draft = await publish({ published: false });
    expect((await answersOf(draft, CAST.TALEBE).expect(404)).body.code).toBe(
      "EXAM_NOT_FOUND"
    );
  });
});
