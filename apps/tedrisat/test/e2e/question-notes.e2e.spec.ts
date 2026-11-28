import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { purgeCourses } from "../../src/course/course-purge";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { enrollments } from "../../src/database/schema/course.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import {
  examOptions,
  examQuestions,
  onlineExams,
  zerothOptions,
} from "../../src/database/schema/online-exam.schema";
import { questionNotes } from "../../src/database/schema/question-note.schema";
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
 * Soru notları (MDRS-248): a talebe's note on a question they solved or
 * sat, their own until they send it to the hoca; the hoca reads the notes
 * sent on a set and answers them. The team turns notes on or off per
 * question (on in a çalışma seti, off in an exam by default), and an exam's
 * note waits for the exam to be over before it may go to the hoca.
 */
describe("soru notları (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const muderris = bearerOf(CAST.MUDERRIS);
  const talebe = bearerOf(CAST.TALEBE);
  // A second talebe of the course, enrolled in `beforeEach`.
  const other = bearerOf(CAST.STRANGER);
  const otherCourse = bearerOf(CAST.OTHER_COURSE);

  /**
   * A published çalışma seti of two complete radio questions ("Doğru" right),
   * their talebe notes turned on with the save: a new question starts off.
   */
  const publishedSet = async (title = "Kıyas tekrar") => {
    const id = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title, kind: "PRACTICE" })
        .expect(201)
    ).body.id as string;
    let version = 1;
    const questions: string[] = [];
    for (const n of [1, 2]) {
      const added = await http()
        .post(`/online-exams/${id}/questions`)
        .set("Authorization", muderris)
        .send({ version })
        .expect(201);
      expect(added.body.question.talebeNotes).toBe(false);
      version = added.body.version;
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
          topicIds: [],
          talebeNotes: true,
        })
        .expect(200);
      expect(saved.body.question.talebeNotes).toBe(true);
      version = saved.body.version;
      questions.push(added.body.question.id);
    }
    const published = await http()
      .post(`/online-exams/${id}/publish`)
      .set("Authorization", muderris)
      .send({ version })
      .expect(200);
    return { id, questions, version: published.body.version as number };
  };

  const startSet = async (setId: string, who = talebe) =>
    (
      await http()
        .post(`/practice-sets/${setId}/attempts`)
        .set("Authorization", who)
        .expect(201)
    ).body;
  const readAttempt = (attemptId: string, who = talebe) =>
    http().get(`/practice-attempts/${attemptId}`).set("Authorization", who);
  const putNote = (
    questionId: string,
    body: { body: string; sharedWithTeacher: boolean },
    who = talebe
  ) =>
    http()
      .put(`/exam-questions/${questionId}/my-note`)
      .set("Authorization", who)
      .send(body);
  const teacherNotes = (examId: string, who = muderris) =>
    http().get(`/online-exams/${examId}/notes`).set("Authorization", who);
  const myNotes = (who = talebe) =>
    http()
      .get(`/courses/${ids.courseId}/my-question-notes`)
      .set("Authorization", who);
  const reply = (noteId: string, text: string, who = muderris) =>
    http()
      .put(`/question-notes/${noteId}/reply`)
      .set("Authorization", who)
      .send({ reply: text });

  type IQuestion = { id: string; myNote: unknown; talebeNotes: boolean };
  const questionIn = (attempt: { questions: IQuestion[] }, id: string) =>
    attempt.questions.find((q) => q.id === id) as IQuestion;

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
    await db().insert(enrollments).values({
      userId: CAST.STRANGER,
      courseId: ids.courseId,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("starts every new question's notes off, in a çalışma seti and an exam alike", async () => {
    for (const kind of ["EXAM", "PRACTICE"] as const) {
      const examId = (
        await http()
          .post(`/courses/${ids.courseId}/online-exams`)
          .set("Authorization", muderris)
          .send({ title: `Yeni ${kind}`, kind })
          .expect(201)
      ).body.id as string;
      const added = await http()
        .post(`/online-exams/${examId}/questions`)
        .set("Authorization", muderris)
        .send({ version: 1 })
        .expect(201);
      expect(added.body.question.talebeNotes).toBe(false);
      const draft = await http()
        .get(`/online-exams/${examId}`)
        .set("Authorization", muderris)
        .expect(200);
      expect(draft.body.questions[0].talebeNotes).toBe(false);
      expect(draft.body.unansweredNotes).toBe(0);
    }

    // Turned on with the save, they stay on.
    const set = await publishedSet();
    const setDraft = await http()
      .get(`/online-exams/${set.id}`)
      .set("Authorization", muderris)
      .expect(200);
    expect(
      setDraft.body.questions.map((q: IQuestion) => q.talebeNotes)
    ).toEqual([true, true]);
  });

  it("keeps a personal note to its talebe: beside the question, in their list, never to the hoca", async () => {
    const set = await publishedSet();
    const attempt = await startSet(set.id);
    const [q1] = set.questions;
    const saved = await putNote(q1, {
      body: "  B'yi neden eledim?  ",
      sharedWithTeacher: false,
    }).expect(200);
    expect(saved.body).toMatchObject({
      body: "B'yi neden eledim?",
      sharedWithTeacher: false,
      sharedAt: null,
      teacherReply: null,
      newReply: false,
    });

    const read = (await readAttempt(attempt.id).expect(200)).body;
    expect(questionIn(read, q1)).toMatchObject({
      talebeNotes: true,
      myNote: { body: "B'yi neden eledim?", sharedWithTeacher: false },
    });
    expect(questionIn(read, set.questions[1]).myNote).toBeNull();
    // Nothing of the answer leaks through the note.
    expect(JSON.stringify(questionIn(read, q1).myNote)).not.toContain(
      "correct"
    );

    const mine = (await myNotes().expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      questionId: q1,
      questionText: "Soru 1",
      examId: set.id,
      examKind: "PRACTICE",
      setTitle: "Kıyas tekrar",
      lessonId: null,
    });

    expect((await teacherNotes(set.id).expect(200)).body).toEqual([]);
    const list = await http()
      .get(`/courses/${ids.courseId}/online-exams?kind=PRACTICE`)
      .set("Authorization", muderris)
      .expect(200);
    expect(list.body[0].unansweredNotes).toBe(0);
    expect(await db().select().from(notifications)).toEqual([]);

    // Another talebe neither sees it nor reaches it.
    expect((await myNotes(other).expect(200)).body).toEqual([]);
    expect(
      (
        await http()
          .delete(`/exam-questions/${q1}/my-note`)
          .set("Authorization", other)
          .expect(404)
      ).body.code
    ).toBe("NOTE_QUESTION_NOT_FOUND");
    expect(
      (
        await putNote(
          q1,
          { body: "x", sharedWithTeacher: false },
          other
        ).expect(404)
      ).body.code
    ).toBe("NOTE_QUESTION_NOT_FOUND");
    await startSet(set.id, other);
    expect(
      (
        await http()
          .delete(`/exam-questions/${q1}/my-note`)
          .set("Authorization", other)
          .expect(404)
      ).body.code
    ).toBe("QUESTION_NOTE_NOT_FOUND");

    // Its own talebe deletes it.
    await http()
      .delete(`/exam-questions/${q1}/my-note`)
      .set("Authorization", talebe)
      .expect(204);
    expect((await myNotes().expect(200)).body).toEqual([]);
  });

  it("sends a note to the hoca, who answers it; the talebe reads the answer", async () => {
    const set = await publishedSet();
    const attempt = await startSet(set.id);
    const [q1] = set.questions;
    await putNote(q1, { body: "Kaynak?", sharedWithTeacher: true }).expect(200);

    const shared = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.type, "QUESTION_NOTE_SHARED"));
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({
      userId: CAST.MUDERRIS,
      targetType: "COURSE",
      targetId: ids.courseId,
    });
    expect(shared[0].params).toMatchObject({
      examId: set.id,
      setTitle: "Kıyas tekrar",
    });

    const listed = (await teacherNotes(set.id).expect(200)).body;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      questionId: q1,
      questionNumber: 1,
      questionText: "Soru 1",
      talebe: { id: CAST.TALEBE },
      body: "Kaynak?",
      teacherReply: null,
      editedAfterReply: false,
    });
    const summary = await http()
      .get(`/courses/${ids.courseId}/online-exams?kind=PRACTICE`)
      .set("Authorization", muderris)
      .expect(200);
    expect(summary.body[0].unansweredNotes).toBe(1);
    expect(
      (
        await http()
          .get(`/online-exams/${set.id}`)
          .set("Authorization", muderris)
          .expect(200)
      ).body.unansweredNotes
    ).toBe(1);

    const answered = await reply(listed[0].id, " Tefsir, 3. cilt. ").expect(
      200
    );
    expect(answered.body).toMatchObject({
      teacherReply: "Tefsir, 3. cilt.",
      repliedBy: CAST.MUDERRIS,
    });
    const audit = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "question_note.reply"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: CAST.MUDERRIS,
      entity: "question_note",
      entityId: listed[0].id,
    });
    const told = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.type, "QUESTION_NOTE_REPLIED"));
    expect(told).toHaveLength(1);
    expect(told[0].userId).toBe(CAST.TALEBE);

    const read = (await readAttempt(attempt.id).expect(200)).body;
    expect(questionIn(read, q1).myNote).toMatchObject({
      sharedWithTeacher: true,
      teacherReply: "Tefsir, 3. cilt.",
      newReply: true,
    });
    // Reading the list marks the answer read.
    expect((await myNotes().expect(200)).body[0].newReply).toBe(true);
    expect((await myNotes().expect(200)).body[0].newReply).toBe(false);
    expect(
      (
        await http()
          .get(`/courses/${ids.courseId}/online-exams?kind=PRACTICE`)
          .set("Authorization", muderris)
          .expect(200)
      ).body[0].unansweredNotes
    ).toBe(0);

    // Written again, the answer stays and the hoca sees it changed.
    await new Promise((r) => setTimeout(r, 5));
    await putNote(q1, {
      body: "Kaynak? Hangi baskı?",
      sharedWithTeacher: true,
    }).expect(200);
    const again = (await teacherNotes(set.id).expect(200)).body[0];
    expect(again).toMatchObject({
      body: "Kaynak? Hangi baskı?",
      teacherReply: "Tefsir, 3. cilt.",
      editedAfterReply: true,
    });
    // A rewrite of the answer is no news; an empty one takes it back.
    await reply(listed[0].id, "Tefsir, 4. cilt.").expect(200);
    const cleared = await reply(listed[0].id, "").expect(200);
    expect(cleared.body).toMatchObject({ teacherReply: null, repliedAt: null });
    expect(
      await db()
        .select()
        .from(notifications)
        .where(eq(notifications.type, "QUESTION_NOTE_REPLIED"))
    ).toHaveLength(1);
  });

  it("refuses another course's hoca and a note kept to its talebe", async () => {
    const set = await publishedSet();
    await startSet(set.id);
    const [q1, q2] = set.questions;
    await putNote(q1, { body: "Gönderdim", sharedWithTeacher: true }).expect(
      200
    );
    const kept = (
      await putNote(q2, {
        body: "Bende kalsın",
        sharedWithTeacher: false,
      }).expect(200)
    ).body;
    const sent = (await teacherNotes(set.id).expect(200)).body[0];

    await teacherNotes(set.id, otherCourse).expect(403);
    await reply(sent.id, "x", otherCourse).expect(403);
    // A talebe holds no `exam.prepare`.
    await teacherNotes(set.id, talebe).expect(403);
    expect((await reply(kept.id, "x").expect(404)).body.code).toBe(
      "QUESTION_NOTE_NOT_FOUND"
    );
  });

  it("refuses new writes on a question whose notes the team turned off, and keeps what was written", async () => {
    const set = await publishedSet();
    const attempt = await startSet(set.id);
    const [q1] = set.questions;
    await putNote(q1, { body: "Önceden", sharedWithTeacher: false }).expect(
      200
    );
    // On a published, locked set, with no version and no bump.
    const turned = await http()
      .put(`/online-exams/${set.id}/questions/${q1}/talebe-notes`)
      .set("Authorization", muderris)
      .send({ talebeNotes: false })
      .expect(200);
    expect(turned.body).toEqual({ questionId: q1, talebeNotes: false });
    const draft = (
      await http()
        .get(`/online-exams/${set.id}`)
        .set("Authorization", muderris)
        .expect(200)
    ).body;
    expect(draft.version).toBe(set.version);
    expect(draft.locked).toBe(true);
    expect(draft.questions[0].talebeNotes).toBe(false);

    expect(
      (
        await putNote(q1, { body: "Sonra", sharedWithTeacher: false }).expect(
          409
        )
      ).body.code
    ).toBe("NOTES_DISABLED");
    const read = (await readAttempt(attempt.id).expect(200)).body;
    expect(questionIn(read, q1)).toMatchObject({
      talebeNotes: false,
      myNote: { body: "Önceden" },
    });
    await http()
      .put(`/online-exams/${set.id}/questions/${q1}/talebe-notes`)
      .set("Authorization", otherCourse)
      .send({ talebeNotes: true })
      .expect(403);
  });

  describe("on an exam", () => {
    let lessonIndex = 0;

    /** A published exam of one radio question, its celse a minute ago. */
    const publishExam = async (talebeNotes: boolean) => {
      const lessonId = await insertLiveLesson(db(), ids.weekId, lessonIndex++, {
        scheduledAt: new Date(Date.now() - 60_000),
      });
      const [exam] = await db()
        .insert(onlineExams)
        .values({
          courseId: ids.courseId,
          lessonId,
          title: "Ara sınav",
          durationMinutes: 30,
          zerothQuestion: "Bu hadisi ne zaman öğrendin?",
          latestStartAt: new Date(Date.now() + 10 * 60_000),
          publishedAt: new Date(),
          createdBy: CAST.MUDERRIS,
        })
        .returning();
      const [zeroth] = await db()
        .insert(zerothOptions)
        .values([{ examId: exam.id, position: 0, text: "Bu dönem" }])
        .returning();
      const [q] = await db()
        .insert(examQuestions)
        .values({
          examId: exam.id,
          position: 0,
          text: "Soru 1",
          answerMode: AnswerMode.SINGLE,
          talebeNotes,
        })
        .returning();
      await db()
        .insert(examOptions)
        .values([
          { questionId: q.id, position: 0, text: "Doğru", correct: true },
          { questionId: q.id, position: 1, text: "Yanlış", correct: false },
        ]);
      const at = `/lessons/${lessonId}/online-exam`;
      await http()
        .put(`${at}/zeroth-answer`)
        .set("Authorization", talebe)
        .send({ optionId: zeroth.id })
        .expect(200);
      const attempt = (
        await http()
          .post(`${at}/attempt`)
          .set("Authorization", talebe)
          .send({ holderId: "page-aaaa-1111" })
          .expect(201)
      ).body;
      return { examId: exam.id, lessonId, questionId: q.id, attempt };
    };

    it("is off by default (NOTES_DISABLED)", async () => {
      const exam = await publishExam(false);
      expect(exam.attempt.questions[0]).toMatchObject({
        talebeNotes: false,
        myNote: null,
      });
      expect(
        (
          await putNote(exam.questionId, {
            body: "x",
            sharedWithTeacher: false,
          }).expect(409)
        ).body.code
      ).toBe("NOTES_DISABLED");
    });

    it("keeps the note to the talebe while the exam runs, and lets it go once it is over", async () => {
      const exam = await publishExam(true);
      await putNote(exam.questionId, {
        body: "Emin değilim",
        sharedWithTeacher: false,
      }).expect(200);
      const resumed = (
        await http()
          .post(`/lessons/${exam.lessonId}/online-exam/attempt/resume`)
          .set("Authorization", talebe)
          .send({ holderId: "page-aaaa-1111" })
          .expect(200)
      ).body;
      expect(resumed.questions[0]).toMatchObject({
        talebeNotes: true,
        myNote: { body: "Emin değilim", sharedWithTeacher: false },
      });
      expect(
        (
          await putNote(exam.questionId, {
            body: "Emin değilim",
            sharedWithTeacher: true,
          }).expect(409)
        ).body.code
      ).toBe("NOTES_SHARE_LOCKED");
      expect((await teacherNotes(exam.examId).expect(200)).body).toEqual([]);

      // The team closes it early: over for everyone.
      await db()
        .update(onlineExams)
        .set({ closedEarlyAt: new Date(Date.now() - 1000) })
        .where(eq(onlineExams.id, exam.examId));
      await putNote(exam.questionId, {
        body: "Emin değilim",
        sharedWithTeacher: true,
      }).expect(200);
      const listed = (await teacherNotes(exam.examId).expect(200)).body;
      expect(listed).toHaveLength(1);
      expect((await myNotes().expect(200)).body[0]).toMatchObject({
        examKind: "EXAM",
        lessonId: exam.lessonId,
      });
    });
  });

  it("goes with its set when the set is deleted, and with its course when it is purged", async () => {
    const set = await publishedSet("Silinecek");
    // A note on a set no attempt holds any more cannot be made through the
    // API (a started set cannot be deleted); written here as it would stand.
    const [note] = await db()
      .insert(questionNotes)
      .values({
        courseId: ids.courseId,
        examId: set.id,
        questionId: set.questions[0],
        userId: CAST.TALEBE,
        body: "Not",
      })
      .returning();
    await http()
      .delete(`/online-exams/${set.id}`)
      .set("Authorization", muderris)
      .expect(204);
    expect(
      await db()
        .select()
        .from(questionNotes)
        .where(eq(questionNotes.id, note.id))
    ).toEqual([]);

    const kept = await publishedSet("Kalan");
    await startSet(kept.id);
    await putNote(kept.questions[0], {
      body: "Not",
      sharedWithTeacher: true,
    }).expect(200);
    await db().transaction((tx) => purgeCourses(tx, [ids.courseId]));
    expect(
      await db()
        .select()
        .from(questionNotes)
        .where(
          and(
            eq(questionNotes.courseId, ids.courseId),
            eq(questionNotes.userId, CAST.TALEBE)
          )
        )
    ).toEqual([]);
  });
});
