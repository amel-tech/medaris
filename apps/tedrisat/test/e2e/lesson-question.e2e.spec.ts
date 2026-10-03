import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { purgeCourses } from "../../src/course/course-purge";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { bans } from "../../src/database/schema/ban.schema";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { lessonQuestions } from "../../src/database/schema/lesson-question.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { LESSON_QUESTION_BODY_MAX } from "../../src/lesson-question/dto/lesson-question.dto";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-150 — a talebe's questions to the course staff. Covers who may ask (an
 * active enrollment no ban bars, and nobody else); who reads a question (its
 * author, and whoever holds `question.answer` in the course: the müderris,
 * a ders nazırı given it directly or through a group, and the catalogue's
 * other holders); who answers it; and that the author reads the answer.
 */

const MANAGER_ID = "e1510000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e1510000-0000-4000-8000-000000000002";
const FOREIGN_MUDERRIS_ID = "e1510000-0000-4000-8000-000000000003";
const NAZIR_ID = "e1510000-0000-4000-8000-000000000004";
const GROUP_NAZIR_ID = "e1510000-0000-4000-8000-000000000005";
const PLAIN_NAZIR_ID = "e1510000-0000-4000-8000-000000000006";
const OTHER_PERMISSION_NAZIR_ID = "e1510000-0000-4000-8000-000000000007";
const EXPIRED_NAZIR_ID = "e1510000-0000-4000-8000-000000000008";
const FOREIGN_NAZIR_ID = "e1510000-0000-4000-8000-000000000009";
const TALEBE_ID = "e1510000-0000-4000-8000-00000000000a";
const OTHER_TALEBE_ID = "e1510000-0000-4000-8000-00000000000b";
const COMPLETED_ID = "e1510000-0000-4000-8000-00000000000c";
const PENDING_ID = "e1510000-0000-4000-8000-00000000000d";
const REVOKED_ID = "e1510000-0000-4000-8000-00000000000e";
const BARRED_ID = "e1510000-0000-4000-8000-00000000000f";
const STRANGER_ID = "e1510000-0000-4000-8000-000000000010";
const ADMIN_ID = "e1510000-0000-4000-8000-000000000011";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const QUESTION = "Hocam, istisnâ mef'ûl-ü bih midir?";
const ANSWER = "Hayır, **müstesnâ**dır.";

describe("a talebe's questions to the course staff (MDRS-150, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let foreignCourseId: string;
  let lessonId: string;
  let otherLessonId: string;
  let foreignLessonId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) =>
    sub === ADMIN_ID
      ? bearerFor({
          sub,
          claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
        })
      : bearerFor({ sub });

  const ask = (onLesson: string, sub: string, body: unknown) =>
    http()
      .post(`/lessons/${onLesson}/questions`)
      .set("Authorization", as(sub))
      .send(body as object);
  const mine = (inCourse: string, sub: string) =>
    http()
      .get(`/courses/${inCourse}/questions/mine`)
      .set("Authorization", as(sub));
  const queue = (inCourse: string, sub: string) =>
    http().get(`/courses/${inCourse}/questions`).set("Authorization", as(sub));
  const answer = (questionId: string, sub: string, body: unknown) =>
    http()
      .put(`/questions/${questionId}/answer`)
      .set("Authorization", as(sub))
      .send(body as object);

  /** A question written straight into the table. */
  const seed = async (
    authorId: string,
    values: { body?: string; lessonId?: string } = {}
  ) => {
    const [row] = await db()
      .insert(lessonQuestions)
      .values({
        lessonId: values.lessonId ?? lessonId,
        authorId,
        body: values.body ?? QUESTION,
      })
      .returning();
    return row;
  };

  const stored = () => db().select().from(lessonQuestions);

  const clean = () =>
    dbUtils.cleanTables(
      "bans",
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "users"
    );

  /** Everyone who holds `question.answer` in the course, one way or another. */
  const HOLDERS: Array<[string, string]> = [
    ["the müderris", MUDERRIS_ID],
    ["a ders nazırı given it", NAZIR_ID],
    ["a ders nazırı given it through a group", GROUP_NAZIR_ID],
    ["the köşk nazımı, through course.manage_all", MANAGER_ID],
    ["the başnazım", ADMIN_ID],
  ];

  /** Everyone who does not. */
  const OTHERS: Array<[string, string]> = [
    ["the author, a talebe", TALEBE_ID],
    ["another talebe of the course", OTHER_TALEBE_ID],
    ["a ders nazırı with no grant", PLAIN_NAZIR_ID],
    ["a ders nazırı given another permission", OTHER_PERMISSION_NAZIR_ID],
    ["a ders nazırı whose grant ran out", EXPIRED_NAZIR_ID],
    ["a ders nazırı of another course", FOREIGN_NAZIR_ID],
    ["the müderris of another course", FOREIGN_MUDERRIS_ID],
    ["somebody with no part in the course", STRANGER_ID],
  ];

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
    });
    const [course, foreignCourse] = await db()
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Nahiv",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    courseId = course.id;
    foreignCourseId = foreignCourse.id;
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
    });
    await assignRole(db(), {
      userId: FOREIGN_MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: foreignCourseId,
      grantedBy: MANAGER_ID,
    });
    const [week, foreignWeek] = await db()
      .insert(courseWeeks)
      .values([
        { courseId, weekNumber: 2, title: "Emsile", orderIndex: 0 },
        {
          courseId: foreignCourseId,
          weekNumber: 1,
          title: "Nahiv",
          orderIndex: 0,
        },
      ])
      .returning();
    [{ id: lessonId }, { id: otherLessonId }, { id: foreignLessonId }] =
      await db()
        .insert(lessons)
        .values([
          {
            weekId: week.id,
            title: "Birinci celse",
            type: LessonType.LIVE,
            orderIndex: 0,
            scheduledAt: new Date(Date.now() - 10 * 60_000),
            durationMinutes: 60,
          },
          {
            weekId: week.id,
            title: "İkinci celse",
            type: LessonType.VIDEO,
            orderIndex: 1,
          },
          {
            weekId: foreignWeek.id,
            title: "Başka dersin celsesi",
            type: LessonType.LIVE,
            orderIndex: 0,
          },
        ])
        .returning();

    const status = (userId: string, s: EnrollmentStatus) => ({
      userId,
      courseId,
      status: s,
    });
    await db()
      .insert(enrollments)
      .values([
        status(TALEBE_ID, EnrollmentStatus.ENROLLED),
        status(OTHER_TALEBE_ID, EnrollmentStatus.ENROLLED),
        status(COMPLETED_ID, EnrollmentStatus.COMPLETED),
        status(PENDING_ID, EnrollmentStatus.PENDING),
        status(REVOKED_ID, EnrollmentStatus.REVOKED),
        status(BARRED_ID, EnrollmentStatus.ENROLLED),
      ]);
    await db().insert(bans).values({
      userId: BARRED_ID,
      koskId: kosk.id,
      courseId,
      scope: "COURSE",
      reason: "Düzeni bozdu.",
      bannedBy: MUDERRIS_ID,
      bannedRole: "MUDERRIS",
      bannedTier: 1,
    });

    // Ders nazırları (MDRS-172): the post, and what each was given with it.
    for (const id of [
      NAZIR_ID,
      GROUP_NAZIR_ID,
      PLAIN_NAZIR_ID,
      OTHER_PERMISSION_NAZIR_ID,
      EXPIRED_NAZIR_ID,
    ]) {
      await assignRole(db(), {
        userId: id,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: MUDERRIS_ID,
      });
    }
    await assignRole(db(), {
      userId: FOREIGN_NAZIR_ID,
      role: ASSIGNED_ROLES.DERS_NAZIR,
      scopeId: foreignCourseId,
      grantedBy: MANAGER_ID,
    });
    const [group] = await db()
      .insert(permissionGroups)
      .values({
        scopeType: "course",
        scopeId: courseId,
        name: "Sorular",
        createdBy: MUDERRIS_ID,
      })
      .returning();
    await db()
      .insert(permissionGroupItems)
      .values([
        { groupId: group.id, permission: "question.answer" },
        { groupId: group.id, permission: "session.manage" },
      ]);
    const grant = { scopeType: "course" as const, grantedBy: MUDERRIS_ID };
    await db()
      .insert(permissionGrants)
      .values([
        {
          ...grant,
          userId: NAZIR_ID,
          scopeId: courseId,
          permission: "question.answer",
        },
        {
          ...grant,
          userId: GROUP_NAZIR_ID,
          scopeId: courseId,
          groupId: group.id,
        },
        {
          ...grant,
          userId: OTHER_PERMISSION_NAZIR_ID,
          scopeId: courseId,
          permission: "session.live_link",
        },
        {
          ...grant,
          userId: EXPIRED_NAZIR_ID,
          scopeId: courseId,
          permission: "question.answer",
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          ...grant,
          userId: FOREIGN_NAZIR_ID,
          scopeId: foreignCourseId,
          permission: "question.answer",
        },
      ]);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("asking", () => {
    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["a talebe who completed the course", COMPLETED_ID],
    ])("lets %s ask, and lists the question under their own", async (_who, sub) => {
      const res = await ask(lessonId, sub, { body: QUESTION }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        lessonId,
        lessonTitle: "Birinci celse",
        weekNumber: 2,
        body: QUESTION,
        createdAt: expect.any(String),
        answer: null,
      });
      // The author is the caller; the response names no one else either.
      expect(res.body).not.toHaveProperty("author");
      expect(res.body).not.toHaveProperty("authorId");

      const own = await mine(courseId, sub).expect(200);
      expect(own.body).toEqual([res.body]);
      expect(own.headers["cache-control"]).toBe("private, no-store");
      expect(await stored()).toHaveLength(1);
    });

    it.each([
      ["a talebe whose application is pending", PENDING_ID],
      ["a talebe whose access was withdrawn", REVOKED_ID],
      ["a talebe barred from the course", BARRED_ID],
      ["somebody not enrolled", STRANGER_ID],
      ["the müderris", MUDERRIS_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["a ders nazırı holding question.answer", NAZIR_ID],
      ["the başnazım", ADMIN_ID],
    ])("refuses %s with 403 LESSON_QUESTION_FORBIDDEN", async (_who, sub) => {
      const res = await ask(lessonId, sub, { body: QUESTION }).expect(403);
      expect(res.body.code).toBe("LESSON_QUESTION_FORBIDDEN");
      expect(await stored()).toHaveLength(0);
    });

    it("refuses a talebe of another course", async () => {
      await ask(foreignLessonId, TALEBE_ID, { body: QUESTION }).expect(403);
      expect(await stored()).toHaveLength(0);
    });

    it("answers a session that does not exist with 404", async () => {
      const res = await ask(ABSENT_ID, TALEBE_ID, { body: QUESTION }).expect(
        404
      );
      expect(res.body.code).toBe("LESSON_NOT_FOUND");
    });

    it("trims the text and takes exactly the longest one", async () => {
      const trimmed = await ask(lessonId, TALEBE_ID, {
        body: `  ${QUESTION}\n`,
      }).expect(201);
      expect(trimmed.body.body).toBe(QUESTION);
      await ask(lessonId, TALEBE_ID, {
        body: "ب".repeat(LESSON_QUESTION_BODY_MAX),
      }).expect(201);
    });

    it.each([
      ["no text", {}],
      ["empty text", { body: "" }],
      ["blank text", { body: "  \n " }],
      [
        "text over the limit",
        { body: "a".repeat(LESSON_QUESTION_BODY_MAX + 1) },
      ],
      ["text that is not a string", { body: 7 }],
      ["a key the route does not know", { body: QUESTION, authorId: ADMIN_ID }],
      ["an answer smuggled in", { body: QUESTION, answer: "Evet." }],
    ])("refuses %s with 400", async (_what, body) => {
      await ask(lessonId, TALEBE_ID, body).expect(400);
      expect(await stored()).toHaveLength(0);
    });
  });

  describe("who reads a question", () => {
    beforeEach(async () => {
      await seed(TALEBE_ID);
    });

    it.each(
      HOLDERS
    )("shows the course's questions to %s", async (_who, sub) => {
      const res = await queue(courseId, sub).expect(200);
      expect(res.body).toEqual([
        {
          id: expect.any(String),
          lessonId,
          lessonTitle: "Birinci celse",
          weekNumber: 2,
          body: QUESTION,
          createdAt: expect.any(String),
          author: { id: TALEBE_ID, name: null },
          answer: null,
        },
      ]);
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });

    it.each(
      OTHERS
    )("shows them to nobody who is %s: 403", async (_who, sub) => {
      const res = await queue(courseId, sub).expect(403);
      // Nothing of the question in the refusal.
      expect(JSON.stringify(res.body)).not.toContain(QUESTION);
    });

    it("answers the staff list of a course that does not exist with 404", async () => {
      await queue(ABSENT_ID, MUDERRIS_ID).expect(404);
      await queue(ABSENT_ID, ADMIN_ID).expect(404);
    });

    it("names the author, by the name on the account or by its e-mail", async () => {
      await db()
        .insert(users)
        .values([
          { id: TALEBE_ID, givenName: "Ali", familyName: "Veli" },
          { id: OTHER_TALEBE_ID, email: "diger@example.test" },
        ]);
      await seed(OTHER_TALEBE_ID, { body: "İkinci soru" });
      const res = await queue(courseId, MUDERRIS_ID).expect(200);
      const byAuthor = Object.fromEntries(
        res.body.map((q: { author: { id: string; name: string } }) => [
          q.author.id,
          q.author.name,
        ])
      );
      expect(byAuthor).toEqual({
        [TALEBE_ID]: "Ali Veli",
        [OTHER_TALEBE_ID]: "diger@example.test",
      });
    });

    it("keeps one course's questions out of another course's list", async () => {
      await seed(TALEBE_ID, {
        lessonId: foreignLessonId,
        body: "Nahiv sorusu",
      });
      const res = await queue(courseId, MUDERRIS_ID).expect(200);
      expect(res.body.map((q: { body: string }) => q.body)).toEqual([QUESTION]);
      // The müderris of the other course reads that one, and only that one.
      const foreign = await queue(foreignCourseId, FOREIGN_MUDERRIS_ID).expect(
        200
      );
      expect(foreign.body.map((q: { body: string }) => q.body)).toEqual([
        "Nahiv sorusu",
      ]);
      await queue(courseId, FOREIGN_MUDERRIS_ID).expect(403);
    });

    it("lists those still waiting first, oldest first", async () => {
      const [first] = await stored();
      await db()
        .update(lessonQuestions)
        .set({
          answer: ANSWER,
          answeredBy: MUDERRIS_ID,
          answeredAt: new Date(),
        })
        .where(eq(lessonQuestions.id, first.id));
      await seed(TALEBE_ID, { body: "Beklemede bir" });
      await seed(OTHER_TALEBE_ID, { body: "Beklemede iki" });
      const res = await queue(courseId, MUDERRIS_ID).expect(200);
      expect(res.body.map((q: { body: string }) => q.body)).toEqual([
        "Beklemede bir",
        "Beklemede iki",
        QUESTION,
      ]);
    });
  });

  describe("privacy of a question", () => {
    it("gives another talebe, the staff and the başnazım nothing in the author's own list", async () => {
      await seed(TALEBE_ID);
      for (const sub of [
        OTHER_TALEBE_ID,
        COMPLETED_ID,
        MUDERRIS_ID,
        NAZIR_ID,
        MANAGER_ID,
        ADMIN_ID,
        STRANGER_ID,
      ]) {
        const res = await mine(courseId, sub).expect(200);
        expect(res.body).toEqual([]);
      }
      const own = await mine(courseId, TALEBE_ID).expect(200);
      expect(own.body).toHaveLength(1);
    });

    it("lists only the caller's questions when two talebe have asked", async () => {
      await seed(TALEBE_ID, { body: "Benim sorum" });
      await seed(OTHER_TALEBE_ID, { body: "Onun sorusu" });
      const res = await mine(courseId, TALEBE_ID).expect(200);
      expect(res.body.map((q: { body: string }) => q.body)).toEqual([
        "Benim sorum",
      ]);
    });

    it("lets another talebe neither answer nor find the question", async () => {
      const question = await seed(TALEBE_ID);
      const res = await answer(question.id, OTHER_TALEBE_ID, {
        body: ANSWER,
      }).expect(404);
      expect(JSON.stringify(res.body)).not.toContain(QUESTION);
      const [row] = await stored();
      expect(row.answer).toBeNull();
    });

    it("leaves no route that reads a question by its id", async () => {
      const question = await seed(TALEBE_ID);
      for (const sub of [TALEBE_ID, MUDERRIS_ID, ADMIN_ID]) {
        for (const path of [
          `/questions/${question.id}`,
          `/lessons/${lessonId}/questions`,
          `/lessons/${lessonId}/questions/${question.id}`,
        ]) {
          const res = await http().get(path).set("Authorization", as(sub));
          expect(res.status).toBe(404);
        }
      }
    });

    it("carries no question in a course, session or recording response", async () => {
      await seed(TALEBE_ID, { body: "ÖZEL-SORU-İŞARETİ" });
      for (const path of [
        `/courses/${courseId}`,
        `/courses/${courseId}/recordings`,
        `/courses/${courseId}/sessions/${lessonId}`,
      ]) {
        const res = await http().get(path).set("Authorization", as(TALEBE_ID));
        expect(JSON.stringify(res.body)).not.toContain("ÖZEL-SORU-İŞARETİ");
      }
    });
  });

  describe("answering", () => {
    it.each(HOLDERS)("lets %s answer", async (_who, sub) => {
      const question = await seed(TALEBE_ID);
      const res = await answer(question.id, sub, { body: ANSWER }).expect(200);
      expect(res.body).toMatchObject({
        id: question.id,
        body: QUESTION,
        author: { id: TALEBE_ID },
        answer: {
          body: ANSWER,
          answeredAt: expect.any(String),
          answeredBy: { id: sub },
        },
      });
      const [row] = await stored();
      expect(row).toMatchObject({ answer: ANSWER, answeredBy: sub });
    });

    it.each(
      OTHERS
    )("refuses %s with 404 and keeps the question open", async (_who, sub) => {
      const question = await seed(TALEBE_ID);
      const res = await answer(question.id, sub, { body: ANSWER }).expect(404);
      expect(res.body.code).toBe("LESSON_QUESTION_NOT_FOUND");
      const [row] = await stored();
      expect(row.answer).toBeNull();
      expect(row.answeredBy).toBeNull();
    });

    it("answers a question that does not exist the same way, for everyone", async () => {
      for (const sub of [MUDERRIS_ID, ADMIN_ID, TALEBE_ID]) {
        const res = await answer(ABSENT_ID, sub, { body: ANSWER }).expect(404);
        expect(res.body.code).toBe("LESSON_QUESTION_NOT_FOUND");
      }
      await http()
        .put("/questions/not-a-uuid/answer")
        .set("Authorization", as(MUDERRIS_ID))
        .send({ body: ANSWER })
        .expect(404);
    });

    it("replaces an earlier answer, by whoever gives the next one", async () => {
      const question = await seed(TALEBE_ID);
      await answer(question.id, MUDERRIS_ID, { body: "İlk cevap" }).expect(200);
      const res = await answer(question.id, NAZIR_ID, {
        body: `  ${ANSWER}  `,
      }).expect(200);
      expect(res.body.answer).toMatchObject({
        body: ANSWER,
        answeredBy: { id: NAZIR_ID },
      });
      const rows = await stored();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ answer: ANSWER, answeredBy: NAZIR_ID });
    });

    it.each([
      ["no text", {}],
      ["blank text", { body: "   " }],
      [
        "text over the limit",
        { body: "a".repeat(LESSON_QUESTION_BODY_MAX + 1) },
      ],
      ["a key the route does not know", { body: ANSWER, answeredBy: ADMIN_ID }],
    ])("refuses %s with 400", async (_what, body) => {
      const question = await seed(TALEBE_ID);
      await answer(question.id, MUDERRIS_ID, body).expect(400);
      const [row] = await stored();
      expect(row.answer).toBeNull();
    });

    it("stops a ders nazırı when the grant is taken back", async () => {
      const question = await seed(TALEBE_ID);
      await answer(question.id, NAZIR_ID, { body: ANSWER }).expect(200);
      await db()
        .update(permissionGrants)
        .set({ revokedAt: new Date(), revokedBy: MUDERRIS_ID })
        .where(eq(permissionGrants.userId, NAZIR_ID));
      await answer(question.id, NAZIR_ID, { body: "Yeni" }).expect(404);
      await queue(courseId, NAZIR_ID).expect(403);
    });
  });

  describe("the author reads the answer (Sorularım)", () => {
    it("shows the answer, who gave it and when", async () => {
      const question = await seed(TALEBE_ID);
      await db()
        .insert(users)
        .values({ id: MUDERRIS_ID, givenName: "Mehmed", familyName: "Efendi" });
      expect((await mine(courseId, TALEBE_ID).expect(200)).body[0].answer).toBe(
        null
      );

      await answer(question.id, MUDERRIS_ID, { body: ANSWER }).expect(200);
      const res = await mine(courseId, TALEBE_ID).expect(200);
      expect(res.body).toEqual([
        {
          id: question.id,
          lessonId,
          lessonTitle: "Birinci celse",
          weekNumber: 2,
          body: QUESTION,
          createdAt: expect.any(String),
          answer: {
            body: ANSWER,
            answeredAt: expect.any(String),
            answeredBy: { id: MUDERRIS_ID, name: "Mehmed Efendi" },
          },
        },
      ]);
    });

    it("lists the newest question first, across the course's sessions", async () => {
      await seed(TALEBE_ID, { body: "Eski soru" });
      await seed(TALEBE_ID, { body: "Yeni soru", lessonId: otherLessonId });
      const res = await mine(courseId, TALEBE_ID).expect(200);
      expect(res.body.map((q: { body: string }) => q.body)).toEqual([
        "Yeni soru",
        "Eski soru",
      ]);
    });

    it.each([
      ["whose access was withdrawn", REVOKED_ID],
      ["who is barred from the course", BARRED_ID],
    ])("is still read by a talebe %s", async (_who, sub) => {
      await seed(sub);
      const res = await mine(courseId, sub).expect(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("storage", () => {
    it("takes an answer only with the person and the time that gave it", async () => {
      const question = await seed(TALEBE_ID);
      await expect(
        db()
          .update(lessonQuestions)
          .set({ answer: ANSWER })
          .where(eq(lessonQuestions.id, question.id))
      ).rejects.toThrow();
    });

    it("goes with its course when the course is deleted for good", async () => {
      await seed(TALEBE_ID);
      await seed(OTHER_TALEBE_ID, { lessonId: otherLessonId });
      await db().transaction((tx) => purgeCourses(tx, [courseId]));
      expect(await stored()).toHaveLength(0);
    });
  });
});
