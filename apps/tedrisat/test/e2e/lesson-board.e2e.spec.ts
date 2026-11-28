import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { purgeCourses } from "../../src/course/course-purge";
import { DatabaseService } from "../../src/database/database.service";
import {
  lessonBoardFiles,
  lessonBoards,
} from "../../src/database/schema/lesson-board.schema";
import { storageDeletions } from "../../src/database/schema/storage.schema";
import {
  BOARD_ELEMENTS_MAX,
  BOARD_SCENE_MAX_BYTES,
} from "../../src/lesson-board/dto/lesson-board.dto";
import { ObjectStorage } from "../../src/storage/object-storage";
import {
  EMSILE,
  type EmsileCourse,
  emsileBearer,
  seedEmsileCourse,
} from "../helpers/emsile-course.fixture";
import { MemoryObjectStorage } from "../helpers/memory-object-storage";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { jpeg, pdf, png, text } from "../helpers/upload-fixtures";

/**
 * A session's board: the scene the müderris draws and the images on it.
 * Covers who writes and who reads, what a scene must be, that an image is a
 * file of the board and never bytes inside the scene, that saving a scene
 * drops the files it no longer shows, and that a purge takes the board and
 * queues its objects.
 */
describe("a session's board (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: EmsileCourse;
  const storage = new MemoryObjectStorage();

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const rect = { id: "r1", type: "rectangle", x: 0, y: 0 };
  const image = (fileId: string, over: object = {}) => ({
    id: `img-${fileId}`,
    type: "image",
    fileId,
    ...over,
  });
  const sceneOf = (elements: unknown[], extra: object = {}) =>
    JSON.stringify({
      elements,
      appState: {
        viewBackgroundColor: "#ffffff",
        selectedElementIds: { r1: true },
      },
      ...extra,
    });

  const read = (lessonId: string, sub: string) =>
    http()
      .get(`/lessons/${lessonId}/board`)
      .set("Authorization", emsileBearer(sub));
  const save = (lessonId: string, sub: string, scene: string | Buffer) =>
    http()
      .post(`/lessons/${lessonId}/board`)
      .set("Authorization", emsileBearer(sub))
      .attach("file", Buffer.from(scene), { filename: "scene.json" });
  const upload = (
    lessonId: string,
    sub: string,
    fileKey: string | null,
    file: Buffer = png()
  ) => {
    const call = http()
      .post(`/lessons/${lessonId}/board/files`)
      .set("Authorization", emsileBearer(sub));
    if (fileKey !== null) call.field("fileKey", fileKey);
    return call.attach("file", file, { filename: "sayfa.png" });
  };
  const download = (lessonId: string, fileKey: string, sub: string) =>
    http()
      .get(`/lessons/${lessonId}/board/files/${fileKey}`)
      .set("Authorization", emsileBearer(sub));

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: ObjectStorage, useValue: storage }],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "storage_deletions",
      ...COURSE_TREE_TABLES,
      "users"
    );
    storage.objects.clear();
    ids = await seedEmsileCourse(db());
  });

  afterAll(async () => {
    await app.close();
  });

  it("reads a session with no board as an empty one", async () => {
    const { body } = await read(ids.lessonId, EMSILE.TALEBE).expect(200);
    expect(body).toEqual({
      lessonId: ids.lessonId,
      scene: null,
      files: [],
      updatedAt: null,
    });
  });

  it("saves the scene and gives it to the talebe, without the editor's state", async () => {
    const saved = await save(
      ids.lessonId,
      EMSILE.MUDERRIS,
      sceneOf([rect])
    ).expect(200);
    expect(saved.body.scene).toEqual({
      elements: [rect],
      appState: { viewBackgroundColor: "#ffffff" },
    });

    const { body, headers } = await read(ids.lessonId, EMSILE.TALEBE).expect(
      200
    );
    expect(body.scene.elements).toEqual([rect]);
    expect(body.updatedAt).not.toBeNull();
    expect(headers["cache-control"]).toBe("private, no-store");
  });

  it("keeps one board per session: a save replaces the one before", async () => {
    await save(ids.lessonId, EMSILE.MUDERRIS, sceneOf([rect])).expect(200);
    const second = { ...rect, id: "r2" };
    await save(ids.lessonId, EMSILE.MANAGER, sceneOf([second])).expect(200);
    const rows = await db().select().from(lessonBoards);
    expect(rows).toHaveLength(1);
    expect(rows[0].updatedBy).toBe(EMSILE.MANAGER);
    expect((rows[0].scene as { elements: unknown[] }).elements).toEqual([
      second,
    ]);
  });

  it("refuses what is not a scene", async () => {
    const bad = (scene: string) => save(ids.lessonId, EMSILE.MUDERRIS, scene);
    for (const scene of [
      "not json",
      "[]",
      JSON.stringify({ appState: {} }),
      JSON.stringify({ elements: [{ type: "rectangle" }] }),
      JSON.stringify({ elements: ["x"] }),
      sceneOf([rect], {
        files: { a: { dataURL: "data:image/png;base64,AA" } },
      }),
      sceneOf([image("../etc")]),
      sceneOf(
        Array.from({ length: BOARD_ELEMENTS_MAX + 1 }, (_, i) => ({
          id: `e${i}`,
          type: "line",
        }))
      ),
    ]) {
      const { body } = await bad(scene).expect(400);
      expect(JSON.stringify(body)).toContain("LESSON_BOARD_SCENE_INVALID");
    }
    await http()
      .post(`/lessons/${ids.lessonId}/board`)
      .set("Authorization", emsileBearer(EMSILE.MUDERRIS))
      .expect(400);
    await save(
      ids.lessonId,
      EMSILE.MUDERRIS,
      Buffer.alloc(BOARD_SCENE_MAX_BYTES + 1, "a")
    ).expect(413);
    expect(await db().select().from(lessonBoards)).toHaveLength(0);
  });

  it("stores an image as a file of the board, and serves it to a reader", async () => {
    const added = await upload(ids.lessonId, EMSILE.MUDERRIS, "sayfa-1").expect(
      201
    );
    expect(added.body).toEqual({
      fileKey: "sayfa-1",
      contentType: "image/png",
      sizeBytes: png().length,
    });
    expect(storage.keys()).toHaveLength(1);
    expect(storage.keys()[0]).toContain(`/lessons/${ids.lessonId}/board/`);

    await save(
      ids.lessonId,
      EMSILE.MUDERRIS,
      sceneOf([rect, image("sayfa-1")])
    ).expect(200);
    const { body } = await read(ids.lessonId, EMSILE.TALEBE).expect(200);
    expect(body.files).toEqual([added.body]);

    const got = await download(ids.lessonId, "sayfa-1", EMSILE.TALEBE)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(got.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(got.body as Buffer, png())).toBe(0);
  });

  it("answers the same key with the file it has, and takes pictures only", async () => {
    await upload(ids.lessonId, EMSILE.MUDERRIS, "a").expect(201);
    await upload(ids.lessonId, EMSILE.MUDERRIS, "a", jpeg()).expect(201);
    expect(await db().select().from(lessonBoardFiles)).toHaveLength(1);
    expect(storage.keys()).toHaveLength(1);

    await upload(ids.lessonId, EMSILE.MUDERRIS, "b", pdf()).expect(415);
    await upload(ids.lessonId, EMSILE.MUDERRIS, "c", text()).expect(415);
    const noKey = await upload(ids.lessonId, EMSILE.MUDERRIS, null).expect(400);
    expect(JSON.stringify(noKey.body)).toContain(
      "LESSON_BOARD_FILE_KEY_INVALID"
    );
    await upload(ids.lessonId, EMSILE.MUDERRIS, "a b").expect(400);
  });

  it("refuses a scene that shows an image the board does not have", async () => {
    const { body } = await save(
      ids.lessonId,
      EMSILE.MUDERRIS,
      sceneOf([image("yok")])
    ).expect(400);
    expect(JSON.stringify(body)).toContain("LESSON_BOARD_SCENE_INVALID");
    // An image the müderris deleted on the canvas names a file it no longer needs.
    await save(
      ids.lessonId,
      EMSILE.MUDERRIS,
      sceneOf([image("yok", { isDeleted: true })])
    ).expect(200);
  });

  it("drops the files a saved scene no longer shows, and queues their objects", async () => {
    await upload(ids.lessonId, EMSILE.MUDERRIS, "kalan").expect(201);
    await upload(ids.lessonId, EMSILE.MUDERRIS, "giden", jpeg()).expect(201);
    await save(
      ids.lessonId,
      EMSILE.MUDERRIS,
      sceneOf([image("kalan"), image("giden")])
    ).expect(200);
    const [gone] = (await db().select().from(lessonBoardFiles)).filter(
      (file) => file.fileKey === "giden"
    );

    await save(ids.lessonId, EMSILE.MUDERRIS, sceneOf([image("kalan")])).expect(
      200
    );
    const left = await db().select().from(lessonBoardFiles);
    expect(left.map((file) => file.fileKey)).toEqual(["kalan"]);
    // The save kicks the deletion sweep, which may already have run: the
    // object is either still queued under this reason or gone from storage.
    const queued = await db().select().from(storageDeletions);
    const stillQueued = queued.some(
      (row) =>
        row.storageKey === gone.storageKey && row.reason === "board.file_delete"
    );
    expect(stillQueued || !storage.keys().includes(gone.storageKey)).toBe(true);
    await download(ids.lessonId, "giden", EMSILE.MUDERRIS).expect(404);
  });

  it("is written by the course's staff only", async () => {
    const scene = sceneOf([rect]);
    await save(ids.lessonId, EMSILE.TALEBE, scene).expect(403);
    await save(ids.lessonId, EMSILE.STRANGER, scene).expect(403);
    await upload(ids.lessonId, EMSILE.TALEBE, "a").expect(403);
    await save(ids.foreignLessonId, EMSILE.MUDERRIS, scene).expect(403);
    await save(EMSILE.ABSENT, EMSILE.MUDERRIS, scene).expect(404);
    await save(ids.lessonId, EMSILE.ADMIN, scene).expect(200);
    await http().post(`/lessons/${ids.lessonId}/board`).expect(401);
  });

  it("is read by whoever reads the course's content", async () => {
    await upload(ids.lessonId, EMSILE.MUDERRIS, "a").expect(201);
    await read(ids.lessonId, EMSILE.MUDERRIS).expect(200);
    await read(ids.lessonId, EMSILE.PENDING).expect(403);
    await read(ids.lessonId, EMSILE.STRANGER).expect(403);
    await read(EMSILE.ABSENT, EMSILE.TALEBE).expect(404);
    await download(ids.lessonId, "a", EMSILE.STRANGER).expect(403);
    await download(ids.lessonId, "yok", EMSILE.TALEBE).expect(404);
    // A file is its own session's: the same key under another answers nothing.
    await download(ids.foreignLessonId, "a", EMSILE.MANAGER).expect(404);
  });

  it("goes with its course when the course is purged, its objects queued", async () => {
    await upload(ids.lessonId, EMSILE.MUDERRIS, "a").expect(201);
    await save(ids.lessonId, EMSILE.MUDERRIS, sceneOf([image("a")])).expect(
      200
    );
    await save(ids.foreignLessonId, EMSILE.MANAGER, sceneOf([rect])).expect(
      200
    );
    const [file] = await db().select().from(lessonBoardFiles);

    await db().transaction((tx) => purgeCourses(tx, [ids.courseId]));
    expect(await db().select().from(lessonBoardFiles)).toHaveLength(0);
    const boards = await db().select().from(lessonBoards);
    expect(boards.map((board) => board.lessonId)).toEqual([
      ids.foreignLessonId,
    ]);
    const queued = await db().select().from(storageDeletions);
    expect(queued.map((row) => [row.storageKey, row.reason])).toContainEqual([
      file.storageKey,
      "course.purge",
    ]);
  });
});
