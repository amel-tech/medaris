import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { ExamFormat } from "../../src/course/domain/exam";
import { DatabaseService } from "../../src/database/database.service";
import { enrollments } from "../../src/database/schema/course.schema";
import {
  examResults,
  lessonExams,
} from "../../src/database/schema/lesson-exam.schema";
import {
  courseExamTopics,
  examOptions,
  examQuestions,
  examQuestionTopics,
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
 * A talebe's own exams (MDRS-299): Sınavlarım, every exam of their courses
 * with where it stands for them, and their own screen of a past online exam:
 * nothing scored before the release, the correct options only once the exam
 * has closed for everyone. An exam is published, and its results released,
 * by writing what publishing and "Sonuçları talebelere aç" write.
 */
describe("online exams, a talebe's own exams and results (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let lessons = 0;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const talebe = bearerOf(CAST.TALEBE);
  const HOLDER = "page-mine-1111";

  interface IPublished {
    lessonId: string;
    examId: string;
    zeroth: string;
    questions: Array<{ id: string; correct: string; wrong: string }>;
    topics: string[];
  }

  /**
   * A published exam of two radio questions, the first about topic 1 and the
   * second about topics 1 and 2, its celse a minute ago, open for ten more.
   */
  const publish = async (
    values: { title?: string; published?: boolean } = {}
  ): Promise<IPublished> => {
    const lessonId = await insertLiveLesson(db(), ids.weekId, lessons++, {
      scheduledAt: new Date(Date.now() - 60_000),
    });
    const [exam] = await db()
      .insert(onlineExams)
      .values({
        courseId: ids.courseId,
        lessonId,
        title: values.title ?? "Ara sınav",
        durationMinutes: 30,
        zerothQuestion: "Bu hadisi ne zaman öğrendin?",
        latestStartAt: new Date(Date.now() + 10 * 60_000),
        publishedAt: values.published === false ? null : new Date(),
        createdBy: CAST.MUDERRIS,
      })
      .returning();
    const [zeroth] = await db()
      .insert(zerothOptions)
      .values([{ examId: exam.id, position: 0, text: "Bu dönem" }])
      .returning();
    const topics = await db()
      .select({ id: courseExamTopics.id })
      .from(courseExamTopics)
      .where(eq(courseExamTopics.courseId, ids.courseId))
      .orderBy(courseExamTopics.number);
    const topicIds =
      topics.length > 0
        ? topics.map((t) => t.id)
        : (
            await db()
              .insert(courseExamTopics)
              .values([
                {
                  courseId: ids.courseId,
                  number: 1,
                  name: "Kıyas",
                  nameKey: "kıyas",
                },
                {
                  courseId: ids.courseId,
                  number: 2,
                  name: "İcma",
                  nameKey: "icma",
                },
              ])
              .returning()
          ).map((t) => t.id);
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
      await db()
        .insert(examQuestionTopics)
        .values(
          (position === 0 ? [topicIds[0]] : topicIds).map((topicId) => ({
            questionId: q.id,
            topicId,
          }))
        );
      questions.push({ id: q.id, correct: right.id, wrong: wrong.id });
    }
    return {
      lessonId,
      examId: exam.id,
      zeroth: zeroth.id,
      questions,
      topics: topicIds,
    };
  };

  const at = (exam: IPublished, path = "") =>
    `/lessons/${exam.lessonId}/online-exam${path}`;
  const post = (exam: IPublished, path: string, body: object) =>
    http().post(at(exam, path)).set("Authorization", talebe).send(body);

  /** The talebe answers the first question right and the second wrong, and finishes. */
  const take = async (exam: IPublished) => {
    await http()
      .put(at(exam, "/zeroth-answer"))
      .set("Authorization", talebe)
      .send({ optionId: exam.zeroth })
      .expect(200);
    await post(exam, "/attempt", { holderId: HOLDER }).expect(201);
    let seq = 0;
    for (const [i, q] of exam.questions.entries()) {
      seq += 1;
      await http()
        .put(at(exam, `/attempt/answers/${q.id}`))
        .set("Authorization", talebe)
        .send({
          holderId: HOLDER,
          seq,
          optionIds: [i === 0 ? q.correct : q.wrong],
          skipped: false,
        })
        .expect(200);
    }
    await post(exam, "/attempt/finish", { holderId: HOLDER }).expect(200);
  };

  /** "Sonuçları talebelere aç", as the existing release writes it. */
  const release = (exam: IPublished) =>
    db()
      .insert(lessonExams)
      .values({ lessonId: exam.lessonId, resultsReleasedAt: new Date() })
      .onConflictDoUpdate({
        target: lessonExams.lessonId,
        set: { resultsReleasedAt: new Date() },
      });

  const closeForEveryone = (exam: IPublished) =>
    db()
      .update(onlineExams)
      .set({ latestStartAt: new Date(Date.now() - 1_000) })
      .where(eq(onlineExams.id, exam.examId));

  const mine = (who = talebe) =>
    http().get("/me/exams").set("Authorization", who);
  const result = (exam: IPublished, who = talebe) =>
    http().get(at(exam, "/my-result")).set("Authorization", who);

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

  it("lists every exam of the talebe's courses, of every format, and no draft", async () => {
    const exam = await publish();
    await publish({ title: "Taslak", published: false });
    const written = await insertLiveLesson(db(), ids.weekId, lessons++, {
      title: "Yazılı sınav",
      scheduledAt: new Date(Date.now() + 86_400_000),
    });
    await db().insert(lessonExams).values({
      lessonId: written,
      format: ExamFormat.WRITTEN,
      location: "Büyük salon",
    });

    const listed = (await mine().expect(200)).body;
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({
      lessonId: exam.lessonId,
      courseId: ids.courseId,
      courseTitle: "Emsile ve Bina",
      title: "Ara sınav",
      format: "MULTIPLE_CHOICE",
      state: "OPEN",
      score: null,
      maxScore: 100,
      durationMinutes: 30,
      questionCount: 2,
      place: null,
    });
    expect(listed[1]).toMatchObject({
      lessonId: written,
      title: "Yazılı sınav",
      format: "WRITTEN",
      state: "UPCOMING",
      latestStartAt: null,
      place: "Büyük salon",
      durationMinutes: null,
    });
    expect(JSON.stringify(listed)).not.toContain("Taslak");

    // Nobody else's: a pending seat and a stranger list nothing.
    for (const who of [CAST.PENDING, CAST.STRANGER]) {
      expect((await mine(bearerOf(who)).expect(200)).body).toEqual([]);
    }
  });

  it("moves an exam to the past when it is taken, and scores it only once released", async () => {
    const exam = await publish();
    await take(exam);
    const taken = (await mine().expect(200)).body[0];
    expect(taken).toMatchObject({ state: "TAKEN", score: null });

    await release(exam);
    expect((await mine().expect(200)).body[0]).toMatchObject({
      state: "RELEASED",
      score: "50.00",
    });

    // A completed course's exams stay; a course left takes its exams with it.
    await db()
      .update(enrollments)
      .set({ status: EnrollmentStatus.COMPLETED })
      .where(eq(enrollments.userId, CAST.TALEBE));
    expect((await mine().expect(200)).body).toHaveLength(1);
    await db()
      .update(enrollments)
      .set({ status: EnrollmentStatus.REVOKED })
      .where(eq(enrollments.userId, CAST.TALEBE));
    expect((await mine().expect(200)).body).toEqual([]);
  });

  it("says before the release only that the exam was taken, when and how it ended", async () => {
    const exam = await publish();
    expect((await result(exam).expect(404)).body.code).toBe(
      "ATTEMPT_NOT_FOUND"
    );
    await take(exam);
    const before = (await result(exam).expect(200)).body;
    expect(before).toMatchObject({
      lessonId: exam.lessonId,
      title: "Ara sınav",
      status: "FINISHED",
      finishedBy: "TALEBE",
      released: false,
      closed: false,
      score: null,
      counts: null,
      topics: [],
      courseTopics: [],
      questions: null,
    });
    expect(before.finishedAt).not.toBeNull();
    expect(JSON.stringify(before)).not.toContain("Doğru");

    for (const who of [CAST.PENDING, CAST.STRANGER]) {
      const refused = await result(exam, bearerOf(who));
      expect([403, 404]).toContain(refused.status);
    }
    const draft = await publish({ title: "Taslak", published: false });
    expect((await result(draft).expect(404)).body.code).toBe("EXAM_NOT_FOUND");
  });

  it("scores and stands by topic once released, and opens the answers once closed for everyone", async () => {
    const exam = await publish();
    await take(exam);
    await release(exam);

    const released = (await result(exam).expect(200)).body;
    expect(released).toMatchObject({
      released: true,
      closed: false,
      score: "50.00",
      counts: { right: 1, wrong: 1, blank: 0 },
      questions: null,
    });
    // Topic 2 asked only the wrong question; topic 1 both: the weakest first.
    expect(released.topics).toEqual([
      {
        topicId: exam.topics[1],
        number: 2,
        name: "İcma",
        percent: 0,
        right: 0,
        wrong: 1,
        blank: 0,
      },
      {
        topicId: exam.topics[0],
        number: 1,
        name: "Kıyas",
        percent: 50,
        right: 1,
        wrong: 1,
        blank: 0,
      },
    ]);
    expect(released.courseTopics).toEqual([
      expect.objectContaining({ number: 2, percent: 0, exams: 1 }),
      expect.objectContaining({ number: 1, percent: 50, exams: 1 }),
    ]);
    expect(JSON.stringify(released)).not.toContain('"correct"');

    await closeForEveryone(exam);
    const closed = (await result(exam).expect(200)).body;
    expect(closed.closed).toBe(true);
    expect(closed.questions).toHaveLength(2);
    const byId = new Map(
      (
        closed.questions as Array<{
          id: string;
          outcome: string;
          points: string;
          got: string;
          options: Array<{ id: string; chosen: boolean; correct: boolean }>;
        }>
      ).map((q) => [q.id, q])
    );
    expect(byId.get(exam.questions[0].id)).toMatchObject({
      outcome: "RIGHT",
      points: "50.00",
      got: "50.00",
    });
    const second = byId.get(exam.questions[1].id);
    expect(second).toMatchObject({ outcome: "WRONG", got: "0.00" });
    expect(second?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: exam.questions[1].wrong,
          chosen: true,
          correct: false,
        }),
        expect.objectContaining({
          id: exam.questions[1].correct,
          chosen: false,
          correct: true,
        }),
      ])
    );
  });

  it("adds the standing up across the course's released exams", async () => {
    const first = await publish();
    await take(first);
    await release(first);
    const second = await publish({ title: "Final" });
    await take(second);
    // Not released yet: counted from the first exam only.
    let standing = (await result(first).expect(200)).body.courseTopics;
    expect(standing).toEqual([
      expect.objectContaining({ number: 2, exams: 1 }),
      expect.objectContaining({ number: 1, exams: 1 }),
    ]);
    await release(second);
    standing = (await result(first).expect(200)).body.courseTopics;
    expect(standing).toEqual([
      expect.objectContaining({ number: 2, percent: 0, exams: 2 }),
      expect.objectContaining({ number: 1, percent: 50, exams: 2 }),
    ]);
  });

  it("lists a written exam's released score out of its own maximum, and Girmedi as missed", async () => {
    const lessonId = await insertLiveLesson(db(), ids.weekId, lessons++, {
      title: "Şifahi sınav",
    });
    const [exam] = await db()
      .insert(lessonExams)
      .values({
        lessonId,
        format: ExamFormat.ORAL,
        maxScore: 20,
        resultsReleasedAt: new Date(),
      })
      .returning();
    await db().insert(examResults).values({
      examId: exam.id,
      userId: CAST.TALEBE,
      score: 17,
      gradedBy: CAST.MUDERRIS,
    });
    expect((await mine().expect(200)).body).toEqual([
      expect.objectContaining({
        lessonId,
        format: "ORAL",
        state: "RELEASED",
        score: "17",
        maxScore: 20,
      }),
    ]);
    await db()
      .update(examResults)
      .set({ score: null, absent: true })
      .where(eq(examResults.examId, exam.id));
    expect((await mine().expect(200)).body[0]).toMatchObject({
      state: "MISSED",
      score: null,
    });
  });
});
