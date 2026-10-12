import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseResources,
  courses,
  lessonResources,
} from "../../src/database/schema/course.schema";
import { storageDeletions } from "../../src/database/schema/storage.schema";
import { ObjectStorage } from "../../src/storage/object-storage";
import { StorageDeletionService } from "../../src/storage/storage-deletion.service";
import { MAX_UPLOAD_BYTES } from "../../src/storage/upload";
import {
  bearerOf,
  CAST,
  type CastMember,
  type ICourseScopeIds,
  insertLiveLesson,
  seedCourseScope,
} from "../helpers/course-scope-cast";
import { MemoryObjectStorage } from "../helpers/memory-object-storage";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import {
  docx,
  exe,
  html,
  pdf,
  plainZip,
  svg,
} from "../helpers/upload-fixtures";

/**
 * MDRS-287 — a course's and a celse's resources as files in Medaris storage
 * (Bunny Storage in a deployment; an in-memory store here, MDRS-89).
 *
 * Uploading is the permission that edits the list today: `course.edit` for
 * the course's, `session.manage` for a celse's. The file is checked by its
 * bytes and size and stored under a key tedrisat makes. Names reach everyone
 * who may see the course; the file and its download route only a content
 * reader, and only a content reader can download it. A file taken off its
 * list, or purged with its celse or course, is removed from storage; a store
 * that does not answer never blocks the purge and its failures are kept.
 */

interface IFileBody {
  name: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}
interface IResourceBody {
  id: string;
  name: string;
  meta: string | null;
  url?: string | null;
  file?: IFileBody | null;
  orderIndex: number;
}

/** Reads a binary body whatever its type. */
const binary = (
  res: NodeJS.ReadableStream,
  done: (error: Error | null, body: Buffer) => void
) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};

describe("resource files in storage (MDRS-287, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let sessionId: string;
  const storage = new MemoryObjectStorage();

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const sweep = () => app.get(StorageDeletionService).whenIdle();

  const uploadToCourse = (
    sub: CastMember,
    file: Buffer,
    filename = "Emsile şerhi.pdf",
    fields: Record<string, string> = {}
  ) => {
    const call = http()
      .post(`/courses/${ids.courseId}/resources/files`)
      .set("Authorization", bearerOf(sub));
    for (const [k, v] of Object.entries(fields)) call.field(k, v);
    return call.attach("file", file, { filename });
  };
  const uploadToLesson = (
    sub: CastMember,
    file: Buffer,
    filename = "Celse notu.docx",
    lessonId = sessionId
  ) =>
    http()
      .post(`/lessons/${lessonId}/resources/files`)
      .set("Authorization", bearerOf(sub))
      .attach("file", file, { filename });
  const download = (path: string, sub?: CastMember) => {
    const call = http().get(path).buffer(true).parse(binary);
    if (sub) call.set("Authorization", bearerOf(sub));
    return call;
  };
  const readCourse = async (sub?: CastMember) => {
    const call = http().get(`/courses/${ids.courseId}`);
    if (sub) call.set("Authorization", bearerOf(sub));
    return (await call.expect(200)).body as {
      version: number;
      title: string;
      status: string;
      contentLocked: boolean;
      resources: IResourceBody[];
      weeks: {
        id: string;
        weekNumber: number;
        title: string;
        lessons: {
          id: string;
          title: string;
          type: string;
          resources: IResourceBody[];
        }[];
      }[];
    };
  };
  const auditActions = async (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "storage_deletions",
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: ObjectStorage, useValue: storage }],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await sweep();
    await clean();
    storage.objects.clear();
    storage.failing = false;
    ids = await seedCourseScope(db());
    sessionId = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Emsile, birinci bab",
      scheduledAt: new Date(Date.now() + 2 * 86_400_000),
    });
  });

  afterAll(async () => {
    await sweep();
    await clean();
    await app.close();
  });

  describe("uploading a course's file under course.edit", () => {
    it("stores the file under a key tedrisat makes, adds it last, bumps the version and audits it", async () => {
      const before = (await readCourse(CAST.MANAGER)).version;
      const res = await uploadToCourse(
        CAST.MUDERRIS,
        pdf(),
        "../Emsile şerhi.pdf",
        {
          meta: "PDF · 12 sayfa",
        }
      ).expect(201);

      const { resource, courseVersion } = res.body as {
        resource: IResourceBody;
        courseVersion: number;
      };
      expect(courseVersion).toBe(before + 1);
      expect(resource).toMatchObject({
        name: "Emsile şerhi",
        meta: "PDF · 12 sayfa",
        url: null,
        file: {
          name: "Emsile şerhi.pdf",
          contentType: "application/pdf",
          sizeBytes: pdf().length,
          downloadUrl: `/courses/${ids.courseId}/resources/${resource.id}/file`,
        },
      });
      // No storage key in any answer.
      expect(JSON.stringify(res.body)).not.toContain("test/courses");

      const [row] = await db()
        .select()
        .from(courseResources)
        .where(eq(courseResources.id, resource.id));
      expect(row.storageKey).toMatch(
        new RegExp(`^test/courses/${ids.courseId}/resources/[0-9a-f-]{36}$`)
      );
      expect(storage.objects.get(row.storageKey as string)?.body).toEqual(
        pdf()
      );
      // The upload claimed its reservation: nothing is waiting to be removed.
      expect(await db().select().from(storageDeletions)).toHaveLength(0);

      const [audit] = await auditActions("resource.file_upload");
      expect(audit).toMatchObject({
        actorId: CAST.MUDERRIS,
        entity: "resource",
        entityId: resource.id,
        details: expect.objectContaining({
          courseId: ids.courseId,
          fileName: "Emsile şerhi.pdf",
          sizeBytes: pdf().length,
        }),
      });
    });

    it("lets the köşk nazımı and a ders nazırı given course.edit upload, and nobody without it", async () => {
      await uploadToCourse(CAST.MANAGER, pdf()).expect(201);
      await uploadToCourse(CAST.EDIT, pdf()).expect(201);
      for (const sub of [
        CAST.SESSION,
        CAST.TALEBE,
        CAST.STRANGER,
        CAST.OTHER_COURSE,
      ]) {
        await uploadToCourse(sub, pdf()).expect(403);
      }
      await http()
        .post(`/courses/${ids.courseId}/resources/files`)
        .attach("file", pdf(), { filename: "a.pdf" })
        .expect(401);
      expect(storage.keys()).toHaveLength(2);
    });

    it("refuses HTML, SVG, a plain ZIP and an executable whatever they are called, and stores nothing", async () => {
      for (const [file, filename] of [
        [html(), "notes.pdf"],
        [svg(), "logo.png"],
        [plainZip(), "odev.docx"],
        [exe(), "kitap.pdf"],
      ] as const) {
        const res = await uploadToCourse(CAST.MANAGER, file, filename).expect(
          415
        );
        expect(res.body.code).toBe("FILE_TYPE_NOT_ALLOWED");
      }
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(courseResources)).toHaveLength(0);
    });

    it("refuses a file one byte over 25 MB with 413 as multer reads it, and no file at all with 400", async () => {
      const big = Buffer.concat([pdf(), Buffer.alloc(MAX_UPLOAD_BYTES)]);
      const res = await uploadToCourse(CAST.MANAGER, big).expect(413);
      expect(res.body.code).toBe("FILE_TOO_LARGE");
      const none = await http()
        .post(`/courses/${ids.courseId}/resources/files`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .field("name", "Boş")
        .expect(400);
      expect(none.body.code).toBe("FILE_REQUIRED");
      expect(storage.keys()).toHaveLength(0);
    });

    it("refuses a body announcing more than the limit before reading it", async () => {
      const server = app.getHttpServer();
      if (!server.listening)
        await new Promise<void>((r) => server.listen(0, r));
      const { port } = server.address() as AddressInfo;
      const answer = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          const req = httpRequest(
            {
              host: "127.0.0.1",
              port,
              method: "POST",
              path: `/courses/${ids.courseId}/resources/files`,
              headers: {
                authorization: bearerOf(CAST.MANAGER),
                "content-type": "multipart/form-data; boundary=x",
                "content-length": String(MAX_UPLOAD_BYTES * 2),
              },
            },
            (res) => {
              let body = "";
              res.on("data", (c) => {
                body += c;
              });
              res.on("end", () => {
                resolve({ status: res.statusCode ?? 0, body });
                req.destroy();
              });
            }
          );
          req.on("error", reject);
          // A few bytes only: the answer must come without the rest.
          req.write("--x\r\n");
        }
      );
      expect(answer.status).toBe(413);
      expect(JSON.parse(answer.body).code).toBe("FILE_TOO_LARGE");
    });
  });

  describe("reading and downloading", () => {
    let resourceId: string;
    let downloadUrl: string;

    beforeEach(async () => {
      const res = await uploadToCourse(CAST.MANAGER, pdf()).expect(201);
      resourceId = res.body.resource.id;
      downloadUrl = res.body.resource.file.downloadUrl;
    });

    it("gives the file and its route to a content reader, and only the name to everyone else", async () => {
      const talebe = await readCourse(CAST.TALEBE);
      expect(talebe.resources).toEqual([
        expect.objectContaining({
          id: resourceId,
          name: "Emsile şerhi",
          file: expect.objectContaining({ downloadUrl }),
        }),
      ]);
      for (const sub of [CAST.PENDING, CAST.STRANGER, undefined]) {
        const locked = await readCourse(sub);
        expect(locked.contentLocked).toBe(true);
        expect(locked.resources).toEqual([
          expect.objectContaining({ id: resourceId, name: "Emsile şerhi" }),
        ]);
        expect(locked.resources[0]).not.toHaveProperty("file");
        expect(locked.resources[0]).not.toHaveProperty("url");
        expect(JSON.stringify(locked)).not.toContain("/file");
      }
    });

    it("streams it to the enrolled talebe and the course team as an attachment, with the headers that keep it one", async () => {
      for (const sub of [
        CAST.TALEBE,
        CAST.MUDERRIS,
        CAST.MANAGER,
        CAST.ADMIN,
      ]) {
        const res = await download(downloadUrl, sub).expect(200);
        expect(res.body).toEqual(pdf());
        expect(res.headers["content-type"]).toBe("application/pdf");
        expect(res.headers["content-disposition"]).toBe(
          "attachment; filename=\"Emsile serhi.pdf\"; filename*=UTF-8''Emsile%20%C5%9Ferhi.pdf"
        );
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expect(res.headers["content-length"]).toBe(String(pdf().length));
      }
      // The köşk nazımı's read is a content read by someone who is neither
      // enrolled nor a müderris: on the record, as on the course page.
      const reads = await auditActions("course.content_read");
      expect(
        reads.some(
          (r) =>
            r.actorId === CAST.MANAGER &&
            (r.details as { via?: string }).via === "resource.download"
        )
      ).toBe(true);
      expect(reads.some((r) => r.actorId === CAST.TALEBE)).toBe(false);
    });

    it("refuses the pending talebe, a stranger and a ders nazırı of another course, and a caller with no token", async () => {
      for (const sub of [CAST.PENDING, CAST.STRANGER, CAST.OTHER_COURSE]) {
        await download(downloadUrl, sub).expect(403);
      }
      await download(downloadUrl).expect(401);
    });

    it("answers 404 for a resource that is not there, is a link, or belongs to another course", async () => {
      await download(
        `/courses/${ids.courseId}/resources/00000000-0000-4000-8000-000000000000/file`,
        CAST.TALEBE
      ).expect(404);
      const [link] = await db()
        .insert(courseResources)
        .values({
          courseId: ids.courseId,
          name: "Bağlantı",
          url: "https://example.org/a",
        })
        .returning();
      const res = await download(
        `/courses/${ids.courseId}/resources/${link.id}/file`,
        CAST.TALEBE
      ).expect(404);
      expect(res.body.toString()).toContain("RESOURCE_FILE_NOT_FOUND");
      await download(
        `/courses/${ids.otherCourseId}/resources/${resourceId}/file`,
        CAST.ADMIN
      ).expect(404);
    });

    it("answers 404 when the store has lost the object", async () => {
      storage.objects.clear();
      await download(downloadUrl, CAST.TALEBE).expect(404);
    });
  });

  describe("the whole-course save", () => {
    const payloadOf = (
      body: Awaited<ReturnType<typeof readCourse>>,
      resources: object[]
    ) => ({
      title: body.title,
      status: body.status,
      version: body.version,
      weeks: body.weeks.map((week) => ({
        id: week.id,
        weekNumber: week.weekNumber,
        title: week.title,
        lessons: week.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
        })),
      })),
      resources,
    });

    it("keeps a file sent back without a url, renamed and moved; refuses a url for it", async () => {
      const uploaded = (await uploadToCourse(CAST.MANAGER, pdf()).expect(201))
        .body.resource as IResourceBody;
      const body = await readCourse(CAST.MANAGER);
      await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .send(
          payloadOf(body, [
            { name: "Bina", url: "https://example.org/bina" },
            { id: uploaded.id, name: "Emsile (şerh)", meta: "PDF" },
          ])
        )
        .expect(200);
      const after = await readCourse(CAST.MANAGER);
      expect(after.resources).toEqual([
        expect.objectContaining({ name: "Bina", file: null }),
        expect.objectContaining({
          id: uploaded.id,
          name: "Emsile (şerh)",
          url: null,
          file: uploaded.file,
          orderIndex: 1,
        }),
      ]);

      const refused = await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .send(
          payloadOf(after, [
            { id: uploaded.id, name: "x", url: "https://example.org/x" },
          ])
        )
        .expect(400);
      expect(refused.body.code).toBe("RESOURCE_IS_FILE");
      expect(storage.keys()).toHaveLength(1);
    });

    it("removes a file the list leaves out from storage, and audits it", async () => {
      const uploaded = (await uploadToCourse(CAST.MUDERRIS, pdf()).expect(201))
        .body.resource as IResourceBody;
      expect(storage.keys()).toHaveLength(1);
      const body = await readCourse(CAST.MUDERRIS);
      await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.MUDERRIS))
        .send(payloadOf(body, []))
        .expect(200);
      await sweep();
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(storageDeletions)).toHaveLength(0);
      const [audit] = await auditActions("resource.file_delete");
      expect(audit).toMatchObject({
        actorId: CAST.MUDERRIS,
        entityId: uploaded.id,
        details: expect.objectContaining({ courseId: ids.courseId }),
      });
    });
  });

  describe("a celse's files under session.manage", () => {
    it("uploads under session.manage and not course.edit alone, and serves only content readers", async () => {
      await uploadToLesson(CAST.EDIT, docx()).expect(403);
      const res = await uploadToLesson(CAST.SESSION, docx()).expect(201);
      const resource = res.body.resource as IResourceBody & {
        lessonId: string;
      };
      expect(resource).toMatchObject({
        lessonId: sessionId,
        name: "Celse notu",
        url: null,
        file: {
          name: "Celse notu.docx",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          downloadUrl: `/lessons/${sessionId}/resources/${resource.id}/file`,
        },
      });
      expect(
        storage.keys(
          `test/courses/${ids.courseId}/lessons/${sessionId}/resources/`
        )
      ).toHaveLength(1);

      const course = await readCourse(CAST.TALEBE);
      const lesson = course.weeks[0].lessons.find((l) => l.id === sessionId);
      expect(lesson?.resources[0].file?.downloadUrl).toBe(
        resource.file?.downloadUrl
      );
      const locked = await readCourse(CAST.PENDING);
      expect(
        locked.weeks[0].lessons.find((l) => l.id === sessionId)?.resources[0]
      ).not.toHaveProperty("file");

      const file = await download(
        resource.file?.downloadUrl as string,
        CAST.TALEBE
      ).expect(200);
      expect(file.body).toEqual(docx());
      await download(resource.file?.downloadUrl as string, CAST.PENDING).expect(
        403
      );
    });

    it("keeps a file through a PATCH that sends it back, refuses a new row without a link, and removes a file left out", async () => {
      const resource = (await uploadToLesson(CAST.SESSION, docx()).expect(201))
        .body as { resource: IResourceBody; courseVersion: number };
      const kept = await http()
        .patch(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.SESSION))
        .send({
          version: resource.courseVersion,
          resources: [
            { id: resource.resource.id, name: "Notlar" },
            { name: "Bina", url: "https://example.org/bina" },
          ],
        })
        .expect(200);
      expect(kept.body.resources).toEqual([
        expect.objectContaining({
          id: resource.resource.id,
          name: "Notlar",
          file: resource.resource.file,
        }),
        expect.objectContaining({ name: "Bina", file: null }),
      ]);

      const noLink = await http()
        .patch(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.SESSION))
        .send({
          version: kept.body.courseVersion,
          resources: [
            { id: resource.resource.id, name: "Notlar" },
            { id: "00000000-0000-4000-8000-000000000000", name: "Adsız" },
          ],
        })
        .expect(400);
      expect(noLink.body.code).toBe("RESOURCE_URL_REQUIRED");
      const isFile = await http()
        .patch(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.SESSION))
        .send({
          version: kept.body.courseVersion,
          resources: [
            {
              id: resource.resource.id,
              name: "Notlar",
              url: "https://example.org/x",
            },
          ],
        })
        .expect(400);
      expect(isFile.body.code).toBe("RESOURCE_IS_FILE");
      expect(storage.keys()).toHaveLength(1);

      await http()
        .patch(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.SESSION))
        .send({ version: kept.body.courseVersion, resources: [] })
        .expect(200);
      await sweep();
      expect(storage.keys()).toHaveLength(0);
      expect(await auditActions("resource.file_delete")).toHaveLength(1);
    });

    it("serves no file of a hidden celse, and takes none for it", async () => {
      const resource = (await uploadToLesson(CAST.SESSION, docx()).expect(201))
        .body.resource as IResourceBody;
      await http()
        .delete(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await download(resource.file?.downloadUrl as string, CAST.TALEBE).expect(
        404
      );
      await uploadToLesson(CAST.SESSION, docx()).expect(404);
      // Hidden, not deleted: the file stays until the celse is purged.
      expect(storage.keys()).toHaveLength(1);
    });
  });

  describe("purges", () => {
    it("removes the files of a celse deleted for real from the archive", async () => {
      await uploadToLesson(CAST.SESSION, docx()).expect(201);
      await uploadToCourse(CAST.MANAGER, pdf()).expect(201);
      await http()
        .delete(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await http()
        .delete(`/archive/session/${sessionId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(204);
      await sweep();
      // The course's own file stays; the celse's went with it.
      expect(storage.keys()).toEqual([
        expect.stringMatching(
          new RegExp(`^test/courses/${ids.courseId}/resources/`)
        ),
      ]);
      expect(
        await db()
          .select()
          .from(lessonResources)
          .where(eq(lessonResources.lessonId, sessionId))
      ).toHaveLength(0);
    });

    it("removes every file of a course deleted for real, hidden celses' included", async () => {
      const hiddenId = await insertLiveLesson(db(), ids.weekId, 1);
      await uploadToLesson(CAST.SESSION, docx(), "a.docx", hiddenId).expect(
        201
      );
      await uploadToLesson(CAST.SESSION, docx()).expect(201);
      await uploadToCourse(CAST.MANAGER, pdf()).expect(201);
      await http()
        .delete(`/lessons/${hiddenId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      expect(storage.keys()).toHaveLength(3);
      await http()
        .delete(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(200);
      await sweep();
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(storageDeletions)).toHaveLength(0);
    });

    it("never lets a store that does not answer block the purge, and keeps each failure until a later pass succeeds", async () => {
      await uploadToCourse(CAST.MANAGER, pdf()).expect(201);
      storage.failing = true;
      await http()
        .delete(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(200);
      await sweep();
      expect(
        await db().select().from(courses).where(eq(courses.id, ids.courseId))
      ).toHaveLength(0);
      const [pending] = await db().select().from(storageDeletions);
      expect(pending).toMatchObject({
        reason: "course.purge",
        attempts: 1,
        lastError: expect.stringContaining("StorageUnavailableError"),
      });
      expect(pending.dueAt.getTime()).toBeGreaterThan(Date.now());
      expect(storage.keys()).toHaveLength(1);

      storage.failing = false;
      await db()
        .update(storageDeletions)
        .set({ dueAt: new Date(Date.now() - 1000) })
        .where(and(eq(storageDeletions.storageKey, pending.storageKey)));
      await app.get(StorageDeletionService).pass();
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(storageDeletions)).toHaveLength(0);
    });
  });

  describe("an upload the store refuses", () => {
    it("answers 503, records no resource, and leaves the key due for removal", async () => {
      storage.failing = true;
      const res = await uploadToCourse(CAST.MANAGER, pdf()).expect(503);
      expect(res.body.code).toBe("STORAGE_UNAVAILABLE");
      expect(await db().select().from(courseResources)).toHaveLength(0);
      const [pending] = await db().select().from(storageDeletions);
      expect(pending.reason).toBe("upload.failed");
      storage.failing = false;
    });
  });
});

describe("resource files without storage (MDRS-287, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let ids: ICourseScopeIds;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        {
          provide: ObjectStorage,
          useValue: new MemoryObjectStorage("test", false),
        },
      ],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    await new TestDatabaseUtils(databaseService).cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "storage_deletions",
      "audit_log",
      "users"
    );
    ids = await seedCourseScope(databaseService.db);
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers 503 STORAGE_NOT_CONFIGURED to an upload, and still serves the course", async () => {
    const res = await request(app.getHttpServer())
      .post(`/courses/${ids.courseId}/resources/files`)
      .set("Authorization", bearerOf(CAST.MANAGER))
      .attach("file", pdf(), { filename: "a.pdf" })
      .expect(503);
    expect(res.body.code).toBe("STORAGE_NOT_CONFIGURED");
    await request(app.getHttpServer())
      .get(`/courses/${ids.courseId}`)
      .set("Authorization", bearerOf(CAST.TALEBE))
      .expect(200);
  });
});
