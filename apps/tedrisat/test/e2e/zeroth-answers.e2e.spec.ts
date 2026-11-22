import { ROLES, SCOPE_TYPES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses, courseWeeks } from "../../src/database/schema/course.schema";
import { zerothAnswers } from "../../src/database/schema/exam-attempt.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  onlineExams,
  zerothOptions,
} from "../../src/database/schema/online-exam.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { zerothKey } from "../../src/online-exam/domain/zeroth-counts";
import { insertLiveLesson } from "../helpers/course-scope-cast";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-299: how the zeroth question of the online exams was answered, as
 * Medaris management reads it in nizam. Platform management holding
 * `exam.zeroth_read` (and the başnazım) reads every köşk, a köşk nazımı their
 * own. Every count is sent as it is, small ones included (the owner, 22 Nov
 * 2026: "neden gizleyeyim tabi ki görünecek"), and no user id is ever in the
 * answer.
 */
const ADMIN_ID = "e2990000-0000-4000-8000-000000000001";
const MEDARIS_ID = "e2990000-0000-4000-8000-000000000002";
const BARE_MEDARIS_ID = "e2990000-0000-4000-8000-000000000003";
const NAZIM_A_ID = "e2990000-0000-4000-8000-000000000004";
const STRANGER_ID = "e2990000-0000-4000-8000-000000000005";

const QUESTION = "Bu hadisi ne zaman öğrendiniz?";
const OPTIONS = ["Bu derste", "Daha önce"];

describe("the zeroth answers, in aggregate (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskA: string;
  let koskB: string;
  let talebe = 0;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const auth = (sub: string) =>
    sub === ADMIN_ID
      ? bearerFor({
          sub,
          claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
        })
      : bearerFor({ sub, claims: {} });

  const DAY = 86_400_000;
  const span = {
    from: new Date(Date.now() - 30 * DAY).toISOString(),
    to: new Date(Date.now() + DAY).toISOString(),
  };
  const list = (sub: string, query: Record<string, string> = {}) =>
    http()
      .get("/nizam/exam-zeroth-answers")
      .query({ ...span, ...query })
      .set("Authorization", auth(sub));
  const detail = (
    sub: string,
    key: string,
    query: Record<string, string> = {}
  ) =>
    http()
      .get(`/nizam/exam-zeroth-answers/${key}`)
      .query({ ...span, ...query })
      .set("Authorization", auth(sub));

  /** A published exam of a köşk's course, its celse `daysAgo` days back, answered `counts[j]` times on option j. */
  const exam = async (
    koskId: string,
    counts: number[],
    values: {
      daysAgo?: number;
      question?: string;
      options?: string[];
      published?: boolean;
      title?: string;
    } = {}
  ): Promise<string> => {
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: NAZIM_A_ID,
        title: values.title ?? "Usûl-i Fıkıh",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId: course.id, weekNumber: 1, title: "Hafta 1" })
      .returning();
    const lessonId = await insertLiveLesson(db(), week.id, 0, {
      scheduledAt: new Date(Date.now() - (values.daysAgo ?? 2) * DAY),
    });
    const [row] = await db()
      .insert(onlineExams)
      .values({
        courseId: course.id,
        lessonId,
        title: "Ara sınav",
        zerothQuestion: values.question ?? QUESTION,
        publishedAt: values.published === false ? null : new Date(),
        createdBy: NAZIM_A_ID,
      })
      .returning();
    const options = await db()
      .insert(zerothOptions)
      .values(
        (values.options ?? OPTIONS).map((text, position) => ({
          examId: row.id,
          position,
          text,
        }))
      )
      .returning();
    const answers = counts.flatMap((n, j) =>
      Array.from({ length: n }, () => ({
        examId: row.id,
        userId: `e2990000-0000-4000-9000-${String(++talebe).padStart(12, "0")}`,
        optionId: options[j].id,
      }))
    );
    if (answers.length > 0) await db().insert(zerothAnswers).values(answers);
    return row.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "permission_grants");
    await app.close();
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "permission_grants");
    [{ id: koskA }, { id: koskB }] = await db()
      .insert(kosks)
      .values([
        { ownerId: NAZIM_A_ID, name: "Fatih Köşkü" },
        { ownerId: ADMIN_ID, name: "Üsküdar Köşkü" },
      ])
      .returning();
    await assignRole(db(), {
      userId: NAZIM_A_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskA,
    });
    for (const userId of [MEDARIS_ID, BARE_MEDARIS_ID]) {
      await db().insert(roleAssignments).values({
        userId,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
    }
    await db().insert(permissionGrants).values({
      userId: MEDARIS_ID,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      permission: "exam.zeroth_read",
      grantedBy: ADMIN_ID,
    });
  });

  it("counts the same words of two köşks together for platform management, with no user id", async () => {
    await exam(koskA, [9, 6], { title: "Fıkıh" });
    await exam(koskB, [7, 5], { title: "Akaid" });
    await exam(koskB, [8, 8], {
      question: "Ne zaman ezberlersiniz?",
      options: ["Bu hafta", "Sonra"],
    });
    for (const sub of [ADMIN_ID, MEDARIS_ID]) {
      const res = await list(sub).expect(200);
      expect(res.body.everyKosk).toBe(true);
      expect(res.body.questions).toHaveLength(2);
      const asked = res.body.questions.find(
        (q: { question: string }) => q.question === QUESTION
      );
      expect(asked).toEqual({
        questionKey: zerothKey(QUESTION, OPTIONS),
        question: QUESTION,
        exams: 2,
        answered: 27,
        options: [
          { text: "Bu derste", count: 16 },
          { text: "Daha önce", count: 11 },
        ],
      });
      expect(
        res.body.courses.map((c: { courseTitle: string }) => c.courseTitle)
      ).toEqual(expect.arrayContaining(["Fıkıh", "Akaid"]));
      expect(JSON.stringify(res.body)).not.toMatch(/e2990000-0000-4000-9000/);
    }
    const [row] = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "exam.zeroth_read"))
      .limit(1);
    expect(row).toBeDefined();
  });

  it("gives a köşk nazımı their own köşk only, and refuses another köşk", async () => {
    await exam(koskA, [9, 6]);
    await exam(koskB, [7, 5]);
    const own = await list(NAZIM_A_ID).expect(200);
    expect(own.body.everyKosk).toBe(false);
    expect(own.body.questions).toHaveLength(1);
    expect(own.body.questions[0].exams).toBe(1);
    expect(own.body.questions[0].answered).toBe(15);
    expect(
      own.body.courses.every((c: { koskId: string }) => c.koskId === koskA)
    ).toBe(true);
    await list(NAZIM_A_ID, { koskId: koskA }).expect(200);
    const other = await list(NAZIM_A_ID, { koskId: koskB }).expect(403);
    expect(other.body.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("refuses a Medaris nazımı without the grant, and anyone else", async () => {
    await list(BARE_MEDARIS_ID).expect(403);
    await list(STRANGER_ID).expect(403);
    await http().get("/nizam/exam-zeroth-answers").query(span).expect(401);
  });

  it("sends small counts as they are, one to four included", async () => {
    await exam(koskA, [7, 3]);
    const res = await list(ADMIN_ID).expect(200);
    expect(res.body.questions[0].answered).toBe(10);
    expect(res.body.questions[0].options).toEqual([
      { text: "Bu derste", count: 7 },
      { text: "Daha önce", count: 3 },
    ]);
    await exam(koskB, [2, 1], { question: "Az cevaplanan" });
    const few = (await list(ADMIN_ID).expect(200)).body.questions.find(
      (q: { question: string }) => q.question === "Az cevaplanan"
    );
    expect(few.answered).toBe(3);
    expect(few.options).toEqual([
      { text: "Bu derste", count: 2 },
      { text: "Daha önce", count: 1 },
    ]);
  });

  it("leaves out drafts and exams outside the span", async () => {
    await exam(koskA, [9, 9], { published: false });
    await exam(koskA, [9, 9], { daysAgo: 60 });
    const res = await list(ADMIN_ID).expect(200);
    expect(res.body.questions).toEqual([]);
  });

  it("opens one question's exams, newest first, every count as it is", async () => {
    await exam(koskA, [6, 2], { daysAgo: 5, title: "Fıkıh" });
    await exam(koskB, [7, 8], { daysAgo: 1, title: "Akaid" });
    const key = zerothKey(QUESTION, OPTIONS);
    const res = await detail(ADMIN_ID, key).expect(200);
    expect(res.body.answered).toBe(23);
    expect(res.body.options).toEqual([
      { text: "Bu derste", count: 13 },
      { text: "Daha önce", count: 10 },
    ]);
    expect(
      res.body.exams.map((e: { courseTitle: string }) => e.courseTitle)
    ).toEqual(["Akaid", "Fıkıh"]);
    expect(res.body.exams[0]).toMatchObject({ answered: 15, options: [7, 8] });
    expect(res.body.exams[1]).toMatchObject({ answered: 8, options: [6, 2] });
    expect(JSON.stringify(res.body)).not.toMatch(/e2990000-0000-4000-9000/);

    const gone = await detail(ADMIN_ID, "0".repeat(32)).expect(404);
    expect(gone.body.code).toBe("ZEROTH_QUESTION_NOT_FOUND");
    // The key sent is not echoed back.
    expect(JSON.stringify(gone.body)).not.toContain("0".repeat(32));
    await detail(NAZIM_A_ID, key, { koskId: koskB }).expect(403);
  });

  it("refuses a span that ends before it starts, or has no end", async () => {
    const res = await http()
      .get("/nizam/exam-zeroth-answers")
      .query({ from: span.to, to: span.from })
      .set("Authorization", auth(ADMIN_ID))
      .expect(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    await http()
      .get("/nizam/exam-zeroth-answers")
      .query({ from: span.from })
      .set("Authorization", auth(ADMIN_ID))
      .expect(400);
  });
});
