import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { enrollments } from "../../src/database/schema/course.schema";
import { assignmentEvaluations } from "../../src/database/schema/lesson-assignment.schema";
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
import { pdf } from "../helpers/upload-fixtures";

/**
 * Memorisation homework and "Değerlendirme" (MDRS-248). A celse's homework is
 * handed in as files (FILE, as before) or recited to the müderris (MEMORIZE).
 * A recited one takes no file from the talebe; the course team marks each
 * seated talebe "Tam", "Eksik" or "Vermedi" with an optional note, and the
 * talebe reads their own mark.
 *
 * Pinned here: the kind is kept and defaults to FILE; the upload refusal; the
 * board's rows, columns and "N tam"; who may mark (`session.manage` on this
 * course, not on another) and whom (a talebe seated in this course); that a
 * talebe reads only their own mark, never another's, and writes none; that
 * taking the homework off takes its marks.
 */

/** A second enrolled talebe of course A. */
const OTHER_TALEBE = "e2480000-0000-4000-8000-0000000000c1";
/** A talebe whose course is completed: still marked. */
const COMPLETED = "e2480000-0000-4000-8000-0000000000c2";
/** A talebe of course B only. */
const TALEBE_OF_B = "e2480000-0000-4000-8000-0000000000c3";

type Sub = string;
const bearer = (sub: Sub) =>
  (Object.values(CAST) as string[]).includes(sub)
    ? bearerOf(sub as (typeof CAST)[keyof typeof CAST])
    : bearerFor({ sub });

interface IMarkBody {
  lessonId: string;
  userId: string;
  status: string;
  note: string | null;
}

describe("memorisation homework and its marks (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let lessonId: string;
  const storage = new MemoryObjectStorage();

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const sweep = () => app.get(StorageDeletionService).whenIdle();

  const setHomework = (
    sub: Sub,
    body: Record<string, unknown>,
    lesson = lessonId
  ) =>
    http()
      .put(`/lessons/${lesson}/assignment`)
      .set("Authorization", bearer(sub))
      .send(body);
  const mark = (
    sub: Sub,
    talebe: string,
    body: Record<string, unknown>,
    lesson = lessonId
  ) =>
    http()
      .put(`/lessons/${lesson}/evaluations/${talebe}`)
      .set("Authorization", bearer(sub))
      .send(body);
  const board = (sub: Sub, course = ids.courseId) =>
    http()
      .get(`/courses/${course}/evaluations`)
      .set("Authorization", bearer(sub));
  const own = (sub: Sub, lesson = lessonId) =>
    http()
      .get(`/lessons/${lesson}/evaluation`)
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
        {
          userId: TALEBE_OF_B,
          courseId: ids.otherCourseId,
          status: EnrollmentStatus.ENROLLED,
        },
      ]);
    await db()
      .insert(users)
      .values([
        { id: CAST.TALEBE, givenName: "Zeynep", familyName: "Talebe" },
        { id: OTHER_TALEBE, givenName: "Ahmet", familyName: "Talebe" },
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

  describe("the kind of a homework", () => {
    it("is FILE unless set, kept by a save that leaves it out, and carried by the course read", async () => {
      const made = await setHomework(CAST.MUDERRIS, {
        description: "Çekin.",
      }).expect(200);
      expect(made.body.kind).toBe("FILE");

      const recited = await setHomework(CAST.MUDERRIS, {
        description: "Ezberleyin.",
        kind: "MEMORIZE",
      }).expect(200);
      expect(recited.body.kind).toBe("MEMORIZE");
      const [update] = await audits("lesson_assignment.update");
      expect(update.details).toMatchObject({
        kind: { from: "FILE", to: "MEMORIZE" },
      });

      const kept = await setHomework(CAST.MUDERRIS, {
        description: "Birinci babı ezberleyin.",
      }).expect(200);
      expect(kept.body.kind).toBe("MEMORIZE");

      const read = await http()
        .get(`/courses/${ids.courseId}`)
        .set("Authorization", bearer(CAST.TALEBE))
        .expect(200);
      const lesson = (
        read.body.weeks as { lessons: { id: string; assignment: unknown }[] }[]
      )
        .flatMap((week) => week.lessons)
        .find((l) => l.id === lessonId);
      expect(lesson?.assignment).toMatchObject({ kind: "MEMORIZE" });
    });

    it("refuses a kind it does not know", async () => {
      await setHomework(CAST.MUDERRIS, { kind: "ORAL" }).expect(400);
    });

    it("takes no file from the talebe on a recited homework, and files again once it is FILE", async () => {
      await setHomework(CAST.MUDERRIS, { kind: "MEMORIZE" }).expect(200);
      const refused = await http()
        .post(`/lessons/${lessonId}/submission/files`)
        .set("Authorization", bearer(CAST.TALEBE))
        .attach("file", pdf(), { filename: "Ezber.pdf" })
        .expect(409);
      expect(refused.body.code).toBe("SUBMISSION_FILES_NOT_TAKEN");
      expect(storage.keys()).toHaveLength(0);

      await setHomework(CAST.MUDERRIS, { kind: "FILE" }).expect(200);
      await http()
        .post(`/lessons/${lessonId}/submission/files`)
        .set("Authorization", bearer(CAST.TALEBE))
        .attach("file", pdf(), { filename: "Ödev.pdf" })
        .expect(201);
    });
  });

  describe("marking", () => {
    beforeEach(async () => {
      await setHomework(CAST.MUDERRIS, {
        description: "Birinci babı ezberleyin.",
        kind: "MEMORIZE",
      }).expect(200);
    });

    it("sets a mark with its note, changes it, puts each change on the record and writes nothing for a save that changes nothing", async () => {
      const given = await mark(CAST.MUDERRIS, CAST.TALEBE, {
        status: "INCOMPLETE",
        note: "  Son iki satır eksik.  ",
      }).expect(200);
      expect(given.body).toMatchObject({
        lessonId,
        userId: CAST.TALEBE,
        status: "INCOMPLETE",
        note: "Son iki satır eksik.",
      });

      await mark(CAST.MUDERRIS, CAST.TALEBE, {
        status: "INCOMPLETE",
        note: "Son iki satır eksik.",
      }).expect(200);
      expect(await audits("assignment_evaluation.save")).toHaveLength(1);

      const changed = await mark(CAST.MUDERRIS, CAST.TALEBE, {
        status: "FULL",
      }).expect(200);
      expect(changed.body).toMatchObject({ status: "FULL", note: null });
      const saves = await audits("assignment_evaluation.save");
      expect(saves).toHaveLength(2);
      expect(saves.map((row) => row.details)).toContainEqual(
        expect.objectContaining({
          courseId: ids.courseId,
          lessonId,
          talebeId: CAST.TALEBE,
          status: { from: "INCOMPLETE", to: "FULL" },
          noteLength: 0,
        })
      );
      expect(await db().select().from(assignmentEvaluations)).toHaveLength(1);
    });

    it("refuses a status it does not know and a note over the limit", async () => {
      await mark(CAST.MUDERRIS, CAST.TALEBE, { status: "PENDING" }).expect(400);
      await mark(CAST.MUDERRIS, CAST.TALEBE, {
        status: "FULL",
        note: "a".repeat(281),
      }).expect(400);
    });

    it("lays out the board: seated talebe by name, recited homework in programme order, the marks and how many are full", async () => {
      const second = await insertLiveLesson(db(), ids.weekId, 1, {
        title: "Emsile, ikinci bab",
      });
      const fileOnly = await insertLiveLesson(db(), ids.weekId, 2);
      await setHomework(CAST.MUDERRIS, { kind: "MEMORIZE" }, second).expect(
        200
      );
      await setHomework(CAST.MUDERRIS, { kind: "FILE" }, fileOnly).expect(200);
      await mark(CAST.MUDERRIS, CAST.TALEBE, { status: "FULL" }).expect(200);
      await mark(CAST.SESSION, OTHER_TALEBE, { status: "ABSENT" }).expect(200);
      await mark(CAST.MUDERRIS, COMPLETED, {
        status: "FULL",
        note: "Güzel.",
      }).expect(200);

      const got = await board(CAST.MUDERRIS).expect(200);
      expect(got.headers["cache-control"]).toBe("private, no-store");
      expect(
        (got.body.columns as { lessonId: string }[]).map((c) => c.lessonId)
      ).toEqual([lessonId, second]);
      expect(got.body.columns[0]).toMatchObject({
        kind: "MEMORIZE",
        title: "Emsile, birinci bab",
        weekNumber: 1,
        description: "Birinci babı ezberleyin.",
        fullCount: 2,
      });
      expect(got.body.columns[1]).toMatchObject({ fullCount: 0 });
      // Seated only: the pending applicant and course B's talebe are not rows.
      expect(got.body.talebe).toEqual([
        { id: OTHER_TALEBE, name: "Ahmet Talebe" },
        { id: CAST.TALEBE, name: "Zeynep Talebe" },
        { id: COMPLETED, name: null },
      ]);
      expect(got.body.marks as IMarkBody[]).toHaveLength(3);
      expect(got.body.marks).toContainEqual(
        expect.objectContaining({
          lessonId,
          userId: COMPLETED,
          status: "FULL",
          note: "Güzel.",
        })
      );
    });

    it("opens the board and marks for a ders nazırı given session.manage, and for nobody without it", async () => {
      await board(CAST.SESSION).expect(200);
      await board(CAST.GROUP).expect(200);
      await mark(CAST.GROUP, CAST.TALEBE, { status: "FULL" }).expect(200);
      for (const sub of [CAST.EDIT, CAST.RECORDING, CAST.BARE, CAST.STRANGER]) {
        await board(sub).expect(403);
        await mark(sub, CAST.TALEBE, { status: "FULL" }).expect(403);
      }
    });

    it("keeps a müderris of another course out of this one's board and marks", async () => {
      await board(CAST.OTHER_COURSE).expect(403);
      await mark(CAST.OTHER_COURSE, CAST.TALEBE, { status: "ABSENT" }).expect(
        403
      );
      expect(await db().select().from(assignmentEvaluations)).toHaveLength(0);
    });

    it("lets no talebe mark anyone, themselves included, nor read the board", async () => {
      await mark(CAST.TALEBE, CAST.TALEBE, { status: "FULL" }).expect(403);
      await mark(CAST.TALEBE, OTHER_TALEBE, { status: "ABSENT" }).expect(403);
      await board(CAST.TALEBE).expect(403);
      expect(await db().select().from(assignmentEvaluations)).toHaveLength(0);
    });

    it("marks only a talebe seated in this course", async () => {
      for (const talebe of [CAST.PENDING, TALEBE_OF_B, CAST.STRANGER]) {
        const refused = await mark(CAST.MUDERRIS, talebe, {
          status: "FULL",
        }).expect(404);
        expect(refused.body.code).toBe("EVALUATION_TALEBE_NOT_FOUND");
      }
    });

    it("marks no session whose homework is handed in as files, or that has none", async () => {
      const bare = await insertLiveLesson(db(), ids.weekId, 1);
      const none = await mark(
        CAST.MUDERRIS,
        CAST.TALEBE,
        { status: "FULL" },
        bare
      ).expect(404);
      expect(none.body.code).toBe("MEMORIZATION_NOT_FOUND");
      await setHomework(CAST.MUDERRIS, { kind: "FILE" }, bare).expect(200);
      const files = await mark(
        CAST.MUDERRIS,
        CAST.TALEBE,
        { status: "FULL" },
        bare
      ).expect(404);
      expect(files.body.code).toBe("MEMORIZATION_NOT_FOUND");
    });

    it("takes the marks with the homework when it is taken off", async () => {
      await mark(CAST.MUDERRIS, CAST.TALEBE, { status: "FULL" }).expect(200);
      await http()
        .delete(`/lessons/${lessonId}/assignment`)
        .set("Authorization", bearer(CAST.MUDERRIS))
        .expect(204);
      expect(await db().select().from(assignmentEvaluations)).toHaveLength(0);
      const [removed] = await audits("lesson_assignment.delete");
      expect(removed.details).toMatchObject({
        kind: "MEMORIZE",
        evaluations: 1,
      });
    });
  });

  describe("the talebe's own mark", () => {
    beforeEach(async () => {
      await setHomework(CAST.MUDERRIS, { kind: "MEMORIZE" }).expect(200);
    });

    it("is Bekliyor until marked, then the mark and its note", async () => {
      const waiting = await own(CAST.TALEBE).expect(200);
      expect(waiting.body).toEqual({
        status: null,
        note: null,
        updatedAt: null,
      });
      expect(waiting.headers["cache-control"]).toBe("private, no-store");
      await mark(CAST.MUDERRIS, CAST.TALEBE, {
        status: "INCOMPLETE",
        note: "Tekrar dinleyelim.",
      }).expect(200);
      const marked = await own(CAST.TALEBE).expect(200);
      expect(marked.body).toMatchObject({
        status: "INCOMPLETE",
        note: "Tekrar dinleyelim.",
      });
    });

    it("never carries another talebe's mark", async () => {
      await mark(CAST.MUDERRIS, CAST.TALEBE, {
        status: "FULL",
        note: "Zeynep'e not.",
      }).expect(200);
      for (const sub of [OTHER_TALEBE, TALEBE_OF_B, CAST.STRANGER]) {
        const got = await own(sub).expect(200);
        expect(got.body).toEqual({ status: null, note: null, updatedAt: null });
      }
    });

    it("is not found on a session whose homework is handed in as files", async () => {
      await setHomework(CAST.MUDERRIS, { kind: "FILE" }).expect(200);
      const got = await own(CAST.TALEBE).expect(404);
      expect(got.body.code).toBe("MEMORIZATION_NOT_FOUND");
    });
  });
});
