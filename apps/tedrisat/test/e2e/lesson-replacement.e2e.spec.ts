import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  lessons,
} from "../../src/database/schema/course.schema";
import {
  bearerOf,
  CAST,
  type CastMember,
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
 * MDRS-247 — `POST /lessons/:id/cancel` can name the session that makes up for
 * the cancelled one (telafi). The link is written to
 * `lessons.replacement_lesson_id`, which the session page and the course body
 * already read. A make-up is a live, standing session of the same course that
 * is not the cancelled one and does not already make up for another.
 */

const HOUR = 3_600_000;
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

describe("a cancelled session's make-up (MDRS-247, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let weekId: string;
  /** The session to cancel. */
  let cancelId: string;
  /** A later session that can stand in for it. */
  let makeUpId: string;
  /** Another session that can stand in for one. */
  let spareId: string;
  let otherCourseLessonId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const version = async (courseId = ids.courseId) =>
    (
      await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId))
    )[0].version;
  const lessonRow = async (id: string) =>
    (await db().select().from(lessons).where(eq(lessons.id, id)))[0];

  /** Cancels a session with the course's current version and checks the status it answers. */
  const cancel = async (
    sub: CastMember,
    id: string,
    body: { reason?: string; replacementLessonId?: string; version?: number },
    status: number
  ) => {
    const res = await http()
      .post(`/lessons/${id}/cancel`)
      .set("Authorization", bearerOf(sub))
      .send({ version: await version(), ...body });
    expect([res.status, res.body.code]).toEqual([status, res.body.code]);
    return res;
  };

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    ids = await seedCourseScope(db());
    weekId = ids.weekId;
    cancelId = await insertLiveLesson(db(), weekId, 0, {
      title: "Bir",
      scheduledAt: new Date(Date.now() + 24 * HOUR),
    });
    makeUpId = await insertLiveLesson(db(), weekId, 1, {
      title: "Telafi",
      scheduledAt: new Date(Date.now() + 96 * HOUR),
    });
    spareId = await insertLiveLesson(db(), weekId, 2, {
      title: "Üç",
      scheduledAt: new Date(Date.now() + 120 * HOUR),
    });
    const [otherWeek] = await db()
      .insert(courseWeeks)
      .values({
        courseId: ids.otherCourseId,
        weekNumber: 1,
        title: "Başka hafta",
        orderIndex: 0,
      })
      .returning();
    otherCourseLessonId = await insertLiveLesson(db(), otherWeek.id, 0, {
      title: "Başka dersin celsesi",
      scheduledAt: new Date(Date.now() + 96 * HOUR),
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("naming a make-up", () => {
    it("writes the link, answers with it and records it", async () => {
      const before = await version();
      const res = await cancel(
        CAST.SESSION,
        cancelId,
        {
          reason: "Müderris hasta",
          replacementLessonId: makeUpId,
        },
        200
      );
      expect(res.body).toMatchObject({
        id: cancelId,
        replacementLessonId: makeUpId,
        cancelReason: "Müderris hasta",
        courseVersion: before + 1,
      });
      expect(res.body.cancelledAt).toEqual(expect.any(String));

      const row = await lessonRow(cancelId);
      expect(row.replacementLessonId).toBe(makeUpId);
      expect(row.cancelledAt).not.toBeNull();
      // the make-up itself is untouched, and still standing
      expect(await lessonRow(makeUpId)).toMatchObject({
        cancelledAt: null,
        replacementLessonId: null,
      });
      const [entry] = await db()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "lesson.cancel"),
            eq(auditLog.entityId, cancelId)
          )
        );
      expect(entry).toMatchObject({
        actorId: CAST.SESSION,
        details: {
          courseId: ids.courseId,
          reason: "Müderris hasta",
          replacementLessonId: makeUpId,
        },
      });
    });

    it("shows on the session page and in the course body, which already read it", async () => {
      await cancel(
        CAST.SESSION,
        cancelId,
        {
          replacementLessonId: makeUpId,
        },
        200
      );

      const page = await http()
        .get(`/courses/${ids.courseId}/sessions/${cancelId}`)
        .set("Authorization", bearerOf(CAST.STRANGER))
        .expect(200);
      expect(page.body).toMatchObject({
        status: "CANCELLED",
        replacementSessionId: makeUpId,
        replacement: { id: makeUpId, title: "Telafi" },
      });

      const course = await http()
        .get(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.TALEBE))
        .expect(200);
      const shown = course.body.weeks
        .flatMap((w: { lessons: { id: string }[] }) => w.lessons)
        .find((l: { id: string }) => l.id === cancelId);
      expect(shown.replacementLessonId).toBe(makeUpId);
    });

    it("takes the id in any case", async () => {
      const res = await cancel(
        CAST.SESSION,
        cancelId,
        {
          replacementLessonId: makeUpId.toUpperCase(),
        },
        200
      );
      expect(res.body.replacementLessonId).toBe(makeUpId);
    });

    it("still cancels with no make-up, and leaves the link empty", async () => {
      const res = await cancel(
        CAST.SESSION,
        cancelId,
        {
          reason: "Tatil",
        },
        200
      );
      expect(res.body.replacementLessonId).toBeNull();
      expect((await lessonRow(cancelId)).replacementLessonId).toBeNull();
    });

    it("lets one session make up for two cancelled ones only the first time: it is taken then", async () => {
      await cancel(
        CAST.SESSION,
        cancelId,
        {
          replacementLessonId: makeUpId,
        },
        200
      );
      const before = await version();
      const res = await cancel(
        CAST.SESSION,
        spareId,
        {
          replacementLessonId: makeUpId,
        },
        409
      );
      expect(res.body.code).toBe("LESSON_REPLACEMENT_TAKEN");
      expect(res.body.context).toMatchObject({
        replacementLessonId: makeUpId,
        takenByLessonId: cancelId,
      });
      expect((await lessonRow(spareId)).cancelledAt).toBeNull();
      expect(await version()).toBe(before);
    });
  });

  describe("a make-up that cannot be one", () => {
    const refused = async (
      replacementLessonId: string,
      code: string,
      status = 400
    ) => {
      const before = await version();
      const res = await cancel(
        CAST.SESSION,
        cancelId,
        { reason: "Müderris hasta", replacementLessonId },
        status
      );
      expect(res.body.code).toBe(code);
      // nothing is half written: the session still stands, the version is the same
      const row = await lessonRow(cancelId);
      expect(row.cancelledAt).toBeNull();
      expect(row.replacementLessonId).toBeNull();
      expect(row.cancelReason).toBeNull();
      expect(await version()).toBe(before);
    };

    it("is the cancelled session itself", async () => {
      await refused(cancelId, "LESSON_REPLACEMENT_INVALID");
    });

    it("is a session of another course", async () => {
      await refused(otherCourseLessonId, "LESSON_REPLACEMENT_INVALID");
    });

    it("is not a session at all", async () => {
      await refused(ABSENT_ID, "LESSON_REPLACEMENT_INVALID");
    });

    it("is not a uuid", async () => {
      await cancel(
        CAST.SESSION,
        cancelId,
        {
          replacementLessonId: "yarın",
        },
        400
      );
      expect((await lessonRow(cancelId)).cancelledAt).toBeNull();
    });

    it("is hidden", async () => {
      await db()
        .update(lessons)
        .set({ archivedAt: new Date() })
        .where(eq(lessons.id, makeUpId));
      await refused(makeUpId, "LESSON_REPLACEMENT_INVALID");
    });

    it("is cancelled itself", async () => {
      await db()
        .update(lessons)
        .set({ cancelledAt: new Date() })
        .where(eq(lessons.id, makeUpId));
      await refused(makeUpId, "LESSON_REPLACEMENT_INVALID");
    });

    it("is a recorded lesson, not a live session", async () => {
      await db()
        .update(lessons)
        .set({ type: LessonType.VIDEO })
        .where(eq(lessons.id, makeUpId));
      await refused(makeUpId, "LESSON_REPLACEMENT_INVALID");
    });

    it("already makes up for another session", async () => {
      await db()
        .update(lessons)
        .set({ replacementLessonId: makeUpId })
        .where(eq(lessons.id, spareId));
      await refused(makeUpId, "LESSON_REPLACEMENT_TAKEN", 409);
    });

    it("answers a session cancelled already as that, whatever make-up it is sent with", async () => {
      await cancel(CAST.SESSION, cancelId, { reason: "Hasta" }, 200);
      const res = await cancel(
        CAST.SESSION,
        cancelId,
        {
          replacementLessonId: makeUpId,
        },
        409
      );
      expect(res.body.code).toBe("LESSON_ALREADY_CANCELLED");
      expect((await lessonRow(cancelId)).replacementLessonId).toBeNull();
      const res2 = await cancel(
        CAST.SESSION,
        cancelId,
        {
          replacementLessonId: otherCourseLessonId,
        },
        409
      );
      expect(res2.body.code).toBe("LESSON_ALREADY_CANCELLED");
    });

    it("is refused for a stale course version like any cancellation", async () => {
      const res = await cancel(
        CAST.SESSION,
        cancelId,
        {
          replacementLessonId: makeUpId,
          version: (await version()) + 5,
        },
        409
      );
      expect(res.body.code).toBe("COURSE_VERSION_CONFLICT");
      expect((await lessonRow(cancelId)).cancelledAt).toBeNull();
    });
  });

  describe("who may cancel, make-up or not", () => {
    it.each([
      ["a ders nazırı holding session.manage", CAST.SESSION],
      ["a ders nazırı holding it through a group", CAST.GROUP],
      [
        "a ders nazırı holding course.edit and session.manage",
        CAST.EDIT_AND_SESSION,
      ],
      ["the müderris", CAST.MUDERRIS],
      ["the köşk nazım", CAST.MANAGER],
      ["the başnazım", CAST.ADMIN],
    ])("lets %s name one", async (_name, sub) => {
      const res = await cancel(
        sub,
        cancelId,
        {
          replacementLessonId: makeUpId,
        },
        200
      );
      expect(res.body.replacementLessonId).toBe(makeUpId);
    });

    it.each([
      ["a ders nazırı holding only course.edit", CAST.EDIT],
      ["a ders nazırı holding recording.manage", CAST.RECORDING],
      ["a ders nazırı with an unrelated grant", CAST.WEEK_HIDE],
      ["a ders nazırı with no grant", CAST.BARE],
      ["a ders nazırı whose session.manage has lapsed", CAST.LAPSED],
      [
        "a ders nazırı holding session.manage in another course",
        CAST.OTHER_COURSE,
      ],
      ["an enrolled talebe", CAST.TALEBE],
      ["a stranger", CAST.STRANGER],
    ])("refuses %s, with or without a make-up, and writes nothing", async (_name, sub) => {
      const before = await version();
      for (const body of [{}, { replacementLessonId: makeUpId }]) {
        await cancel(sub, cancelId, body, 403);
      }
      expect((await lessonRow(cancelId)).cancelledAt).toBeNull();
      expect(await version()).toBe(before);
    });

    it("does not let a ders nazırı link a session of a course they hold nothing in", async () => {
      const [week] = await db()
        .select()
        .from(courseWeeks)
        .where(eq(courseWeeks.courseId, ids.otherCourseId));
      const ownId = await insertLiveLesson(db(), week.id, 1, {
        title: "Kendi celsesi",
        scheduledAt: new Date(Date.now() + 24 * HOUR),
      });
      // they may cancel a session of their own course, but not name one of course A
      const res = await cancel(
        CAST.OTHER_COURSE,
        ownId,
        {
          replacementLessonId: makeUpId,
        },
        400
      );
      expect(res.body.code).toBe("LESSON_REPLACEMENT_INVALID");
      expect((await lessonRow(ownId)).cancelledAt).toBeNull();
      await cancel(
        CAST.OTHER_COURSE,
        ownId,
        {
          replacementLessonId: otherCourseLessonId,
        },
        200
      );
    });
  });
});
