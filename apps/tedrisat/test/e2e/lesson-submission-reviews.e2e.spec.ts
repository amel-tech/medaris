import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { enrollments } from "../../src/database/schema/course.schema";
import { submissionReviewFiles } from "../../src/database/schema/lesson-submission.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import { users } from "../../src/database/schema/user.schema";
import { ObjectStorage } from "../../src/storage/object-storage";
import { StorageDeletionService } from "../../src/storage/storage-deletion.service";
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
import { html, pdf, png } from "../helpers/upload-fixtures";

/**
 * The course team's review of a talebe's homework: a note and up to five
 * files returned to the talebe ("Değerlendir"), by whoever holds
 * `submission.read` on the course, a ders nazırı given it included.
 *
 * Pinned here: the talebe sees nothing of a review until it is sent, then
 * reads the note and downloads the files of their own homework only; sending
 * tells the talebe; an empty review is refused; nobody without the permission
 * reviews; review files go from storage when removed or purged.
 */

/** A second enrolled talebe of course A. */
const OTHER_TALEBE = "e2910000-0000-4000-8000-0000000000c1";

type Sub = string;
const bearer = (sub: Sub) =>
  (Object.values(CAST) as string[]).includes(sub)
    ? bearerOf(sub as (typeof CAST)[keyof typeof CAST])
    : bearerFor({ sub });

interface IFileBody {
  id: string;
  name: string;
  downloadUrl: string;
}

const binary = (
  res: NodeJS.ReadableStream,
  done: (error: Error | null, body: Buffer) => void
) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};

describe("the review of a homework (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let lessonId: string;
  let submissionId: string;
  const storage = new MemoryObjectStorage();

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const sweep = () => app.get(StorageDeletionService).whenIdle();

  const own = (sub: Sub) =>
    http()
      .get(`/lessons/${lessonId}/submission`)
      .set("Authorization", bearer(sub));
  const reviewPath = (submission = submissionId, course = ids.courseId) =>
    `/courses/${course}/submissions/${submission}/review`;
  const send = (sub: Sub, note: unknown, submission?: string) =>
    http()
      .put(reviewPath(submission))
      .set("Authorization", bearer(sub))
      .send({ note });
  const addReviewFile = (
    sub: Sub,
    file: Buffer,
    filename = "Düzeltilmiş.pdf",
    submission?: string
  ) =>
    http()
      .post(`${reviewPath(submission)}/files`)
      .set("Authorization", bearer(sub))
      .attach("file", file, { filename });
  const removeReviewFile = (sub: Sub, fileId: string) =>
    http()
      .delete(`${reviewPath()}/files/${fileId}`)
      .set("Authorization", bearer(sub));
  const download = (sub: Sub, path: string) =>
    http()
      .get(path)
      .set("Authorization", bearer(sub))
      .buffer(true)
      .parse(binary);
  const audits = (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "storage_deletions",
      "notifications",
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
    await db().insert(enrollments).values({
      userId: OTHER_TALEBE,
      courseId: ids.courseId,
      status: EnrollmentStatus.ENROLLED,
    });
    lessonId = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Emsile, birinci bab",
    });
    await db()
      .insert(users)
      .values({ id: CAST.MUDERRIS, givenName: "Yunus", familyName: "Hoca" })
      .onConflictDoUpdate({
        target: users.id,
        set: { givenName: "Yunus", familyName: "Hoca" },
      });
    const handedIn = await http()
      .post(`/lessons/${lessonId}/submission/files`)
      .set("Authorization", bearer(CAST.TALEBE))
      .attach("file", pdf(), { filename: "Ödev 1.pdf" })
      .expect(201);
    submissionId = handedIn.body.id;
  });

  afterAll(async () => {
    await sweep();
    await clean();
    await app.close();
  });

  it("keeps a review file from the talebe until the review is sent", async () => {
    const added = await addReviewFile(CAST.MUDERRIS, png(), "a.png").expect(
      201
    );
    const [file] = added.body.review.files as IFileBody[];
    expect(added.body.review).toMatchObject({
      note: null,
      reviewedAt: null,
      reviewer: null,
    });
    expect(file).toMatchObject({
      name: "a.png",
      downloadUrl: `/courses/${ids.courseId}/submissions/review-files/${file.id}`,
    });
    expect((await own(CAST.TALEBE).expect(200)).body.submission.review).toBe(
      null
    );
    await download(
      CAST.TALEBE,
      `/lessons/${lessonId}/submission/review-files/${file.id}`
    ).expect(404);
    expect(await db().select().from(notifications)).toHaveLength(0);
  });

  it("sends the note and the files, tells the talebe, and serves the talebe their own review file", async () => {
    const added = await addReviewFile(CAST.MUDERRIS, pdf()).expect(201);
    const fileId = (added.body.review.files as IFileBody[])[0].id;

    const sent = await send(
      CAST.MUDERRIS,
      "  Üçüncü sîgayı düzelttim.  "
    ).expect(200);
    expect(sent.body.review).toMatchObject({
      note: "Üçüncü sîgayı düzelttim.",
      reviewer: { id: CAST.MUDERRIS, name: "Yunus Hoca" },
    });
    expect(sent.body.review.reviewedAt).toEqual(expect.any(String));

    const seen = (await own(CAST.TALEBE).expect(200)).body.submission.review;
    expect(seen).toMatchObject({
      note: "Üçüncü sîgayı düzelttim.",
      reviewer: { id: CAST.MUDERRIS, name: "Yunus Hoca" },
      files: [
        expect.objectContaining({
          id: fileId,
          name: "Düzeltilmiş.pdf",
          downloadUrl: `/lessons/${lessonId}/submission/review-files/${fileId}`,
        }),
      ],
    });
    const got = await download(
      CAST.TALEBE,
      `/lessons/${lessonId}/submission/review-files/${fileId}`
    ).expect(200);
    expect(got.body).toEqual(pdf());
    expect(got.headers["content-disposition"]).toMatch(/^attachment;/);

    const told = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, CAST.TALEBE));
    expect(told).toEqual([
      expect.objectContaining({
        type: "SUBMISSION_REVIEWED",
        targetType: "SESSION",
        targetId: lessonId,
        params: expect.objectContaining({
          courseId: ids.courseId,
          sessionLabel: "Emsile, birinci bab",
        }),
      }),
    ]);
    const [audit] = await audits("submission.review");
    expect(audit.details).toMatchObject({
      courseId: ids.courseId,
      lessonId,
      noteLength: "Üçüncü sîgayı düzelttim.".length,
      first: true,
    });
  });

  it("replaces the note when sent again and keeps the files", async () => {
    await addReviewFile(CAST.MUDERRIS, pdf()).expect(201);
    await send(CAST.MUDERRIS, "İlk").expect(200);
    const again = await send(CAST.MUDERRIS, "İkinci").expect(200);
    expect(again.body.review.note).toBe("İkinci");
    expect(again.body.review.files).toHaveLength(1);
    const reviews = await audits("submission.review");
    expect(reviews.map((r) => (r.details as { first: boolean }).first)).toEqual(
      expect.arrayContaining([true, false])
    );
  });

  it("refuses a review with neither a note nor a file", async () => {
    const res = await send(CAST.MUDERRIS, "   ").expect(400);
    expect(res.body.code).toBe("SUBMISSION_REVIEW_EMPTY");
    await send(CAST.MUDERRIS, "x".repeat(4001)).expect(400);
    expect((await own(CAST.TALEBE).expect(200)).body.submission.review).toBe(
      null
    );
  });

  it("sends a review that is only files", async () => {
    await addReviewFile(CAST.MUDERRIS, pdf()).expect(201);
    const sent = await send(CAST.MUDERRIS, null).expect(200);
    expect(sent.body.review).toMatchObject({ note: null });
    expect(sent.body.review.reviewedAt).toEqual(expect.any(String));
  });

  it("refuses everyone without submission.read, talebe included, until a ders nazırı is given it", async () => {
    for (const sub of [
      CAST.TALEBE,
      OTHER_TALEBE,
      CAST.BARE,
      CAST.SESSION,
      CAST.OTHER_COURSE,
      CAST.STRANGER,
    ]) {
      await send(sub, "x").expect(403);
      await addReviewFile(sub, pdf()).expect(403);
    }
    await db().insert(permissionGrants).values({
      scopeType: "course",
      scopeId: ids.courseId,
      userId: CAST.BARE,
      permission: "submission.read",
      grantedBy: CAST.MUDERRIS,
    });
    await addReviewFile(CAST.BARE, pdf()).expect(201);
    const sent = await send(CAST.BARE, "Ders nazırından").expect(200);
    expect(sent.body.review.reviewer.id).toBe(CAST.BARE);
  });

  it("serves a review file to no other talebe, and only on the record to the staff", async () => {
    const added = await addReviewFile(CAST.MUDERRIS, pdf()).expect(201);
    const fileId = (added.body.review.files as IFileBody[])[0].id;
    await send(CAST.MUDERRIS, "Tamam").expect(200);
    await download(
      OTHER_TALEBE,
      `/lessons/${lessonId}/submission/review-files/${fileId}`
    ).expect(403);
    await download(
      OTHER_TALEBE,
      `/courses/${ids.courseId}/submissions/review-files/${fileId}`
    ).expect(403);
    await download(
      CAST.MANAGER,
      `/courses/${ids.courseId}/submissions/review-files/${fileId}`
    ).expect(200);
    expect(await audits("submission.review_file_download")).toHaveLength(1);
  });

  it("refuses a disallowed type and a sixth file, and removes a file from storage", async () => {
    await addReviewFile(CAST.MUDERRIS, html(), "x.html").expect(415);
    let last = "";
    for (let i = 0; i < 5; i++) {
      const res = await addReviewFile(CAST.MUDERRIS, pdf(), `${i}.pdf`).expect(
        201
      );
      last = (res.body.review.files as IFileBody[])[i].id;
    }
    const sixth = await addReviewFile(CAST.MUDERRIS, pdf()).expect(409);
    expect(sixth.body.code).toBe("SUBMISSION_REVIEW_FILE_LIMIT");

    await removeReviewFile(CAST.MUDERRIS, last).expect(204);
    await removeReviewFile(CAST.MUDERRIS, last).expect(404);
    await sweep();
    expect(await db().select().from(submissionReviewFiles)).toHaveLength(4);
    // The talebe's own file and the four review files.
    expect(storage.keys()).toHaveLength(5);
    expect(await audits("submission.review_file_delete")).toHaveLength(1);
  });

  it("answers 404 for a homework of another course, and for one that is not there", async () => {
    await http()
      .put(reviewPath(submissionId, ids.otherCourseId))
      .set("Authorization", bearer(CAST.ADMIN))
      .send({ note: "x" })
      .expect(404);
    await send(
      CAST.MUDERRIS,
      "x",
      "e2910000-0000-4000-8000-0000000000ff"
    ).expect(404);
  });

  it("removes the review files with the homework when the course is deleted for real", async () => {
    await addReviewFile(CAST.MUDERRIS, pdf()).expect(201);
    await send(CAST.MUDERRIS, "Tamam").expect(200);
    await http()
      .delete(`/courses/${ids.courseId}`)
      .set("Authorization", bearerOf(CAST.ADMIN))
      .expect(200);
    await sweep();
    expect(await db().select().from(submissionReviewFiles)).toHaveLength(0);
    expect(storage.keys()).toHaveLength(0);
  });
});
