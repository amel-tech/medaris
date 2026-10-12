import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  enrollments,
  lessonResources,
} from "../../src/database/schema/course.schema";
import {
  lessonAssignmentFiles,
  lessonAssignments,
} from "../../src/database/schema/lesson-assignment.schema";
import { lessonSubmissions } from "../../src/database/schema/lesson-submission.schema";
import { storageDeletions } from "../../src/database/schema/storage.schema";
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
import { docx, html, pdf, png } from "../helpers/upload-fixtures";

/**
 * The homework a müderris sets on a celse, apart from its resources. The
 * owner, 2026-10-12: "ders/celse kaynağı ile ödev yükleme ve gösterim
 * alanları ayrı olsun, ödevin ödev olduğu anlaşılsın ve yapılmamış ödevin
 * vurgulanması sağlansın".
 *
 * Pinned here: `session.manage` sets, changes and takes off a celse's homework
 * and its files, each write on the record; the files keep the resource
 * files' limits and checks and never join the resource list; the course and
 * session reads carry the homework to content readers only; purges remove it
 * and its files; the talebe's course read says where they handed in, and the
 * staff's Ödevler read says "N / M teslim".
 */

/** A second enrolled talebe of course A. */
const OTHER_TALEBE = "e2600000-0000-4000-8000-0000000000c1";
/** A talebe whose course is completed: still one who may hand in. */
const COMPLETED = "e2600000-0000-4000-8000-0000000000c2";

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
interface IAssignmentBody {
  id: string;
  lessonId: string;
  description: string | null;
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

describe("a celse's homework apart from its resources (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let lessonId: string;
  const storage = new MemoryObjectStorage();

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const sweep = () => app.get(StorageDeletionService).whenIdle();

  const save = (sub: Sub, description: unknown, lesson = lessonId) =>
    http()
      .put(`/lessons/${lesson}/assignment`)
      .set("Authorization", bearer(sub))
      .send({ description });
  const takeOff = (sub: Sub, lesson = lessonId) =>
    http()
      .delete(`/lessons/${lesson}/assignment`)
      .set("Authorization", bearer(sub));
  const addFile = (
    sub: Sub,
    file: Buffer,
    filename = "Yönerge.pdf",
    lesson = lessonId
  ) =>
    http()
      .post(`/lessons/${lesson}/assignment/files`)
      .set("Authorization", bearer(sub))
      .attach("file", file, { filename });
  const removeFile = (sub: Sub, fileId: string, lesson = lessonId) =>
    http()
      .delete(`/lessons/${lesson}/assignment/files/${fileId}`)
      .set("Authorization", bearer(sub));
  const download = (sub: Sub, path: string) =>
    http()
      .get(path)
      .set("Authorization", bearer(sub))
      .buffer(true)
      .parse(binary);
  const courseRead = (sub: Sub) =>
    http().get(`/courses/${ids.courseId}`).set("Authorization", bearer(sub));
  const sessionRead = (sub: Sub, lesson = lessonId) =>
    http()
      .get(`/courses/${ids.courseId}/sessions/${lesson}`)
      .set("Authorization", bearer(sub));
  const lessonOf = (body: {
    weeks: { lessons: Record<string, unknown>[] }[];
  }) =>
    body.weeks
      .flatMap((week) => week.lessons)
      .find((lesson) => lesson.id === lessonId) as Record<string, unknown>;
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

  describe("setting it", () => {
    it("is made by the first save, changed by the next, each on the record, and a save that changes nothing writes nothing", async () => {
      const made = await save(
        CAST.SESSION,
        "  Birinci babı çekin.\nFotoğrafını yükleyin.  "
      ).expect(200);
      expect(made.body).toMatchObject({
        lessonId,
        description: "Birinci babı çekin.\nFotoğrafını yükleyin.",
        files: [],
      });
      const changed = await save(CAST.MUDERRIS, "İkinci babı çekin.").expect(
        200
      );
      expect(changed.body.id).toBe(made.body.id);
      expect(changed.body.description).toBe("İkinci babı çekin.");
      await save(CAST.MUDERRIS, "İkinci babı çekin.").expect(200);
      const cleared = await save(CAST.MUDERRIS, "   ").expect(200);
      expect(cleared.body.description).toBeNull();

      const [create] = await audits("lesson_assignment.create");
      expect(create).toMatchObject({
        actorId: CAST.SESSION,
        entity: "lesson_assignment",
        entityId: made.body.id,
        details: {
          courseId: ids.courseId,
          lessonId,
          descriptionLength: 41,
        },
      });
      const updates = await audits("lesson_assignment.update");
      expect(updates).toHaveLength(2);
      expect(JSON.stringify(updates)).not.toContain("babı");
      expect(await db().select().from(lessonAssignments)).toHaveLength(1);
    });

    it("refuses a description over 4000 characters", async () => {
      await save(CAST.MUDERRIS, "x".repeat(4001)).expect(400);
      expect(await db().select().from(lessonAssignments)).toHaveLength(0);
    });

    it("is session.manage's: course.edit alone, a talebe and a stranger are refused", async () => {
      for (const sub of [CAST.EDIT, CAST.TALEBE, CAST.STRANGER]) {
        await save(sub, "x").expect(403);
      }
      await save(CAST.OTHER_COURSE, "x").expect(403);
      expect(await db().select().from(lessonAssignments)).toHaveLength(0);
    });

    it("takes nothing on a hidden celse", async () => {
      await http()
        .delete(`/lessons/${lessonId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      const res = await save(CAST.MUDERRIS, "x").expect(404);
      expect(res.body.code).toBe("LESSON_NOT_FOUND");
    });
  });

  describe("its files", () => {
    it("are uploaded under the homework, never as a resource, and served to a content reader as an attachment", async () => {
      await save(CAST.MUDERRIS, "Yönergeye göre çalışın.").expect(200);
      const added = await addFile(CAST.SESSION, pdf()).expect(201);
      const [file] = (added.body as IAssignmentBody).files;
      expect(file).toMatchObject({
        name: "Yönerge.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf().length,
        downloadUrl: `/lessons/${lessonId}/assignment/files/${file.id}`,
      });
      expect(JSON.stringify(added.body)).not.toContain("test/courses");
      expect(
        storage.keys(
          `test/courses/${ids.courseId}/lessons/${lessonId}/assignment/`
        )
      ).toHaveLength(1);
      expect(await db().select().from(lessonResources)).toHaveLength(0);
      expect(await db().select().from(storageDeletions)).toHaveLength(0);

      const got = await download(CAST.TALEBE, file.downloadUrl).expect(200);
      expect(got.body).toEqual(pdf());
      expect(got.headers["content-disposition"]).toMatch(/^attachment;/);
      expect(got.headers["x-content-type-options"]).toBe("nosniff");
      expect(got.headers["cache-control"]).toBe("private, no-store");
      for (const sub of [CAST.STRANGER, CAST.PENDING]) {
        await download(sub, file.downloadUrl).expect(403);
      }

      const [upload] = await audits("lesson_assignment.file_upload");
      expect(upload).toMatchObject({
        actorId: CAST.SESSION,
        details: expect.objectContaining({
          courseId: ids.courseId,
          lessonId,
          fileId: file.id,
          fileName: "Yönerge.pdf",
        }),
      });
    });

    it("need homework to go to: none stored before it is set", async () => {
      const res = await addFile(CAST.MUDERRIS, pdf()).expect(404);
      expect(res.body.code).toBe("LESSON_ASSIGNMENT_NOT_FOUND");
      expect(storage.keys()).toHaveLength(0);
    });

    it("keep the resource files' limits: a disallowed type and an oversized file are refused, nothing stored", async () => {
      await save(CAST.MUDERRIS, null).expect(200);
      const wrong = await addFile(CAST.MUDERRIS, html(), "odev.pdf").expect(
        415
      );
      expect(wrong.body.code).toBe("FILE_TYPE_NOT_ALLOWED");
      const big = await addFile(
        CAST.MUDERRIS,
        Buffer.concat([pdf(), Buffer.alloc(MAX_UPLOAD_BYTES)])
      ).expect(413);
      expect(big.body.code).toBe("FILE_TOO_LARGE");
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(lessonAssignmentFiles)).toHaveLength(0);
    });

    it("are uploaded and removed by session.manage only", async () => {
      await save(CAST.MUDERRIS, null).expect(200);
      for (const sub of [CAST.EDIT, CAST.TALEBE]) {
        await addFile(sub, pdf()).expect(403);
      }
      const added = await addFile(CAST.MUDERRIS, docx(), "Yönerge.docx").expect(
        201
      );
      const [file] = (added.body as IAssignmentBody).files;
      await removeFile(CAST.TALEBE, file.id).expect(403);
      expect(storage.keys()).toHaveLength(1);
    });

    it("go from storage when removed, on the record", async () => {
      await save(CAST.MUDERRIS, null).expect(200);
      const added = await addFile(CAST.MUDERRIS, png(), "a.png").expect(201);
      const [file] = (added.body as IAssignmentBody).files;
      await removeFile(CAST.SESSION, file.id).expect(204);
      await sweep();
      expect(storage.keys()).toHaveLength(0);
      const [removal] = await audits("lesson_assignment.file_delete");
      expect(removal).toMatchObject({
        actorId: CAST.SESSION,
        details: expect.objectContaining({ fileId: file.id }),
      });
      const again = await removeFile(CAST.SESSION, file.id).expect(404);
      expect(again.body.code).toBe("LESSON_ASSIGNMENT_FILE_NOT_FOUND");
    });
  });

  describe("taking it off", () => {
    it("removes the description and every file, from storage too, on the record, and leaves the talebe's submissions", async () => {
      await save(CAST.MUDERRIS, "Çekin.").expect(200);
      await addFile(CAST.MUDERRIS, pdf()).expect(201);
      await addFile(CAST.MUDERRIS, png(), "b.png").expect(201);
      await http()
        .put(`/lessons/${lessonId}/submission`)
        .set("Authorization", bearerOf(CAST.TALEBE))
        .send({ note: "Yaptım." })
        .expect(200);

      await takeOff(CAST.SESSION).expect(204);
      await sweep();
      expect(await db().select().from(lessonAssignments)).toHaveLength(0);
      expect(await db().select().from(lessonAssignmentFiles)).toHaveLength(0);
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(lessonSubmissions)).toHaveLength(1);
      const [removal] = await audits("lesson_assignment.delete");
      expect(removal).toMatchObject({
        actorId: CAST.SESSION,
        details: expect.objectContaining({
          courseId: ids.courseId,
          lessonId,
          files: [
            expect.objectContaining({ fileName: "Yönerge.pdf" }),
            expect.objectContaining({ fileName: "b.png" }),
          ],
        }),
      });

      const again = await takeOff(CAST.SESSION).expect(404);
      expect(again.body.code).toBe("LESSON_ASSIGNMENT_NOT_FOUND");
      await takeOff(CAST.EDIT).expect(403);
    });
  });

  describe("the course and session reads", () => {
    beforeEach(async () => {
      await save(CAST.MUDERRIS, "Çekimleri yazın.").expect(200);
      await addFile(CAST.MUDERRIS, pdf()).expect(201);
    });

    it("carry the homework to a content reader, apart from the resources", async () => {
      for (const sub of [CAST.TALEBE, CAST.MUDERRIS]) {
        const lesson = lessonOf((await courseRead(sub).expect(200)).body);
        expect(lesson.resources).toEqual([]);
        expect(lesson.assignment).toMatchObject({
          description: "Çekimleri yazın.",
          files: [expect.objectContaining({ name: "Yönerge.pdf" })],
        });
      }
      const session = await sessionRead(CAST.TALEBE).expect(200);
      expect(session.body.assignment).toMatchObject({
        description: "Çekimleri yazın.",
        files: [expect.objectContaining({ name: "Yönerge.pdf" })],
      });
      expect(session.body.resources).toEqual([]);
    });

    it("say null for a celse with none, and tell a caller who may not read the content nothing", async () => {
      const other = await insertLiveLesson(db(), ids.weekId, 1);
      const body = (await courseRead(CAST.TALEBE).expect(200)).body;
      const plain = body.weeks[0].lessons.find(
        (l: { id: string }) => l.id === other
      );
      expect(plain.assignment).toBeNull();

      for (const sub of [CAST.STRANGER, CAST.PENDING]) {
        const locked = (await courseRead(sub).expect(200)).body;
        expect(locked.contentLocked).toBe(true);
        expect(lessonOf(locked)).not.toHaveProperty("assignment");
        const session = await sessionRead(sub).expect(200);
        expect(session.body).not.toHaveProperty("assignment");
      }
    });
  });

  describe("where the talebe handed in", () => {
    let second: string;

    beforeEach(async () => {
      second = await insertLiveLesson(db(), ids.weekId, 1, {
        title: "Emsile, ikinci bab",
      });
      await save(CAST.MUDERRIS, "Çekin.").expect(200);
      await save(CAST.MUDERRIS, null, second).expect(200);
    });

    const submit = (sub: Sub, note: string | null, lesson = lessonId) =>
      http()
        .put(`/lessons/${lesson}/submission`)
        .set("Authorization", bearer(sub))
        .send({ note })
        .expect(200);
    const mine = (sub: Sub) =>
      http()
        .get(`/courses/${ids.courseId}/my-submissions`)
        .set("Authorization", bearer(sub));

    it("lists the talebe's own hand-ins only, an emptied one not among them", async () => {
      await submit(CAST.TALEBE, "Yaptım.");
      await submit(CAST.TALEBE, "Taslak", second);
      await submit(CAST.TALEBE, null, second);
      await submit(OTHER_TALEBE, "Benim.", second);
      const res = await mine(CAST.TALEBE).expect(200);
      expect(res.body.items).toEqual([
        { lessonId, updatedAt: expect.any(String) },
      ]);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect((await mine(CAST.STRANGER).expect(200)).body.items).toEqual([]);
    });

    it("counts N / M teslim for the staff, per celse, with whether it has homework", async () => {
      const third = await insertLiveLesson(db(), ids.weekId, 2);
      await submit(CAST.TALEBE, "Yaptım.");
      await http()
        .post(`/lessons/${lessonId}/submission/files`)
        .set("Authorization", bearerOf(CAST.TALEBE))
        .attach("file", pdf(), { filename: "odev.pdf" })
        .expect(201);
      await submit(OTHER_TALEBE, "Benim.");
      // Emptied: handed nothing in.
      await submit(COMPLETED, null);
      // Handed in on the second celse, then left the course: listed, not counted.
      await submit(OTHER_TALEBE, "İkinci.", second);
      await db()
        .update(enrollments)
        .set({ status: EnrollmentStatus.REVOKED })
        .where(eq(enrollments.userId, OTHER_TALEBE));

      const res = await http()
        .get(`/courses/${ids.courseId}/submissions`)
        .set("Authorization", bearerOf(CAST.MUDERRIS))
        .expect(200);
      expect(res.body.talebeCount).toBe(2);
      expect(res.body.sessions).toEqual([
        { lessonId, hasAssignment: true, handedInCount: 1 },
        { lessonId: second, hasAssignment: true, handedInCount: 0 },
        { lessonId: third, hasAssignment: false, handedInCount: 0 },
      ]);
      const one = await http()
        .get(`/courses/${ids.courseId}/submissions?lessonId=${second}`)
        .set("Authorization", bearerOf(CAST.MUDERRIS))
        .expect(200);
      expect(one.body.sessions).toEqual([
        { lessonId: second, hasAssignment: true, handedInCount: 0 },
      ]);
    });
  });

  describe("purges", () => {
    beforeEach(async () => {
      await save(CAST.MUDERRIS, "Çekin.").expect(200);
      await addFile(CAST.MUDERRIS, pdf()).expect(201);
    });

    const gone = async () => {
      await sweep();
      expect(await db().select().from(lessonAssignments)).toHaveLength(0);
      expect(await db().select().from(lessonAssignmentFiles)).toHaveLength(0);
      expect(storage.keys()).toHaveLength(0);
      expect(await db().select().from(storageDeletions)).toHaveLength(0);
    };

    it("remove a celse's homework and its files when the celse is deleted for real", async () => {
      await http()
        .delete(`/lessons/${lessonId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      // Hidden, it is kept and serves nothing.
      expect(await db().select().from(lessonAssignments)).toHaveLength(1);
      await http()
        .delete(`/archive/session/${lessonId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(204);
      await gone();
    });

    it("remove them when a week is deleted for real", async () => {
      await http()
        .post(`/courses/${ids.courseId}/weeks/${ids.weekId}/hide`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await http()
        .delete(`/archive/week/${ids.weekId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(204);
      await gone();
    });

    it("remove them when the course is deleted for real", async () => {
      await http()
        .delete(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(200);
      await gone();
    });
  });
});
