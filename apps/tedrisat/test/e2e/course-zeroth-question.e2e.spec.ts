import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
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
 * A course's own zeroth question (MDRS-299). The owner, 22 Nov 2026: "ders
 * özelinde sıfırıncı soru mümkün olsun, medreseninki default olur ders
 * özelinde değişebilir". Its exams ask its own when it has one, else its
 * medrese's; a course of a köşk alone publishes only with its own.
 */
describe("online exams, a course's own zeroth question (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const muderris = bearerOf(CAST.MUDERRIS);
  const MEDRESE = "Bu sınavda kopya çekmeyeceğine söz veriyor musun?";
  const OWN = "Bu hadisi ne zaman öğrendin?";

  const route = () => `/courses/${ids.courseId}/exam-zeroth-question`;
  const read = () =>
    http().get(route()).set("Authorization", muderris).expect(200);
  const save = (body: object, sub = muderris) =>
    http().put(route()).set("Authorization", sub).send(body);
  const audits = async (action: string) =>
    db()
      .select({ details: auditLog.details })
      .from(auditLog)
      .where(
        and(eq(auditLog.action, action), eq(auditLog.entityId, ids.courseId))
      );

  /** A draft with one complete question, at version 3. */
  const readyExam = async (): Promise<string> => {
    const examId = (
      await http()
        .post(`/courses/${ids.courseId}/online-exams`)
        .set("Authorization", muderris)
        .send({ title: "Ara sınav" })
        .expect(201)
    ).body.id as string;
    // Its length, typed without moving the version: a new exam has none.
    await db()
      .update(onlineExams)
      .set({ durationMinutes: 60 })
      .where(eq(onlineExams.id, examId));
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
  const publish = (examId: string) =>
    http()
      .post(`/online-exams/${examId}/publish`)
      .set("Authorization", muderris)
      .send({
        version: 3,
        startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      });
  const askedBy = async (examId: string) => {
    const draft = await http()
      .get(`/online-exams/${examId}`)
      .set("Authorization", muderris)
      .expect(200);
    return {
      text: draft.body.zerothQuestion as string,
      options: draft.body.zerothOptions.map((o: { text: string }) => o.text),
    };
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
    await db()
      .update(courses)
      .set({ madrasahId: madrasah.id })
      .where(eq(courses.id, ids.courseId));
    await db().insert(madrasahZerothQuestions).values({
      madrasahId: madrasah.id,
      text: MEDRESE,
      updatedBy: CAST.MANAGER,
    });
    await db()
      .insert(madrasahZerothOptions)
      .values(
        ["Evet, söz veriyorum", "Hayır"].map((text, position) => ({
          madrasahId: madrasah.id,
          position,
          text,
        }))
      );
  });

  afterAll(async () => {
    await app.close();
  });

  it("asks the medrese's by default, the course's own once it has one, and the medrese's again once that is taken off", async () => {
    expect((await read()).body).toMatchObject({
      own: null,
      madrasah: { text: MEDRESE, options: ["Evet, söz veriyorum", "Hayır"] },
      applies: "MADRASAH",
      inMadrasah: true,
    });

    const saved = await save({
      text: `  ${OWN} `,
      options: ["Bu derste", "Daha önce"],
    }).expect(200);
    expect(saved.body).toMatchObject({
      own: { text: OWN, options: ["Bu derste", "Daha önce"] },
      madrasah: { text: MEDRESE },
      applies: "COURSE",
    });
    // The same question again writes nothing.
    await save({ text: OWN, options: ["Bu derste", "Daha önce"] }).expect(200);
    const updates = await audits("course.zeroth_question.update");
    expect(updates).toHaveLength(1);
    expect(updates[0].details).toMatchObject({
      before: null,
      after: { text: OWN, options: ["Bu derste", "Daha önce"] },
    });

    // An exam published now copies the course's own.
    const examId = await readyExam();
    await publish(examId).expect(200);
    expect(await askedBy(examId)).toEqual({
      text: OWN,
      options: ["Bu derste", "Daha önce"],
    });

    const removed = await http()
      .delete(route())
      .set("Authorization", muderris)
      .expect(200);
    expect(removed.body).toMatchObject({
      own: null,
      madrasah: { text: MEDRESE },
      applies: "MADRASAH",
    });
    // Taking off what is not there writes nothing.
    await http().delete(route()).set("Authorization", muderris).expect(200);
    expect(await audits("course.zeroth_question.delete")).toHaveLength(1);
    // The exam already published keeps the question it was published with.
    expect((await askedBy(examId)).text).toBe(OWN);
  });

  it("refuses a question with fewer than two options, or two the same", async () => {
    const one = await save({ text: OWN, options: ["Evet"] }).expect(400);
    expect(one.body.code).toBe("VALIDATION_ERROR");
    await save({ text: OWN, options: ["Evet", "Evet"] }).expect(400);
    expect((await read()).body.applies).toBe("MADRASAH");
  });

  it("publishes a köşk's own course only with a question of its own", async () => {
    await db()
      .update(courses)
      .set({ madrasahId: null })
      .where(eq(courses.id, ids.courseId));
    expect((await read()).body).toEqual({
      own: null,
      madrasah: null,
      applies: "NONE",
      inMadrasah: false,
    });
    const examId = await readyExam();
    const refused = await publish(examId).expect(409);
    expect(refused.body.code).toBe("EXAM_NOT_READY");
    expect(refused.body.context.problems).toEqual([{ kind: "NO_ZEROTH" }]);

    await save({ text: OWN, options: ["Bu derste", "Daha önce"] }).expect(200);
    await publish(examId).expect(200);
    expect((await askedBy(examId)).text).toBe(OWN);
  });

  it("reads and writes only with exam.prepare", async () => {
    const session = bearerOf(CAST.SESSION);
    await http().get(route()).set("Authorization", session).expect(403);
    await save({ text: OWN, options: ["Bir", "İki"] }, session).expect(403);
    await http().delete(route()).set("Authorization", session).expect(403);
  });
});
