import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../../src/course/domain/recording";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseResources,
  courses,
  lessonRecordings,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  madrasahSettings,
  madrasahs,
} from "../../src/database/schema/madrasah.schema";
import {
  bearerOf,
  CAST,
  type CastMember,
  type ICourseScopeIds,
  insertLiveLesson,
  seedCourseScope,
} from "../helpers/course-scope-cast";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

/**
 * MDRS-247 — what a caller holds in one course, and the two reads that follow
 * from it. `GET /courses/:id/my-permissions` is the engine's own computation, so
 * these specs pin it against the routes it describes: a code it lists is a code
 * the route accepts, and the caller of another course, the one with another
 * code, the talebe and the stranger are told (and refused) accordingly. The
 * recordings list and the course body are read by the same callers, because
 * `course.view_details` is derived from the course work a ders nazırı holds
 * (MDRS-135) and the screens rely on it.
 */

const MEETING = "https://zoom.us/j/55501";
const RECORDING_URL = "https://drive.google.com/file/d/enrolled/view";
const PUBLIC_URL = "https://www.youtube.com/watch?v=public1";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

describe("what a caller holds in a course (MDRS-247, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let enrolledLessonId: string;
  let publicLessonId: string;
  let enrolledRecordingId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const mine = (sub: CastMember, id = ids.courseId) =>
    http()
      .get(`/courses/${id}/my-permissions`)
      .set("Authorization", bearerOf(sub));
  const course = (sub: CastMember) =>
    http().get(`/courses/${ids.courseId}`).set("Authorization", bearerOf(sub));
  const recordings = (sub: CastMember) =>
    http()
      .get(`/courses/${ids.courseId}/recordings`)
      .set("Authorization", bearerOf(sub));

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    ids = await seedCourseScope(db());
    enrolledLessonId = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Bir",
      meetingUrl: MEETING,
      agenda: [{ time: "00:00", title: "Giriş" }],
      kaynak: "Emsile, 1. bab",
    });
    publicLessonId = await insertLiveLesson(db(), ids.weekId, 1, {
      title: "İki",
    });
    const [enrolled] = await db()
      .insert(lessonRecordings)
      .values([
        {
          lessonId: enrolledLessonId,
          title: "Bir: kayıt",
          provider: RecordingProvider.DRIVE,
          url: RECORDING_URL,
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.READY,
        },
        {
          lessonId: publicLessonId,
          title: "İki: kayıt",
          provider: RecordingProvider.YOUTUBE,
          url: PUBLIC_URL,
          visibility: RecordingVisibility.PUBLIC,
          status: RecordingStatus.READY,
        },
      ])
      .returning();
    enrolledRecordingId = enrolled.id;
    await db().insert(courseResources).values({
      courseId: ids.courseId,
      name: "Emsile PDF",
      type: "pdf",
      url: "https://example.org/emsile.pdf",
      orderIndex: 0,
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("GET /courses/:id/my-permissions", () => {
    const codesOf = async (sub: CastMember, id = ids.courseId) =>
      (await mine(sub, id).expect(200)).body.permissions as string[];

    it("lists a ders nazırı's one grant with what any signed-in caller holds, and what that grant opens", async () => {
      const res = await mine(CAST.RECORDING).expect(200);
      expect(res.body).toEqual({
        // `course.view_details` comes with the course work, as on the routes
        permissions: [
          "course.enroll",
          "course.view",
          "course.view_details",
          "recording.manage",
        ],
        staffRead: false,
      });
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });

    it("lists each ders nazırı's own codes and no one else's", async () => {
      expect(await codesOf(CAST.EDIT)).toEqual([
        "course.edit",
        "course.enroll",
        "course.view",
        "course.view_details",
      ]);
      expect(await codesOf(CAST.SESSION)).toEqual([
        "course.enroll",
        "course.view",
        "course.view_details",
        "session.manage",
      ]);
      expect(await codesOf(CAST.EDIT_AND_SESSION)).toEqual([
        "course.edit",
        "course.enroll",
        "course.view",
        "course.view_details",
        "session.manage",
      ]);
    });

    it("tells whoever decides on talebe that they may read the talebe, and nobody else", async () => {
      const roster = await mine(CAST.ROSTER).expect(200);
      expect(roster.body.staffRead).toBe(true);
      expect(roster.body.permissions).toEqual(
        expect.arrayContaining([
          "course.staff_read",
          "course.view_details",
          "enrollment.decide",
        ])
      );
      for (const sub of [
        CAST.RECORDING,
        CAST.EDIT,
        CAST.WEEK_HIDE,
        CAST.BARE,
        CAST.TALEBE,
        CAST.STRANGER,
      ]) {
        expect((await mine(sub).expect(200)).body.staffRead).toBe(false);
      }
    });

    it("lists a group's codes, and nothing for a grant that has lapsed", async () => {
      expect(await codesOf(CAST.GROUP)).toEqual(
        expect.arrayContaining(["recording.manage", "session.manage"])
      );
      expect(await codesOf(CAST.LAPSED)).toEqual([
        "course.enroll",
        "course.view",
      ]);
    });

    it("lists nothing beyond the public page for a ders nazırı with no grant, a stranger and a pending talebe", async () => {
      for (const sub of [CAST.BARE, CAST.STRANGER, CAST.PENDING]) {
        expect(await codesOf(sub)).toEqual(["course.enroll", "course.view"]);
      }
    });

    it("lists the content the enrolled talebe reads, and no staff code", async () => {
      expect(await codesOf(CAST.TALEBE)).toEqual([
        "course.enroll",
        "course.view",
        "course.view_details",
      ]);
    });

    it("does not carry a code held in another course over to this one", async () => {
      expect(await codesOf(CAST.OTHER_COURSE)).toEqual([
        "course.enroll",
        "course.view",
      ]);
      expect(await codesOf(CAST.OTHER_COURSE, ids.otherCourseId)).toEqual(
        expect.arrayContaining([
          "course.edit",
          "recording.manage",
          "session.manage",
        ])
      );
      // and the ders nazırı of this course holds nothing in the other one
      expect(await codesOf(CAST.RECORDING, ids.otherCourseId)).toEqual([
        "course.enroll",
        "course.view",
      ]);
    });

    it("lists every course code for the müderris, and the köşk's own for its nazım", async () => {
      const muderris = await mine(CAST.MUDERRIS).expect(200);
      expect(muderris.body.staffRead).toBe(true);
      expect(muderris.body.permissions).toEqual(
        expect.arrayContaining([
          "course.edit",
          "session.manage",
          "session.live_link",
          "enrollment.decide",
          "enrollment.remove",
          "enrollment.complete",
          "recording.manage",
          "course.staff_read",
        ])
      );
      expect(muderris.body.permissions).not.toContain("course.open_standalone");
      expect(muderris.body.permissions).not.toContain("course.delete");

      const manager = await mine(CAST.MANAGER).expect(200);
      expect(manager.body.permissions).toEqual(
        expect.arrayContaining([
          "course.edit",
          "recording.manage",
          "course.open_standalone",
          "course.hide",
        ])
      );
    });

    it("lists the settings abilities a müderris holds, and drops the one a policy closes", async () => {
      // What nazar's Ders ayarları draws its locks from (MDRS-270): the
      // derived abilities ride on course.settings, and a policy above the
      // course closes the one it names, and only that one.
      expect(await codesOf(CAST.MUDERRIS)).toEqual(
        expect.arrayContaining([
          "course.settings",
          "setting.approval_off",
          "setting.course_open",
          "course_nazir.assign",
          "permission.grant",
        ])
      );

      await db()
        .update(kosks)
        .set({ alwaysRequireApproval: true })
        .where(eq(kosks.id, ids.koskId));
      const underKosk = await codesOf(CAST.MUDERRIS);
      expect(underKosk).not.toContain("setting.approval_off");
      expect(underKosk).toEqual(
        expect.arrayContaining(["course.settings", "setting.course_open"])
      );

      await db()
        .update(kosks)
        .set({ alwaysRequireApproval: false })
        .where(eq(kosks.id, ids.koskId));
      const [madrasah] = await db()
        .insert(madrasahs)
        .values({
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: CAST.ADMIN,
        })
        .returning();
      await db().insert(madrasahSettings).values({
        madrasahId: madrasah.id,
        policyClosedCourseRequired: true,
        updatedBy: CAST.ADMIN,
      });
      await db()
        .update(courses)
        .set({ madrasahId: madrasah.id })
        .where(eq(courses.id, ids.courseId));
      const underMedrese = await codesOf(CAST.MUDERRIS);
      expect(underMedrese).not.toContain("setting.course_open");
      expect(underMedrese).toEqual(
        expect.arrayContaining(["course.settings", "setting.approval_off"])
      );
    });

    it("lists every course code for the başnazım, delete included", async () => {
      const res = await mine(CAST.ADMIN).expect(200);
      expect(res.body.staffRead).toBe(true);
      expect(res.body.permissions).toEqual(
        expect.arrayContaining([
          "course.delete",
          "course.edit",
          "recording.manage",
          "session.manage",
          "enrollment.decide",
        ])
      );
      // sorted, and nothing that is not a course's
      expect(res.body.permissions).toEqual([...res.body.permissions].sort());
      expect(res.body.permissions).not.toContain("kosk.manage");
      expect(res.body.permissions).not.toContain("platform.audit_read");
    });

    it("lists the köşk and medrese codes the başnazım passes on a course's routes", async () => {
      // hide and restore ask course.hide / madrasah.course_hide, and the
      // müderris list asks course.open_standalone / madrasah.muderris_manage;
      // the realm bypass passes all four, and the köşk nazım is listed the köşk ones
      const admin = await codesOf(CAST.ADMIN);
      expect(admin).toEqual(
        expect.arrayContaining([
          "course.hide",
          "madrasah.course_hide",
          "course.open_standalone",
          "madrasah.muderris_manage",
        ])
      );
      expect(await codesOf(CAST.MANAGER)).toEqual(
        expect.arrayContaining(["course.hide", "course.open_standalone"])
      );
    });

    it("agrees with the route it describes: recording.manage is listed exactly for those a recording write accepts", async () => {
      const callers: CastMember[] = [
        CAST.RECORDING,
        CAST.GROUP,
        CAST.MUDERRIS,
        CAST.MANAGER,
        CAST.ADMIN,
        CAST.EDIT,
        CAST.SESSION,
        CAST.WEEK_HIDE,
        CAST.BARE,
        CAST.LAPSED,
        CAST.OTHER_COURSE,
        CAST.TALEBE,
        CAST.PENDING,
        CAST.STRANGER,
      ];
      for (const sub of callers) {
        const listed = (await codesOf(sub)).includes("recording.manage");
        const res = await http()
          .patch(`/recordings/${enrolledRecordingId}`)
          .set("Authorization", bearerOf(sub))
          .send({ title: `Kayıt (${sub.slice(-2)})` });
        expect([sub, res.status !== 403]).toEqual([sub, listed]);
        expect([sub, res.status === 200]).toEqual([sub, listed]);
      }
    });

    it("agrees with the route on course.edit and session.manage too", async () => {
      const weekPatch = (sub: CastMember) =>
        http()
          .post(`/lessons/${publicLessonId}/cancel`)
          .set("Authorization", bearerOf(sub))
          // an out-of-date version: a caller who is let in is told 409, never 403
          .send({ version: 999 });
      const editPatch = (sub: CastMember) =>
        http()
          .patch(`/courses/${ids.courseId}`)
          .set("Authorization", bearerOf(sub))
          .send({ subtitle: "Alt başlık" });
      for (const sub of [
        CAST.EDIT,
        CAST.SESSION,
        CAST.EDIT_AND_SESSION,
        CAST.RECORDING,
        CAST.BARE,
        CAST.OTHER_COURSE,
        CAST.TALEBE,
        CAST.STRANGER,
      ]) {
        const codes = await codesOf(sub);
        expect([sub, (await editPatch(sub)).status !== 403]).toEqual([
          sub,
          codes.includes("course.edit"),
        ]);
        expect([sub, (await weekPatch(sub)).status !== 403]).toEqual([
          sub,
          codes.includes("session.manage"),
        ]);
      }
    });

    it("answers about the caller, whoever else holds more", async () => {
      // the same course, two tokens: each is told its own codes
      const [a, b] = await Promise.all([mine(CAST.MUDERRIS), mine(CAST.BARE)]);
      expect(a.body.permissions.length).toBeGreaterThan(
        b.body.permissions.length
      );
      expect(b.body.permissions).toEqual(["course.enroll", "course.view"]);
    });

    it("is 404 for a course that is not there, a malformed id, and a draft or hidden course the caller may not see", async () => {
      await mine(CAST.MUDERRIS, ABSENT_ID).expect(404);
      await mine(CAST.ADMIN, ABSENT_ID).expect(404);
      await mine(CAST.STRANGER, "not-a-uuid").expect(404);

      await db()
        .update(courses)
        .set({ status: CourseStatus.DRAFT })
        .where(eq(courses.id, ids.courseId));
      await mine(CAST.STRANGER).expect(404);
      await mine(CAST.TALEBE).expect(404);
      await mine(CAST.BARE).expect(404);
      await mine(CAST.EDIT).expect(200);
      await mine(CAST.MUDERRIS).expect(200);

      await db()
        .update(courses)
        .set({
          status: CourseStatus.PUBLISHED,
          archivedAt: new Date(),
          archivedBy: CAST.MANAGER,
        })
        .where(eq(courses.id, ids.courseId));
      await mine(CAST.STRANGER).expect(404);
      await mine(CAST.EDIT).expect(404);
      await mine(CAST.MANAGER).expect(200);
    });

    it("needs a token", async () => {
      await http().get(`/courses/${ids.courseId}/my-permissions`).expect(401);
      await http()
        .get(`/courses/${ids.courseId}/my-permissions`)
        .set("Authorization", "Bearer garbage")
        .expect(401);
    });

    it("writes nothing to the audit log", async () => {
      for (const sub of [CAST.RECORDING, CAST.STRANGER, CAST.ADMIN]) {
        await mine(sub).expect(200);
      }
      expect(await db().select().from(auditLog)).toHaveLength(0);
    });
  });

  describe("GET /courses/:id/recordings (a holder of recording.manage lists them all)", () => {
    const titlesOf = async (sub: CastMember) =>
      ((await recordings(sub).expect(200)).body as { title: string }[])
        .map((r) => r.title)
        .sort();
    const both = ["Bir: kayıt", "İki: kayıt"];
    const publicOnly = ["İki: kayıt"];

    it("lists an ENROLLED recording to a ders nazırı holding recording.manage, by grant and by group", async () => {
      expect(await titlesOf(CAST.RECORDING)).toEqual(both);
      expect(await titlesOf(CAST.GROUP)).toEqual(both);
      const res = await recordings(CAST.RECORDING).expect(200);
      expect(res.body).toContainEqual(
        expect.objectContaining({
          id: enrolledRecordingId,
          lessonId: enrolledLessonId,
          url: RECORDING_URL,
          visibility: "ENROLLED",
        })
      );
    });

    it("lists them all to the müderris, the köşk nazım, the başnazım and the enrolled talebe, as before", async () => {
      for (const sub of [
        CAST.MUDERRIS,
        CAST.MANAGER,
        CAST.ADMIN,
        CAST.TALEBE,
      ]) {
        expect([sub, await titlesOf(sub)]).toEqual([sub, both]);
      }
    });

    it("lists only the PUBLIC one to everyone else, unchanged", async () => {
      for (const sub of [
        // recording.manage in another course, a lapsed grant, no grant, an
        // unrelated grant, a pending talebe, a stranger
        CAST.OTHER_COURSE,
        CAST.LAPSED,
        CAST.BARE,
        CAST.WEEK_HIDE,
        CAST.PENDING,
        CAST.STRANGER,
      ]) {
        expect([sub, await titlesOf(sub)]).toEqual([sub, publicOnly]);
      }
      const visitor = await http()
        .get(`/courses/${ids.courseId}/recordings`)
        .expect(200);
      expect(visitor.body.map((r: { title: string }) => r.title)).toEqual(
        publicOnly
      );
    });

    it("leaves the one recording a session may hold in view, so an add is not offered over it", async () => {
      // The page offers "Kayıt ekle" to a session the list shows no recording
      // for; a holder of recording.manage must see it, or the add answers 409.
      const shown = (await recordings(CAST.RECORDING).expect(200)).body;
      expect(shown.map((r: { lessonId: string }) => r.lessonId)).toContain(
        enrolledLessonId
      );
      await http()
        .post(`/lessons/${enrolledLessonId}/recordings`)
        .set("Authorization", bearerOf(CAST.RECORDING))
        .send({ title: "Yine", url: RECORDING_URL })
        .expect(409);
    });
  });

  describe("GET /courses/:id (the content an editor needs to save the course whole)", () => {
    const lessonOf = (body: { weeks: { lessons: { id: string }[] }[] }) =>
      body.weeks
        .flatMap((w) => w.lessons)
        .find((l) => l.id === enrolledLessonId);

    it.each([
      ["course.edit", CAST.EDIT],
      ["session.manage", CAST.SESSION],
      ["both", CAST.EDIT_AND_SESSION],
      ["a group naming session.manage", CAST.GROUP],
      ["recording.manage", CAST.RECORDING],
    ])("sends links, agendas and resource urls to a ders nazırı holding %s", async (_name, sub) => {
      const res = await course(sub).expect(200);
      expect(res.body.contentLocked).toBe(false);
      expect(lessonOf(res.body)).toMatchObject({
        meetingUrl: MEETING,
        agenda: [{ time: "00:00", title: "Giriş" }],
        kaynak: "Emsile, 1. bab",
      });
      expect(res.body.resources[0].url).toBe("https://example.org/emsile.pdf");
    });

    it.each([
      ["a ders nazırı with an unrelated grant", CAST.WEEK_HIDE],
      ["a ders nazırı with no grant", CAST.BARE],
      ["a ders nazırı whose grant has lapsed", CAST.LAPSED],
      [
        "a ders nazırı of another course holding the same codes",
        CAST.OTHER_COURSE,
      ],
      ["a pending talebe", CAST.PENDING],
      ["a stranger", CAST.STRANGER],
    ])("leaves them out for %s: view_details is not widened", async (_name, sub) => {
      const res = await course(sub).expect(200);
      expect(res.body.contentLocked).toBe(true);
      const lesson = lessonOf(res.body);
      expect(lesson).toBeDefined();
      expect(lesson).not.toHaveProperty("meetingUrl");
      expect(lesson).not.toHaveProperty("agenda");
      expect(lesson).not.toHaveProperty("kaynak");
      expect(res.body.resources[0]).not.toHaveProperty("url");
    });

    it("still gives the enrolled talebe, the müderris, the köşk nazım and the başnazım the content", async () => {
      for (const sub of [
        CAST.TALEBE,
        CAST.MUDERRIS,
        CAST.MANAGER,
        CAST.ADMIN,
      ]) {
        const res = await course(sub).expect(200);
        expect([sub, res.body.contentLocked]).toEqual([sub, false]);
        expect(lessonOf(res.body)).toMatchObject({ meetingUrl: MEETING });
      }
    });
  });
});
