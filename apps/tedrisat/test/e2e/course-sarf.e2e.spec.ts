import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { purgeCourses } from "../../src/course/course-purge";
import { DatabaseService } from "../../src/database/database.service";
import { courseSarfRoots } from "../../src/database/schema/course-sarf.schema";
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
 * A course's sarf page: the roots its müderris chose, from which the browser
 * writes the Emsile's tables. Covers who writes and who reads, the one row per
 * root and bâb, the DTO's refusal of a root that is not sâlim, and that a
 * course's purge takes its roots with it.
 */
describe("a course's sarf roots (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: EmsileCourse;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const NASARA = {
    kok: "ن ص ر",
    bab: "nasara",
    mastar: "yardım etmek",
    masdarVezin: "fal",
  };

  const list = (courseId: string, sub: string) =>
    http()
      .get(`/courses/${courseId}/sarf-roots`)
      .set("Authorization", emsileBearer(sub));
  const save = (courseId: string, sub: string, body: unknown) =>
    http()
      .put(`/courses/${courseId}/sarf-roots`)
      .set("Authorization", emsileBearer(sub))
      .send(body as object);
  const remove = (courseId: string, rootId: string, sub: string) =>
    http()
      .delete(`/courses/${courseId}/sarf-roots/${rootId}`)
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

  it("lets the müderris add a root, and the talebe read it", async () => {
    const saved = await save(ids.courseId, EMSILE.MUDERRIS, NASARA).expect(200);
    expect(saved.body).toMatchObject({ ...NASARA, courseId: ids.courseId });

    const read = await list(ids.courseId, EMSILE.TALEBE).expect(200);
    expect(read.body).toHaveLength(1);
    expect(read.body[0]).toMatchObject(NASARA);
    expect(read.headers["cache-control"]).toBe("private, no-store");
  });

  it("lists the roots in the order they were added", async () => {
    await save(ids.courseId, EMSILE.MUDERRIS, NASARA).expect(200);
    await save(ids.courseId, EMSILE.MANAGER, {
      kok: "ض ر ب",
      bab: "daraba",
      masdarVezin: "fal",
    }).expect(200);
    const read = await list(ids.courseId, EMSILE.MUDERRIS).expect(200);
    expect(read.body.map((root: { kok: string }) => root.kok)).toEqual([
      "ن ص ر",
      "ض ر ب",
    ]);
    expect(read.body[1].mastar).toBeNull();
  });

  it("keeps one row per root and bâb: saving it again changes it", async () => {
    const first = await save(ids.courseId, EMSILE.MUDERRIS, NASARA).expect(200);
    const again = await save(ids.courseId, EMSILE.MUDERRIS, {
      ...NASARA,
      mastar: "  ",
      masdarVezin: "fuul",
    }).expect(200);
    expect(again.body.id).toBe(first.body.id);
    expect(again.body).toMatchObject({ mastar: null, masdarVezin: "fuul" });
    expect(await db().select().from(courseSarfRoots)).toHaveLength(1);

    // The same root in another bâb is another row.
    await save(ids.courseId, EMSILE.MUDERRIS, {
      ...NASARA,
      bab: "daraba",
    }).expect(200);
    expect(await db().select().from(courseSarfRoots)).toHaveLength(2);
  });

  it("refuses a root that is not sâlim, and keys it does not know", async () => {
    const bad = (body: Record<string, unknown>) =>
      save(ids.courseId, EMSILE.MUDERRIS, { ...NASARA, ...body });
    await bad({ kok: "ق و ل" }).expect(400);
    await bad({ kok: "أ خ ذ" }).expect(400);
    await bad({ kok: "ر م ي" }).expect(400);
    await bad({ kok: "نصر" }).expect(400);
    await bad({ kok: "ن ص" }).expect(400);
    await bad({ kok: "n s r" }).expect(400);
    await bad({ bab: "kerume" }).expect(400);
    await bad({ masdarVezin: "mefal" }).expect(400);
    await bad({ mastar: "x".repeat(121) }).expect(400);
    const doubled = await bad({ kok: "م د د" }).expect(400);
    expect(JSON.stringify(doubled.body)).toContain("COURSE_SARF_ROOT_DOUBLED");
    expect(await db().select().from(courseSarfRoots)).toHaveLength(0);
  });

  it("is written by the course's staff only", async () => {
    await save(ids.courseId, EMSILE.TALEBE, NASARA).expect(403);
    await save(ids.courseId, EMSILE.STRANGER, NASARA).expect(403);
    await save(ids.courseId, EMSILE.MANAGER, NASARA).expect(200);
    await save(ids.courseId, EMSILE.ADMIN, NASARA).expect(200);
    await save(ids.foreignCourseId, EMSILE.MUDERRIS, NASARA).expect(403);
    await http()
      .put(`/courses/${ids.courseId}/sarf-roots`)
      .send(NASARA)
      .expect(401);
  });

  it("is read by whoever reads the course's content", async () => {
    await save(ids.courseId, EMSILE.MUDERRIS, NASARA).expect(200);
    await list(ids.courseId, EMSILE.MUDERRIS).expect(200);
    await list(ids.courseId, EMSILE.MANAGER).expect(200);
    await list(ids.courseId, EMSILE.PENDING).expect(403);
    await list(ids.courseId, EMSILE.STRANGER).expect(403);
    await list(EMSILE.ABSENT, EMSILE.TALEBE).expect(404);
    const other = await list(ids.foreignCourseId, EMSILE.MANAGER).expect(200);
    expect(other.body).toEqual([]);
  });

  it("takes a root off, within its own course only", async () => {
    const { body } = await save(ids.courseId, EMSILE.MUDERRIS, NASARA);
    await remove(ids.courseId, body.id, EMSILE.TALEBE).expect(403);
    await remove(ids.foreignCourseId, body.id, EMSILE.MANAGER).expect(404);
    await remove(ids.courseId, EMSILE.ABSENT, EMSILE.MUDERRIS).expect(404);
    await remove(ids.courseId, body.id, EMSILE.MUDERRIS).expect(204);
    expect(await db().select().from(courseSarfRoots)).toHaveLength(0);
  });

  it("goes with its course when the course is purged", async () => {
    await save(ids.courseId, EMSILE.MUDERRIS, NASARA).expect(200);
    await save(ids.foreignCourseId, EMSILE.MANAGER, NASARA).expect(200);
    await db().transaction((tx) => purgeCourses(tx, [ids.courseId]));
    const left = await db().select().from(courseSarfRoots);
    expect(left.map((root) => root.courseId)).toEqual([ids.foreignCourseId]);
  });
});
