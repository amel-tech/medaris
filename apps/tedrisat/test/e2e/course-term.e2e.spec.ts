import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { purgeCourses } from "../../src/course/course-purge";
import {
  TERM_EXAMPLE_MAX,
  TERM_MAX,
  TERM_MEANING_MAX,
} from "../../src/course-term/dto/course-term.dto";
import { DatabaseService } from "../../src/database/database.service";
import { courseTerms } from "../../src/database/schema/course-term.schema";
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
 * A course's glossary: the terms its müderris defines. Covers the create,
 * list, edit and delete; who writes and who reads; the DTO's limits and what
 * an empty text means; and that a course's purge takes its terms with it.
 */
describe("a course's glossary (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: EmsileCourse;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const MAZI = {
    term: "Mâzî",
    arabic: "الْمَاضِي",
    lexicalMeaning: "Geçmiş, geçen.",
    technicalMeaning: "Geçmiş zamanda bir işin yapıldığını bildiren fiil.",
    example: "نَصَرَ: yardım etti.",
  };

  const list = (courseId: string, sub: string) =>
    http()
      .get(`/courses/${courseId}/terms`)
      .set("Authorization", emsileBearer(sub));
  const create = (courseId: string, sub: string, body: unknown) =>
    http()
      .post(`/courses/${courseId}/terms`)
      .set("Authorization", emsileBearer(sub))
      .send(body as object);
  const edit = (courseId: string, termId: string, sub: string, body: unknown) =>
    http()
      .patch(`/courses/${courseId}/terms/${termId}`)
      .set("Authorization", emsileBearer(sub))
      .send(body as object);
  const remove = (courseId: string, termId: string, sub: string) =>
    http()
      .delete(`/courses/${courseId}/terms/${termId}`)
      .set("Authorization", emsileBearer(sub));

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

  it("lets the müderris add a term, and the talebe read it", async () => {
    const created = await create(ids.courseId, EMSILE.MUDERRIS, MAZI).expect(
      201
    );
    expect(created.body).toMatchObject({ ...MAZI, courseId: ids.courseId });

    const read = await list(ids.courseId, EMSILE.TALEBE).expect(200);
    expect(read.body).toHaveLength(1);
    expect(read.body[0]).toMatchObject(MAZI);
    expect(read.headers["cache-control"]).toBe("private, no-store");
  });

  it("needs only the term, and keeps an empty text as null", async () => {
    const { body } = await create(ids.courseId, EMSILE.MUDERRIS, {
      term: "  Sarf  ",
      arabic: "   ",
      example: "",
    }).expect(201);
    expect(body).toMatchObject({
      term: "Sarf",
      arabic: null,
      lexicalMeaning: null,
      technicalMeaning: null,
      example: null,
    });
  });

  it("holds each text to its length", async () => {
    const bad = (body: Record<string, unknown>) =>
      create(ids.courseId, EMSILE.MUDERRIS, { ...MAZI, ...body });
    await bad({ term: "" }).expect(400);
    await bad({ term: "   " }).expect(400);
    await bad({ term: "x".repeat(TERM_MAX + 1) }).expect(400);
    await bad({ arabic: "ا".repeat(201) }).expect(400);
    await bad({ lexicalMeaning: "x".repeat(TERM_MEANING_MAX + 1) }).expect(400);
    await bad({ technicalMeaning: "x".repeat(TERM_MEANING_MAX + 1) }).expect(
      400
    );
    await bad({ example: "x".repeat(TERM_EXAMPLE_MAX + 1) }).expect(400);
    await bad({ term: 5 }).expect(400);
    await bad({ term: "x".repeat(TERM_MAX) }).expect(201);
    expect(await db().select().from(courseTerms)).toHaveLength(1);
  });

  it("edits only the keys sent, and clears a text sent as null or empty", async () => {
    const { body: term } = await create(ids.courseId, EMSILE.MUDERRIS, MAZI);
    const edited = await edit(ids.courseId, term.id, EMSILE.MUDERRIS, {
      technicalMeaning: "Geçmişte olmuş işi bildirir.",
      example: null,
      lexicalMeaning: "",
    }).expect(200);
    expect(edited.body).toMatchObject({
      term: "Mâzî",
      arabic: MAZI.arabic,
      technicalMeaning: "Geçmişte olmuş işi bildirir.",
      example: null,
      lexicalMeaning: null,
    });
    // Nothing sent changes nothing.
    const same = await edit(ids.courseId, term.id, EMSILE.MUDERRIS, {}).expect(
      200
    );
    expect(same.body.updatedAt).toBe(edited.body.updatedAt);
    await edit(ids.courseId, term.id, EMSILE.MUDERRIS, { term: "" }).expect(
      400
    );
  });

  it("is written by the course's staff only", async () => {
    await create(ids.courseId, EMSILE.TALEBE, MAZI).expect(403);
    await create(ids.courseId, EMSILE.STRANGER, MAZI).expect(403);
    await create(ids.foreignCourseId, EMSILE.MUDERRIS, MAZI).expect(403);
    const { body: term } = await create(
      ids.courseId,
      EMSILE.MANAGER,
      MAZI
    ).expect(201);
    await create(ids.courseId, EMSILE.ADMIN, MAZI).expect(201);
    await edit(ids.courseId, term.id, EMSILE.TALEBE, { term: "x" }).expect(403);
    await remove(ids.courseId, term.id, EMSILE.TALEBE).expect(403);
    await http().post(`/courses/${ids.courseId}/terms`).send(MAZI).expect(401);
  });

  it("is read by whoever reads the course's content", async () => {
    await create(ids.courseId, EMSILE.MUDERRIS, MAZI).expect(201);
    await list(ids.courseId, EMSILE.MUDERRIS).expect(200);
    await list(ids.courseId, EMSILE.PENDING).expect(403);
    await list(ids.courseId, EMSILE.STRANGER).expect(403);
    await list(EMSILE.ABSENT, EMSILE.TALEBE).expect(404);
    const other = await list(ids.foreignCourseId, EMSILE.MANAGER).expect(200);
    expect(other.body).toEqual([]);
  });

  it("edits and deletes a term within its own course only", async () => {
    const { body: term } = await create(ids.courseId, EMSILE.MUDERRIS, MAZI);
    await edit(ids.foreignCourseId, term.id, EMSILE.MANAGER, {
      term: "x",
    }).expect(404);
    await remove(ids.foreignCourseId, term.id, EMSILE.MANAGER).expect(404);
    await edit(ids.courseId, EMSILE.ABSENT, EMSILE.MUDERRIS, {
      term: "x",
    }).expect(404);
    await remove(ids.courseId, term.id, EMSILE.MUDERRIS).expect(204);
    await remove(ids.courseId, term.id, EMSILE.MUDERRIS).expect(404);
    expect(await db().select().from(courseTerms)).toHaveLength(0);
  });

  it("goes with its course when the course is purged", async () => {
    await create(ids.courseId, EMSILE.MUDERRIS, MAZI).expect(201);
    await create(ids.foreignCourseId, EMSILE.MANAGER, MAZI).expect(201);
    await db().transaction((tx) => purgeCourses(tx, [ids.courseId]));
    const left = await db().select().from(courseTerms);
    expect(left.map((term) => term.courseId)).toEqual([ids.foreignCourseId]);
  });
});
