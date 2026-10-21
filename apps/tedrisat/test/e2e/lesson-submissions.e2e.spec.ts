import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { enrollments } from "../../src/database/schema/course.schema";
import {
  lessonSubmissions,
  submissionFiles,
} from "../../src/database/schema/lesson-submission.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import { storageDeletions } from "../../src/database/schema/storage.schema";
import { users } from "../../src/database/schema/user.schema";
import { ObjectStorage } from "../../src/storage/object-storage";
import { StorageDeletionService } from "../../src/storage/storage-deletion.service";
import { MAX_UPLOAD_BYTES } from "../../src/storage/upload";
import {
  bearerOf,
  CAST,
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
import { bearerFor } from "../helpers/test-keycloak.helper";
import { docx, html, jpeg, pdf, png, text } from "../helpers/upload-fixtures";

/**
 * MDRS-290 — homework: a talebe hands in their work on a celse, a note and up
 * to five files in Medaris storage (MDRS-287's store and checks), and the
 * course's staff read it through `submission.read`.
 *
 * Acceptance criteria pinned here: a talebe hands in, changes and removes only
 * their own, only while enrolled; staff without the permission and other
 * talebe get 403 on another talebe's file; the server refuses disallowed types
 * and oversized files; files go from storage when removed or purged.
 */

/** A second enrolled talebe of course A. */
const OTHER_TALEBE = "e2900000-0000-4000-8000-0000000000c1";
/** A talebe whose course is completed: still enrolled, as for notes and questions. */
const COMPLETED = "e2900000-0000-4000-8000-0000000000c2";

type Sub = string;
const bearer = (sub: Sub) =>
  (Object.values(CAST) as string[]).includes(sub)
    ? bearerOf(sub as (typeof CAST)[keyof typeof CAST])
    : bearerFor({ sub });

interface IFileBody {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}
interface ISubmissionBody {
  id: string;
  lessonId: string;
  note: string | null;
  files: IFileBody[];
}

const binary = (
  res: NodeJS.ReadableStream,
  done: (error: Error | null, body: Buffer) => void
) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};

describe("homework on a celse (MDRS-290, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let lessonId: string;
  const storage = new MemoryObjectStorage();

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const sweep = () => app.get(StorageDeletionService).whenIdle();

  const own = (sub: Sub, lesson = lessonId) =>
    http()
      .get(`/lessons/${lesson}/submission`)
      .set("Authorization", bearer(sub));
  const saveNote = (sub: Sub, note: unknown, lesson = lessonId) =>
    http()
      .put(`/lessons/${lesson}/submission`)
      .set("Authorization", bearer(sub))
      .send({ note });
  const addFile = (
    sub: Sub,
    file: Buffer,
    filename = "Ödev 1.pdf",
    lesson = lessonId
  ) =>
    http()
      .post(`/lessons/${lesson}/submission/files`)
      .set("Authorization", bearer(sub))
      .attach("file", file, { filename });
  const removeFile = (sub: Sub, fileId: string, lesson = lessonId) =>
    http()
      .delete(`/lessons/${lesson}/submission/files/${fileId}`)
      .set("Authorization", bearer(sub));
  const download = (sub: Sub, path: string) =>
    http()
      .get(path)
      .set("Authorization", bearer(sub))
      .buffer(true)
      .parse(binary);
  const staffList = (sub: Sub, query = "") =>
    http()
      .get(`/courses/${ids.courseId}/submissions${query}`)
      .set("Authorization", bearer(sub));
  const audits = (action: string) =>
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
    await db()
      .insert(enrollments)
      .values([
        {
          userId: OTHER_TALEBE,
          courseId: ids.courseId,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: COMPLETED,
          courseId: ids.courseId,
          status: EnrollmentStatus.COMPLETED,
        },
      ]);
    lessonId = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Emsile, birinci bab",
    });
  });

  afterAll(async () => {
    await sweep();
    await clean();
    await app.close();
  });

  describe("the talebe's own homework", () => {
    it("starts empty, takes a note and files, reads them back and serves the talebe's own file", async () => {
      const empty = await own(CAST.TALEBE).expect(200);
      expect(empty.body).toEqual({
        submission: null,
        maxFiles: 10,
        maxFileBytes: MAX_UPLOAD_BYTES,
      });

      const noted = await saveNote(CAST.TALEBE, "  Çekimleri yazdım.  ").expect(
        200
      );
      expect(noted.body).toMatchObject({
        lessonId,
        note: "Çekimleri yazdım.",
        files: [],
      });

      const added = await addFile(CAST.TALEBE, pdf()).expect(201);
      const [file] = (added.body as ISubmissionBody).files;
      expect(file).toMatchObject({
        name: "Ödev 1.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf().length,
        downloadUrl: `/lessons/${lessonId}/submission/files/${file.id}`,
      });
      expect(added.body.note).toBe("Çekimleri yazdım.");
      expect(JSON.stringify(added.body)).not.toContain("test/courses");
      expect(
        storage.keys(
          `test/courses/${ids.courseId}/lessons/${lessonId}/submissions/${CAST.TALEBE}/`
        )
      ).toHaveLength(1);
      expect(await db().select().from(storageDeletions)).toHaveLength(0);

      const read = await own(CAST.TALEBE).expect(200);
      expect(read.body.submission.files).toEqual([file]);

      const got = await download(CAST.TALEBE, file.downloadUrl).expect(200);
      expect(got.body).toEqual(pdf());
      expect(got.headers["content-disposition"]).toBe(
        "attachment; filename=\"Odev 1.pdf\"; filename*=UTF-8''%C3%96dev%201.pdf"
      );
      expect(got.headers["x-content-type-options"]).toBe("nosniff");
      expect(got.headers["cache-control"]).toBe("private, no-store");

      const [upload] = await audits("submission.file_upload");
      expect(upload).toMatchObject({
        actorId: CAST.TALEBE,
        entity: "submission",
        details: expect.objectContaining({
          courseId: ids.courseId,
          lessonId,
          fileId: file.id,
        }),
      });
    });

    it("clears the note with null or blank, and refuses one over 4000 characters", async () => {
      await saveNote(CAST.TALEBE, "Bir not").expect(200);
      expect((await saveNote(CAST.TALEBE, "   ").expect(200)).body.note).toBe(
        null
      );
      await saveNote(CAST.TALEBE, null).expect(200);
      await saveNote(CAST.TALEBE, "x".repeat(4001)).expect(400);
      expect(await db().select().from(lessonSubmissions)).toHaveLength(1);
    });

    it("removes the talebe's own file, from storage too, and audits it", async () => {
      const added = await addFile(CAST.TALEBE, docx(), "Ödev.docx").expect(201);
      const [file] = (added.body as ISubmissionBody).files;
      await removeFile(CAST.TALEBE, file.id).expect(204);
      await sweep();
      expect(storage.keys()).toHaveLength(0);
      expect(
        (await own(CAST.TALEBE).expect(200)).body.submission.files
      ).toEqual([]);
      const [removal] = await audits("submission.file_delete");
      expect(removal).toMatchObject({
        actorId: CAST.TALEBE,
        details: expect.objectContaining({ fileId: file.id }),
      });
      await removeFile(CAST.TALEBE, file.id).expect(404);
    });

    it("holds at most ten files, refused before an eleventh is stored", async () => {
      for (const [make, name] of [
        [pdf, "1.pdf"],
        [png, "2.png"],
        [jpeg, "3.jpg"],
        [docx, "4.docx"],
        [() => text(), "5.txt"],
        [pdf, "6.pdf"],
        [png, "7.png"],
        [jpeg, "8.jpg"],
        [docx, "9.docx"],
        [() => text(), "10.txt"],
      ] as const) {
        await addFile(CAST.TALEBE, make(), name).expect(201);
      }
      const eleventh = await addFile(CAST.TALEBE, pdf(), "11.pdf").expect(409);
      expect(eleventh.body.code).toBe("SUBMISSION_FILE_LIMIT");
      expect(storage.keys()).toHaveLength(10);
      expect(await db().select().from(submissionFiles)).toHaveLength(10);
    });

    it("refuses a disallowed type and an oversized file, and stores nothing", async () => {
      const wrong = await addFile(CAST.TALEBE, html(), "odev.pdf").expect(415);
      expect(wrong.body.code).toBe("FILE_TYPE_NOT_ALLOWED");
      const big = await addFile(
        CAST.TALEBE,
        Buffer.concat([pdf(), Buffer.alloc(MAX_UPLOAD_BYTES)])
      ).expect(413);
      expect(big.body.code).toBe("FILE_TOO_LARGE");
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(submissionFiles)).toHaveLength(0);
    });

    it("lets a talebe whose course is completed hand in, as notes and questions do", async () => {
      await addFile(COMPLETED, pdf()).expect(201);
    });

    it("refuses a pending talebe, a stranger and the course team as talebe, on every write", async () => {
      for (const sub of [CAST.PENDING, CAST.STRANGER, CAST.MUDERRIS]) {
        const note = await saveNote(sub, "x").expect(403);
        expect(note.body.code).toBe("SUBMISSION_FORBIDDEN");
        await addFile(sub, pdf()).expect(403);
      }
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(lessonSubmissions)).toHaveLength(0);
    });

    it("takes nothing on a hidden celse", async () => {
      await http()
        .delete(`/lessons/${lessonId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await saveNote(CAST.TALEBE, "x").expect(404);
      await addFile(CAST.TALEBE, pdf()).expect(404);
      expect(storage.keys()).toHaveLength(0);
    });
  });

  describe("another talebe's file", () => {
    let file: IFileBody;

    beforeEach(async () => {
      file = (
        (await addFile(CAST.TALEBE, pdf()).expect(201)).body as ISubmissionBody
      ).files[0];
    });

    it("is 403 to another talebe: no download, no removal, no staff list", async () => {
      expect((await own(OTHER_TALEBE).expect(200)).body.submission).toBeNull();
      const got = await download(OTHER_TALEBE, file.downloadUrl).expect(403);
      expect(JSON.parse(got.body.toString()).code).toBe("SUBMISSION_FORBIDDEN");
      await removeFile(OTHER_TALEBE, file.id).expect(403);
      await staffList(OTHER_TALEBE).expect(403);
      await download(
        OTHER_TALEBE,
        `/courses/${ids.courseId}/submissions/files/${file.id}`
      ).expect(403);
      expect(storage.keys()).toHaveLength(1);
    });

    it("is 403 to staff on the talebe's own route, the müderris included", async () => {
      for (const sub of [CAST.MUDERRIS, CAST.MANAGER, CAST.SESSION]) {
        await download(sub, file.downloadUrl).expect(403);
      }
    });
  });

  describe("the staff's read", () => {
    let file: IFileBody;
    let otherLessonId: string;

    beforeEach(async () => {
      otherLessonId = await insertLiveLesson(db(), ids.weekId, 1, {
        title: "Emsile, ikinci bab",
      });
      await saveNote(CAST.TALEBE, "Çekimler").expect(200);
      file = (
        (await addFile(CAST.TALEBE, pdf()).expect(201)).body as ISubmissionBody
      ).files[0];
      await addFile(OTHER_TALEBE, docx(), "b.docx", otherLessonId).expect(201);
      await db()
        .insert(users)
        .values({ id: CAST.TALEBE, givenName: "Ayşe", familyName: "Talebe" })
        .onConflictDoUpdate({
          target: users.id,
          set: { givenName: "Ayşe", familyName: "Talebe" },
        });
    });

    it("lists every homework of the course for the müderris, by session, with who and the files", async () => {
      const res = await staffList(CAST.MUDERRIS).expect(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({
          lessonId,
          lessonTitle: "Emsile, birinci bab",
          weekNumber: 1,
          note: "Çekimler",
          talebe: { id: CAST.TALEBE, name: "Ayşe Talebe" },
          files: [
            expect.objectContaining({
              id: file.id,
              name: "Ödev 1.pdf",
              downloadUrl: `/courses/${ids.courseId}/submissions/files/${file.id}`,
            }),
          ],
        }),
        expect.objectContaining({
          lessonId: otherLessonId,
          talebe: expect.objectContaining({ id: OTHER_TALEBE }),
        }),
      ]);
      const one = await staffList(
        CAST.MUDERRIS,
        `?lessonId=${lessonId}`
      ).expect(200);
      expect(one.body.items).toHaveLength(1);
      expect(JSON.stringify(res.body)).not.toContain("test/courses");
    });

    it("lets the müderris, the köşk nazımı and the başnazım download, each on the record", async () => {
      const path = `/courses/${ids.courseId}/submissions/files/${file.id}`;
      for (const sub of [CAST.MUDERRIS, CAST.MANAGER, CAST.ADMIN]) {
        const got = await download(sub, path).expect(200);
        expect(got.body).toEqual(pdf());
        expect(got.headers["content-disposition"]).toMatch(/^attachment;/);
      }
      const reads = await audits("submission.file_download");
      expect(reads.map((r) => r.actorId).sort()).toEqual(
        [CAST.MUDERRIS, CAST.MANAGER, CAST.ADMIN].sort()
      );
      expect(reads[0].details).toMatchObject({
        courseId: ids.courseId,
        lessonId,
        talebeId: CAST.TALEBE,
        fileId: file.id,
      });
    });

    it("refuses staff without submission.read, until a ders nazırı is given it", async () => {
      const path = `/courses/${ids.courseId}/submissions/files/${file.id}`;
      for (const sub of [
        CAST.BARE,
        CAST.SESSION,
        CAST.EDIT,
        CAST.OTHER_COURSE,
        CAST.STRANGER,
      ]) {
        await staffList(sub).expect(403);
        await download(sub, path).expect(403);
      }
      await db().insert(permissionGrants).values({
        scopeType: "course",
        scopeId: ids.courseId,
        userId: CAST.BARE,
        permission: "submission.read",
        grantedBy: CAST.MUDERRIS,
      });
      await staffList(CAST.BARE).expect(200);
      await download(CAST.BARE, path).expect(200);
      expect(await audits("submission.file_download")).toHaveLength(1);
    });

    it("answers 404 for a file of another course", async () => {
      await download(
        CAST.ADMIN,
        `/courses/${ids.otherCourseId}/submissions/files/${file.id}`
      ).expect(404);
    });
  });

  describe("purges", () => {
    it("removes a celse's homework and its files when the celse is deleted for real", async () => {
      await addFile(CAST.TALEBE, pdf()).expect(201);
      await addFile(OTHER_TALEBE, png(), "a.png").expect(201);
      await http()
        .delete(`/lessons/${lessonId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await http()
        .delete(`/archive/session/${lessonId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(204);
      await sweep();
      expect(await db().select().from(lessonSubmissions)).toHaveLength(0);
      expect(await db().select().from(submissionFiles)).toHaveLength(0);
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(storageDeletions)).toHaveLength(0);
    });

    it("removes them when a week is deleted for real", async () => {
      await addFile(CAST.TALEBE, pdf()).expect(201);
      await http()
        .post(`/courses/${ids.courseId}/weeks/${ids.weekId}/hide`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await http()
        .delete(`/archive/week/${ids.weekId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(204);
      await sweep();
      expect(await db().select().from(submissionFiles)).toHaveLength(0);
      expect(storage.keys()).toHaveLength(0);
    });

    it("removes them when the course is deleted for real", async () => {
      await addFile(CAST.TALEBE, pdf()).expect(201);
      await saveNote(OTHER_TALEBE, "Yalnız not").expect(200);
      await http()
        .delete(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(200);
      await sweep();
      expect(await db().select().from(lessonSubmissions)).toHaveLength(0);
      expect(storage.keys()).toHaveLength(0);
    });
  });
});
