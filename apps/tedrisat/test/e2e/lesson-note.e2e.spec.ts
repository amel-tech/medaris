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
import { lessonNotes } from "../../src/database/schema/lesson-note.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import {
  LESSON_NOTE_BODY_MAX,
  LESSON_NOTE_OFFSET_MAX,
} from "../../src/lesson-note/dto/lesson-note.dto";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-150 — a talebe's private notes on a session's video. Covers the
 * author's create, list, edit and delete; who may write (an active enrollment
 * no ban bars, and nobody else); the DTO's limits; and the pin on privacy:
 * another talebe and a SYSTEM_ADMIN get nothing of someone else's note from
 * any route there is.
 */

const MANAGER_ID = "e1500000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e1500000-0000-4000-8000-000000000002";
const TALEBE_ID = "e1500000-0000-4000-8000-000000000003";
const OTHER_TALEBE_ID = "e1500000-0000-4000-8000-000000000004";
const COMPLETED_ID = "e1500000-0000-4000-8000-000000000005";
const PENDING_ID = "e1500000-0000-4000-8000-000000000006";
const REVOKED_ID = "e1500000-0000-4000-8000-000000000007";
const BARRED_ID = "e1500000-0000-4000-8000-000000000008";
const STRANGER_ID = "e1500000-0000-4000-8000-000000000009";
const ADMIN_ID = "e1500000-0000-4000-8000-00000000000a";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const SECRET = "Gizli not: fâilin i'rabı.";

describe("a talebe's private notes (MDRS-150, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let liveLessonId: string;
  let videoLessonId: string;
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

  const list = (lessonId: string, sub: string) =>
    http().get(`/lessons/${lessonId}/notes`).set("Authorization", as(sub));
  const create = (lessonId: string, sub: string, body: unknown) =>
    http()
      .post(`/lessons/${lessonId}/notes`)
      .set("Authorization", as(sub))
      .send(body as object);
  const edit = (lessonId: string, noteId: string, sub: string, body: unknown) =>
    http()
      .patch(`/lessons/${lessonId}/notes/${noteId}`)
      .set("Authorization", as(sub))
      .send(body as object);
  const remove = (lessonId: string, noteId: string, sub: string) =>
    http()
      .delete(`/lessons/${lessonId}/notes/${noteId}`)
      .set("Authorization", as(sub));

  /** A note written straight into the table, as it stands for `authorId`. */
  const seed = async (
    authorId: string,
    values: { body?: string; offsetSeconds?: number | null } = {},
    lessonId = liveLessonId
  ) => {
    const [row] = await db()
      .insert(lessonNotes)
      .values({
        lessonId,
        authorId,
        body: values.body ?? SECRET,
        offsetSeconds: values.offsetSeconds ?? null,
      })
      .returning();
    return row;
  };

  const stored = () => db().select().from(lessonNotes);

  const clean = () =>
    dbUtils.cleanTables("bans", ...COURSE_TREE_TABLES, "users");

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
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
    });
    const [week, foreignWeek] = await db()
      .insert(courseWeeks)
      .values([
        { courseId, weekNumber: 1, title: "Emsile", orderIndex: 0 },
        {
          courseId: foreignCourse.id,
          weekNumber: 1,
          title: "Nahiv",
          orderIndex: 0,
        },
      ])
      .returning();
    [{ id: liveLessonId }, { id: videoLessonId }, { id: foreignLessonId }] =
      await db()
        .insert(lessons)
        .values([
          {
            weekId: week.id,
            title: "Canlı celse",
            type: LessonType.LIVE,
            orderIndex: 0,
            scheduledAt: new Date(Date.now() - 10 * 60_000),
            durationMinutes: 60,
          },
          {
            weekId: week.id,
            title: "Kayıtlı celse",
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
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("the author's own notes", () => {
    it("writes, lists, edits and deletes a note", async () => {
      const created = await create(liveLessonId, TALEBE_ID, {
        body: "Fâil **merfû'dur**.",
        offsetSeconds: 754,
      }).expect(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        lessonId: liveLessonId,
        offsetSeconds: 754,
        body: "Fâil **merfû'dur**.",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      // The author is the caller and nothing else: no author key at all.
      expect(created.body).not.toHaveProperty("authorId");

      const listed = await list(liveLessonId, TALEBE_ID).expect(200);
      expect(listed.body).toEqual([created.body]);
      expect(listed.headers["cache-control"]).toBe("private, no-store");

      const edited = await edit(liveLessonId, created.body.id, TALEBE_ID, {
        body: "Mef'ûl **mansûbdur**.",
        offsetSeconds: 900,
      }).expect(200);
      expect(edited.body).toMatchObject({
        id: created.body.id,
        body: "Mef'ûl **mansûbdur**.",
        offsetSeconds: 900,
      });
      expect(new Date(edited.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.body.updatedAt).getTime()
      );

      await remove(liveLessonId, created.body.id, TALEBE_ID).expect(204);
      expect((await list(liveLessonId, TALEBE_ID).expect(200)).body).toEqual(
        []
      );
      expect(await stored()).toHaveLength(0);
    });

    it("keeps what an edit leaves out, and clears the position with null", async () => {
      const note = await seed(TALEBE_ID, { body: "İlk", offsetSeconds: 60 });

      const bodyOnly = await edit(liveLessonId, note.id, TALEBE_ID, {
        body: "İkinci",
      }).expect(200);
      expect(bodyOnly.body).toMatchObject({
        body: "İkinci",
        offsetSeconds: 60,
      });

      const positionOnly = await edit(liveLessonId, note.id, TALEBE_ID, {
        offsetSeconds: 75,
      }).expect(200);
      expect(positionOnly.body).toMatchObject({
        body: "İkinci",
        offsetSeconds: 75,
      });

      const cleared = await edit(liveLessonId, note.id, TALEBE_ID, {
        offsetSeconds: null,
      }).expect(200);
      expect(cleared.body).toMatchObject({
        body: "İkinci",
        offsetSeconds: null,
      });

      const untouched = await edit(liveLessonId, note.id, TALEBE_ID, {}).expect(
        200
      );
      expect(untouched.body).toMatchObject({
        body: "İkinci",
        offsetSeconds: null,
      });
    });

    it("takes a note without a position, with a null one and with zero", async () => {
      const without = await create(liveLessonId, TALEBE_ID, {
        body: "Konumsuz",
      }).expect(201);
      const withNull = await create(liveLessonId, TALEBE_ID, {
        body: "Null konum",
        offsetSeconds: null,
      }).expect(201);
      const atZero = await create(liveLessonId, TALEBE_ID, {
        body: "Başlangıç",
        offsetSeconds: 0,
      }).expect(201);
      expect(without.body.offsetSeconds).toBeNull();
      expect(withNull.body.offsetSeconds).toBeNull();
      expect(atZero.body.offsetSeconds).toBe(0);
    });

    it("lists by position, notes without one last, then oldest first", async () => {
      await seed(TALEBE_ID, { body: "yok-1" });
      await seed(TALEBE_ID, { body: "uzak", offsetSeconds: 600 });
      await seed(TALEBE_ID, { body: "yok-2" });
      await seed(TALEBE_ID, { body: "yakın", offsetSeconds: 5 });

      const res = await list(liveLessonId, TALEBE_ID).expect(200);
      expect(res.body.map((n: { body: string }) => n.body)).toEqual([
        "yakın",
        "uzak",
        "yok-1",
        "yok-2",
      ]);
    });

    it("keeps notes per session: the live and the recorded one do not mix", async () => {
      await seed(TALEBE_ID, { body: "canlıda" }, liveLessonId);
      await seed(TALEBE_ID, { body: "kayıtta" }, videoLessonId);

      const live = await list(liveLessonId, TALEBE_ID).expect(200);
      const video = await list(videoLessonId, TALEBE_ID).expect(200);
      expect(live.body.map((n: { body: string }) => n.body)).toEqual([
        "canlıda",
      ]);
      expect(video.body.map((n: { body: string }) => n.body)).toEqual([
        "kayıtta",
      ]);
    });

    it("answers 404 for an edit or delete reached through another session", async () => {
      const note = await seed(TALEBE_ID, {}, liveLessonId);
      await edit(videoLessonId, note.id, TALEBE_ID, { body: "x" }).expect(404);
      await remove(videoLessonId, note.id, TALEBE_ID).expect(404);
      expect(await stored()).toHaveLength(1);
    });

    it("answers 404 for a note that is not there", async () => {
      await edit(liveLessonId, ABSENT_ID, TALEBE_ID, { body: "x" }).expect(404);
      await remove(liveLessonId, ABSENT_ID, TALEBE_ID).expect(404);
    });
  });

  describe("who may write", () => {
    it("lets an enrolled and a completed talebe write", async () => {
      await create(liveLessonId, TALEBE_ID, { body: "kayıtlı" }).expect(201);
      await create(liveLessonId, COMPLETED_ID, { body: "mezun" }).expect(201);
      expect(await stored()).toHaveLength(2);
    });

    it.each([
      ["pending", PENDING_ID],
      ["revoked", REVOKED_ID],
      ["barred", BARRED_ID],
      ["not enrolled", STRANGER_ID],
      ["the müderris, who is not enrolled", MUDERRIS_ID],
      ["the köşk nazımı, who is not enrolled", MANAGER_ID],
      ["a SYSTEM_ADMIN who is not enrolled", ADMIN_ID],
    ])("refuses %s on create and on edit", async (_label, sub) => {
      const mine = await seed(TALEBE_ID, { body: "değişmez" });
      const created = await create(liveLessonId, sub, { body: "x" }).expect(
        403
      );
      expect(created.body.code ?? created.body.error?.code).toBe(
        "LESSON_NOTE_FORBIDDEN"
      );
      await edit(liveLessonId, mine.id, sub, { body: "kirli" }).expect(403);

      const rows = await stored();
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe("değişmez");
    });

    it("lets a barred or removed talebe read and delete what they wrote before", async () => {
      const barred = await seed(BARRED_ID, { body: "yasaktan önce" });
      const revoked = await seed(REVOKED_ID, { body: "çıkarılmadan önce" });

      expect(
        (await list(liveLessonId, BARRED_ID).expect(200)).body
      ).toHaveLength(1);
      await remove(liveLessonId, barred.id, BARRED_ID).expect(204);
      await remove(liveLessonId, revoked.id, REVOKED_ID).expect(204);
      expect(await stored()).toHaveLength(0);
    });

    it("answers 401 without a token", async () => {
      await http().get(`/lessons/${liveLessonId}/notes`).expect(401);
      await http()
        .post(`/lessons/${liveLessonId}/notes`)
        .send({ body: "x" })
        .expect(401);
    });

    it("answers 404 for a session that is not there, 403 only for a real one", async () => {
      await list(ABSENT_ID, TALEBE_ID).expect(404);
      await create(ABSENT_ID, TALEBE_ID, { body: "x" }).expect(404);
      await list("not-a-uuid", TALEBE_ID).expect(404);
    });

    it("does not let a talebe of one course write on another course's session", async () => {
      await create(foreignLessonId, TALEBE_ID, { body: "x" }).expect(403);
      expect(await stored()).toHaveLength(0);
    });
  });

  describe("privacy: a note is its author's alone", () => {
    it("shows another enrolled talebe nothing, and lets them change nothing", async () => {
      const note = await seed(TALEBE_ID);

      const theirs = await list(liveLessonId, OTHER_TALEBE_ID).expect(200);
      expect(theirs.body).toEqual([]);
      expect(JSON.stringify(theirs.body)).not.toContain(SECRET);

      const edited = await edit(liveLessonId, note.id, OTHER_TALEBE_ID, {
        body: "ele geçirildi",
      }).expect(404);
      expect(JSON.stringify(edited.body)).not.toContain(SECRET);
      await remove(liveLessonId, note.id, OTHER_TALEBE_ID).expect(404);

      const [row] = await stored();
      expect(row).toMatchObject({ id: note.id, body: SECRET });
    });

    it("gives a SYSTEM_ADMIN nothing of someone else's note", async () => {
      const note = await seed(TALEBE_ID);

      const listed = await list(liveLessonId, ADMIN_ID).expect(200);
      expect(listed.body).toEqual([]);
      await remove(liveLessonId, note.id, ADMIN_ID).expect(404);
      // Not enrolled, so refused before the note is looked at.
      await edit(liveLessonId, note.id, ADMIN_ID, { body: "x" }).expect(403);

      const [row] = await stored();
      expect(row).toMatchObject({ id: note.id, body: SECRET });
    });

    it("gives a SYSTEM_ADMIN who is enrolled their own notes only", async () => {
      await db().insert(enrollments).values({
        userId: ADMIN_ID,
        courseId,
        status: EnrollmentStatus.ENROLLED,
      });
      const note = await seed(TALEBE_ID);
      const mine = await seed(ADMIN_ID, { body: "yöneticinin kendi notu" });

      const listed = await list(liveLessonId, ADMIN_ID).expect(200);
      expect(listed.body.map((n: { id: string }) => n.id)).toEqual([mine.id]);
      await edit(liveLessonId, note.id, ADMIN_ID, { body: "x" }).expect(404);
      await remove(liveLessonId, note.id, ADMIN_ID).expect(404);
      expect(await stored()).toHaveLength(2);
    });

    it("gives the müderris and the köşk nazımı nothing either", async () => {
      const note = await seed(TALEBE_ID);
      for (const sub of [MUDERRIS_ID, MANAGER_ID]) {
        const listed = await list(liveLessonId, sub).expect(200);
        expect(listed.body).toEqual([]);
        await remove(liveLessonId, note.id, sub).expect(404);
      }
      expect(await stored()).toHaveLength(1);
    });

    it("has no route that reads a note by id or across sessions", async () => {
      const note = await seed(TALEBE_ID);
      for (const sub of [TALEBE_ID, OTHER_TALEBE_ID, ADMIN_ID]) {
        for (const path of [
          `/lessons/${liveLessonId}/notes/${note.id}`,
          `/notes/${note.id}`,
          "/notes",
          `/courses/${courseId}/notes`,
        ]) {
          const res = await http().get(path).set("Authorization", as(sub));
          expect(res.status).toBe(404);
          expect(JSON.stringify(res.body)).not.toContain(SECRET);
        }
      }
    });

    it("never carries a note into a response about the session", async () => {
      await seed(TALEBE_ID);
      for (const path of [
        `/courses/${courseId}`,
        `/courses/${courseId}/sessions/${liveLessonId}`,
        `/courses/${courseId}/recordings`,
      ]) {
        const res = await http()
          .get(path)
          .set("Authorization", as(OTHER_TALEBE_ID));
        expect(JSON.stringify(res.body)).not.toContain(SECRET);
      }
    });
  });

  describe("a real delete of the course", () => {
    it("removes its notes with the lessons they hang off", async () => {
      await seed(TALEBE_ID);
      await seed(OTHER_TALEBE_ID, {}, videoLessonId);
      await db().transaction((tx) => purgeCourses(tx, [courseId]));
      expect(await stored()).toHaveLength(0);
    });
  });

  describe("the DTO's limits", () => {
    it("trims the body before storing it", async () => {
      const res = await create(liveLessonId, TALEBE_ID, {
        body: "  boşluklu  \n",
      }).expect(201);
      expect(res.body.body).toBe("boşluklu");
    });

    it("stores the body as typed, markup included", async () => {
      const typed = '# Başlık\n<script>alert("x")</script>\n- madde';
      const res = await create(liveLessonId, TALEBE_ID, { body: typed }).expect(
        201
      );
      expect(res.body.body).toBe(typed);
      const [row] = await stored();
      expect(row.body).toBe(typed);
    });

    it("accepts a body of exactly the limit and refuses one character more", async () => {
      await create(liveLessonId, TALEBE_ID, {
        body: "a".repeat(LESSON_NOTE_BODY_MAX),
      }).expect(201);
      await create(liveLessonId, TALEBE_ID, {
        body: "a".repeat(LESSON_NOTE_BODY_MAX + 1),
      }).expect(400);
      expect(await stored()).toHaveLength(1);
    });

    it.each([
      ["a missing body", {}],
      ["an empty body", { body: "" }],
      ["a body of whitespace", { body: " \n\t " }],
      ["a body that is not a string", { body: 12 }],
      ["a negative position", { body: "x", offsetSeconds: -1 }],
      ["a fractional position", { body: "x", offsetSeconds: 1.5 }],
      ["a position given as text", { body: "x", offsetSeconds: "12" }],
      [
        "a position past the limit",
        { body: "x", offsetSeconds: LESSON_NOTE_OFFSET_MAX + 1 },
      ],
      ["a key the DTO does not know", { body: "x", authorId: STRANGER_ID }],
    ])("refuses %s on create", async (_label, body) => {
      await create(liveLessonId, TALEBE_ID, body).expect(400);
      expect(await stored()).toHaveLength(0);
    });

    it("accepts a position of exactly the limit", async () => {
      const res = await create(liveLessonId, TALEBE_ID, {
        body: "x",
        offsetSeconds: LESSON_NOTE_OFFSET_MAX,
      }).expect(201);
      expect(res.body.offsetSeconds).toBe(LESSON_NOTE_OFFSET_MAX);
    });

    it.each([
      ["an empty body", { body: "" }],
      ["a body past the limit", { body: "a".repeat(LESSON_NOTE_BODY_MAX + 1) }],
      ["a null body", { body: null }],
      ["a negative position", { offsetSeconds: -5 }],
      ["a key the DTO does not know", { lessonId: ABSENT_ID }],
    ])("refuses %s on edit and changes nothing", async (_label, body) => {
      const note = await seed(TALEBE_ID, {
        body: "değişmez",
        offsetSeconds: 9,
      });
      await edit(liveLessonId, note.id, TALEBE_ID, body).expect(400);
      const [row] = await db()
        .select()
        .from(lessonNotes)
        .where(eq(lessonNotes.id, note.id));
      expect(row).toMatchObject({ body: "değişmez", offsetSeconds: 9 });
    });

    it("refuses a negative position at the database as well", async () => {
      await expect(seed(TALEBE_ID, { offsetSeconds: -1 })).rejects.toThrow();
    });
  });
});
