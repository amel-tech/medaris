import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { purgeCourses } from "../../src/course/course-purge";
import { DatabaseService } from "../../src/database/database.service";
import { lessons } from "../../src/database/schema/course.schema";
import { lessonTeacherNotes } from "../../src/database/schema/lesson-teacher-note.schema";
import { TEACHER_NOTE_MAX } from "../../src/lesson-teacher-note/dto/lesson-teacher-note.dto";
import {
  EMSILE,
  type EmsileCourse,
  emsileBearer,
  seedEmsileCourse,
} from "../helpers/emsile-course.fixture";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

/**
 * A session's note from its müderris. Covers the write and the read; who
 * writes and who reads; the length limit and what an empty body means; and
 * that every purge that deletes the session takes its note with it.
 */
describe("a session's note from its müderris (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: EmsileCourse;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const NOTE = "## Mâzî\n\n- **نَصَرَ**: yardım etti\n\n    girintili satır";

  const read = (lessonId: string, sub: string) =>
    http()
      .get(`/lessons/${lessonId}/teacher-note`)
      .set("Authorization", emsileBearer(sub));
  const write = (lessonId: string, sub: string, body: unknown) =>
    http()
      .put(`/lessons/${lessonId}/teacher-note`)
      .set("Authorization", emsileBearer(sub))
      .send(body as object);

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    ids = await seedEmsileCourse(db());
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers a session with no note with a null body, not 404", async () => {
    const { body, headers } = await read(ids.lessonId, EMSILE.TALEBE).expect(
      200
    );
    expect(body).toEqual({
      lessonId: ids.lessonId,
      body: null,
      updatedAt: null,
    });
    expect(headers["cache-control"]).toBe("private, no-store");
  });

  it("lets the müderris write the note, and the talebe read it as typed", async () => {
    const saved = await write(ids.lessonId, EMSILE.MUDERRIS, {
      body: NOTE,
    }).expect(200);
    expect(saved.body).toMatchObject({ lessonId: ids.lessonId, body: NOTE });
    expect(saved.body.updatedAt).toEqual(expect.any(String));

    const { body } = await read(ids.lessonId, EMSILE.TALEBE).expect(200);
    expect(body.body).toBe(NOTE);
    const [row] = await db().select().from(lessonTeacherNotes);
    expect(row.updatedBy).toBe(EMSILE.MUDERRIS);
  });

  it("writes over the note before it, keeping one row a session", async () => {
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: "ilk" }).expect(200);
    const second = await write(ids.lessonId, EMSILE.MANAGER, {
      body: "  ikinci  \n\n",
    }).expect(200);
    // Leading whitespace is Markdown's; only the tail is trimmed.
    expect(second.body.body).toBe("  ikinci");
    const rows = await db().select().from(lessonTeacherNotes);
    expect(rows).toHaveLength(1);
    expect(rows[0].updatedBy).toBe(EMSILE.MANAGER);
  });

  it("removes the note on a body that is null, left out or only whitespace", async () => {
    for (const empty of [{ body: null }, {}, { body: " \n\t " }]) {
      await write(ids.lessonId, EMSILE.MUDERRIS, { body: NOTE }).expect(200);
      const cleared = await write(ids.lessonId, EMSILE.MUDERRIS, empty).expect(
        200
      );
      expect(cleared.body).toMatchObject({ body: null, updatedAt: null });
      expect(await db().select().from(lessonTeacherNotes)).toHaveLength(0);
    }
    // Removing a note that is not there is not an error.
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: null }).expect(200);
  });

  it("holds the note to its length and its type", async () => {
    await write(ids.lessonId, EMSILE.MUDERRIS, {
      body: "x".repeat(TEACHER_NOTE_MAX + 1),
    }).expect(400);
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: 5 }).expect(400);
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: ["x"] }).expect(400);
    expect(await db().select().from(lessonTeacherNotes)).toHaveLength(0);
    await write(ids.lessonId, EMSILE.MUDERRIS, {
      body: "x".repeat(TEACHER_NOTE_MAX),
    }).expect(200);
  });

  it("is written by the course's staff only", async () => {
    const body = { body: NOTE };
    await write(ids.lessonId, EMSILE.TALEBE, body).expect(403);
    await write(ids.lessonId, EMSILE.PENDING, body).expect(403);
    await write(ids.lessonId, EMSILE.STRANGER, body).expect(403);
    await write(ids.foreignLessonId, EMSILE.MUDERRIS, body).expect(403);
    await http()
      .put(`/lessons/${ids.lessonId}/teacher-note`)
      .send(body)
      .expect(401);
    expect(await db().select().from(lessonTeacherNotes)).toHaveLength(0);
    await write(ids.lessonId, EMSILE.MANAGER, body).expect(200);
    await write(ids.lessonId, EMSILE.ADMIN, body).expect(200);
    await write(EMSILE.ABSENT, EMSILE.MUDERRIS, body).expect(404);
  });

  it("is read by whoever reads the course's content", async () => {
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: NOTE }).expect(200);
    await read(ids.lessonId, EMSILE.MUDERRIS).expect(200);
    await read(ids.lessonId, EMSILE.MANAGER).expect(200);
    await read(ids.lessonId, EMSILE.PENDING).expect(403);
    await read(ids.lessonId, EMSILE.STRANGER).expect(403);
    await read(EMSILE.ABSENT, EMSILE.TALEBE).expect(404);
    await http().get(`/lessons/${ids.lessonId}/teacher-note`).expect(401);
    const other = await read(ids.foreignLessonId, EMSILE.MANAGER).expect(200);
    expect(other.body.body).toBeNull();
  });

  it("goes with its course when the course is purged", async () => {
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: NOTE }).expect(200);
    await write(ids.foreignLessonId, EMSILE.MANAGER, { body: NOTE }).expect(
      200
    );
    await db().transaction((tx) => purgeCourses(tx, [ids.courseId]));
    const left = await db().select().from(lessonTeacherNotes);
    expect(left.map((note) => note.lessonId)).toEqual([ids.foreignLessonId]);
  });

  it("goes with its session when the hidden session is deleted for real", async () => {
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: NOTE }).expect(200);
    await http()
      .delete(`/lessons/${ids.lessonId}`)
      .set("Authorization", emsileBearer(EMSILE.MUDERRIS))
      .expect(200);
    await http()
      .delete(`/archive/session/${ids.lessonId}`)
      .set("Authorization", emsileBearer(EMSILE.ADMIN))
      .expect(204);
    expect(await db().select().from(lessonTeacherNotes)).toHaveLength(0);
    expect(
      await db().select().from(lessons).where(eq(lessons.id, ids.lessonId))
    ).toHaveLength(0);
  });

  it("goes with its week when the hidden week is deleted for real", async () => {
    await write(ids.lessonId, EMSILE.MUDERRIS, { body: NOTE }).expect(200);
    const [{ weekId }] = await db()
      .select({ weekId: lessons.weekId })
      .from(lessons)
      .where(eq(lessons.id, ids.lessonId));
    await http()
      .post(`/courses/${ids.courseId}/weeks/${weekId}/hide`)
      .set("Authorization", emsileBearer(EMSILE.ADMIN))
      .expect(200);
    await http()
      .delete(`/archive/week/${weekId}`)
      .set("Authorization", emsileBearer(EMSILE.ADMIN))
      .expect(204);
    expect(await db().select().from(lessonTeacherNotes)).toHaveLength(0);
  });
});
