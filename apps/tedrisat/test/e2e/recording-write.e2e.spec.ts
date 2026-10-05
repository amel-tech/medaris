import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { embedViewToken } from "../../src/bunny-stream/bunny-signature";
import {
  BUNNY_STREAM_CONFIG,
  BUNNY_STREAM_FETCH,
} from "../../src/bunny-stream/bunny-stream.client";
import type { IBunnyStreamConfig } from "../../src/config/bunny-stream-env";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../../src/course/domain/recording";
import { RecordingEncodingPoller } from "../../src/course/recording-encoding.poller";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  enrollments,
  lessonRecordings,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-247 — `POST /lessons/:id/recordings` and `PATCH /recordings/:id`: the
 * course staff paste a recording link, then rename it, replace the link or
 * change who may watch. The read side is `GET /courses/:id/recordings`
 * (MDRS-162, `recordings.e2e.spec.ts`); how a link is read is unit-tested
 * (`test/unit/course/recording-link.spec.ts`). This covers the guard, the
 * permission `recording.manage` for every way it is held, the lesson's state,
 * the audit rows, the round trip to the talebe, and a pasted Bunny link: one
 * app runs with a Bunny library configured (its transport a stub that must
 * never be called: a pasted link asks nothing of Bunny), the other with none.
 */

const MANAGER_ID = "e2470000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e2470000-0000-4000-8000-000000000002";
const NAZIR_ID = "e2470000-0000-4000-8000-000000000003";
const OTHER_NAZIR_ID = "e2470000-0000-4000-8000-000000000004";
const GROUP_NAZIR_ID = "e2470000-0000-4000-8000-000000000005";
const EXPIRED_NAZIR_ID = "e2470000-0000-4000-8000-000000000006";
const TALEBE_ID = "e2470000-0000-4000-8000-000000000007";
const STRANGER_ID = "e2470000-0000-4000-8000-000000000008";
const ADMIN_ID = "e2470000-0000-4000-8000-000000000009";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const ZOOM = "https://us02web.zoom.us/rec/share/abc123";
const DRIVE = "https://drive.google.com/file/d/xyz/view";
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const LIBRARY: IBunnyStreamConfig = {
  libraryId: "424242",
  apiKey: "e2e-library-api-key",
  tokenKey: "e2e-token-key",
  embedLifetimeSeconds: 6 * 3600,
};
const VIDEO = "b2470000-0000-4000-8000-000000000001";
const OTHER_VIDEO = "b2470000-0000-4000-8000-000000000002";
/** A player link of a video in a library, as Bunny's dashboard copies it. */
const bunnyLink = (video: string, library = LIBRARY.libraryId) =>
  `https://player.mediadelivery.net/embed/${library}/${video}?autoplay=false`;
const PLAYER = new RegExp(
  `^https://player\\.mediadelivery\\.net/embed/${LIBRARY.libraryId}/([0-9a-f-]{36})\\?token=([0-9a-f]{64})&expires=(\\d+)$`
);

/** Checks a player link signed for `video` with the library's token key. */
function expectSigned(url: unknown, video: string) {
  const match = PLAYER.exec(String(url));
  expect(match, `not a signed player link: ${url}`).not.toBeNull();
  const [, id, token, expires] = match as RegExpExecArray;
  expect(id).toBe(video);
  expect(Number(expires)).toBeGreaterThan(Date.now() / 1000);
  expect(token).toBe(
    embedViewToken(LIBRARY.tokenKey ?? "", video, Number(expires))
  );
}

describe("a session's recording link (MDRS-247, e2e)", () => {
  let app: INestApplication;
  /** The same API with a Bunny library configured. */
  let library: INestApplication;
  const bunnyCalls: string[] = [];
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let otherCourseId: string;
  let lessonId: string;
  let secondLessonId: string;
  let thirdLessonId: string;
  let cancelledLessonId: string;
  let archivedLessonId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) =>
    sub === ADMIN_ID
      ? bearerFor({
          sub,
          claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
        })
      : bearerFor({ sub });

  const add = (id: string, sub: string, body: unknown, target = app) =>
    request(target.getHttpServer())
      .post(`/lessons/${id}/recordings`)
      .set("Authorization", as(sub))
      .send(body as object);

  const change = (id: string, sub: string, body: unknown, target = app) =>
    request(target.getHttpServer())
      .patch(`/recordings/${id}`)
      .set("Authorization", as(sub))
      .send(body as object);

  const stored = (id: string) =>
    db().select().from(lessonRecordings).where(eq(lessonRecordings.id, id));

  const recordingRows = () => db().select().from(lessonRecordings);

  const recordingOf = async (lesson: string) =>
    (
      await db()
        .select()
        .from(lessonRecordings)
        .where(eq(lessonRecordings.lessonId, lesson))
    )[0];

  /** A Bunny upload of the session (MDRS-116) in the state given, written as the upload route writes it. */
  const bunnyUpload = async (
    lesson: string,
    status: RecordingStatus,
    video = OTHER_VIDEO
  ) =>
    (
      await db()
        .insert(lessonRecordings)
        .values({
          lessonId: lesson,
          title: "Yükleme",
          provider: RecordingProvider.BUNNY,
          url: null,
          bunnyVideoId: video,
          uploadExpiresAt: new Date(Date.now() - 3_600_000),
          visibility: RecordingVisibility.ENROLLED,
          status,
        })
        .returning()
    )[0];

  const auditRows = (entityId?: string) =>
    db()
      .select()
      .from(auditLog)
      .where(
        entityId
          ? and(
              eq(auditLog.entity, "lesson_recording"),
              eq(auditLog.entityId, entityId)
            )
          : eq(auditLog.entity, "lesson_recording")
      )
      .orderBy(auditLog.seq);

  const courseVersion = async () =>
    (
      await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId))
    )[0]?.version;

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp();
    library = await createTestApp({
      overrides: [
        { provide: BUNNY_STREAM_CONFIG, useValue: LIBRARY },
        {
          provide: BUNNY_STREAM_FETCH,
          useValue: async (input: string | URL | Request) => {
            bunnyCalls.push(String(input));
            return new Response("{}", { status: 404 });
          },
        },
      ],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    bunnyCalls.length = 0;
    await clean();
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
    });
    const [course, other] = await db()
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Başka ders",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    courseId = course.id;
    otherCourseId = other.id;
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
    });
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Emsile", orderIndex: 0 })
      .returning();
    const base = {
      weekId: week.id,
      type: LessonType.LIVE,
      durationMinutes: 60,
    };
    [
      { id: lessonId },
      { id: secondLessonId },
      { id: thirdLessonId },
      { id: cancelledLessonId },
      { id: archivedLessonId },
    ] = await db()
      .insert(lessons)
      .values([
        {
          ...base,
          orderIndex: 0,
          title: "Bir",
          scheduledAt: new Date(Date.now() - 48 * 3_600_000),
        },
        {
          ...base,
          orderIndex: 1,
          title: "İki",
          scheduledAt: new Date(Date.now() - 24 * 3_600_000),
        },
        { ...base, orderIndex: 2, title: "Üç" },
        {
          ...base,
          orderIndex: 3,
          title: "İptal",
          scheduledAt: new Date(Date.now() + 48 * 3_600_000),
          cancelledAt: new Date(),
        },
        {
          ...base,
          orderIndex: 4,
          title: "Arşiv",
          scheduledAt: new Date(Date.now() - 72 * 3_600_000),
          archivedAt: new Date(),
        },
      ])
      .returning();

    // Ders nazırları (MDRS-172): the post, and what they were given with it.
    for (const id of [
      NAZIR_ID,
      OTHER_NAZIR_ID,
      GROUP_NAZIR_ID,
      EXPIRED_NAZIR_ID,
    ]) {
      await assignRole(db(), {
        userId: id,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: MANAGER_ID,
      });
    }
    const [group] = await db()
      .insert(permissionGroups)
      .values({
        scopeType: "course",
        scopeId: courseId,
        name: "Kayıtlar",
        createdBy: MUDERRIS_ID,
      })
      .returning();
    await db()
      .insert(permissionGroupItems)
      .values([
        { groupId: group.id, permission: "recording.manage" },
        { groupId: group.id, permission: "session.manage" },
      ]);
    const grant = { scopeType: "course" as const, grantedBy: MANAGER_ID };
    await db()
      .insert(permissionGrants)
      .values([
        {
          ...grant,
          userId: NAZIR_ID,
          scopeId: courseId,
          permission: "recording.manage",
        },
        {
          ...grant,
          userId: OTHER_NAZIR_ID,
          scopeId: courseId,
          permission: "session.live_link",
        },
        {
          ...grant,
          userId: GROUP_NAZIR_ID,
          scopeId: courseId,
          groupId: group.id,
        },
        {
          ...grant,
          userId: EXPIRED_NAZIR_ID,
          scopeId: courseId,
          permission: "recording.manage",
          expiresAt: new Date(Date.now() - 60_000),
        },
      ]);

    await db().insert(enrollments).values({
      userId: TALEBE_ID,
      courseId,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  afterAll(async () => {
    await clean();
    await library.close();
    await app.close();
  });

  describe("POST /lessons/:id/recordings", () => {
    it("stores a pasted link READY, reads its provider off the host, and audits it", async () => {
      const before = await courseVersion();
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Bir: celse kaydı",
        url: DRIVE,
      }).expect(201);
      expect(res.body).toMatchObject({
        lessonId,
        title: "Bir: celse kaydı",
        provider: RecordingProvider.DRIVE,
        url: DRIVE,
        // visibility is the closed one unless it is asked for
        visibility: RecordingVisibility.ENROLLED,
        status: RecordingStatus.READY,
        weekNumber: 1,
        weekTitle: "Emsile",
        durationMinutes: 60,
      });
      const [row] = await stored(res.body.id);
      expect(row).toMatchObject({
        lessonId,
        provider: RecordingProvider.DRIVE,
        status: RecordingStatus.READY,
      });
      expect(await courseVersion()).toBe(before);

      const [entry] = await auditRows(res.body.id);
      expect(entry).toMatchObject({
        actorId: MUDERRIS_ID,
        action: "recording.add",
        details: {
          courseId,
          lessonId,
          provider: RecordingProvider.DRIVE,
          visibility: RecordingVisibility.ENROLLED,
          url: DRIVE,
        },
      });
    });

    it("reads Zoom and every other host as OTHER, and trims the title and the link", async () => {
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "  Zoom kaydı  ",
        url: `  ${ZOOM}  `,
      }).expect(201);
      expect(res.body).toMatchObject({
        title: "Zoom kaydı",
        url: ZOOM,
        provider: RecordingProvider.OTHER,
      });
    });

    it("takes a YouTube link that is not public, and stores it as its watch link (MDRS-114 AC4)", async () => {
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "YouTube",
        url: "https://youtu.be/dQw4w9WgXcQ?si=tracking",
      }).expect(201);
      expect(res.body).toMatchObject({
        provider: RecordingProvider.YOUTUBE,
        url: YOUTUBE,
        visibility: RecordingVisibility.ENROLLED,
        status: RecordingStatus.READY,
      });
      expect(await recordingOf(lessonId)).toMatchObject({
        provider: RecordingProvider.YOUTUBE,
        url: YOUTUBE,
        visibility: RecordingVisibility.ENROLLED,
      });

      const talebe = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(talebe.body[0]).toMatchObject({ url: YOUTUBE });
    });

    it.each([
      [
        "a YouTube page that names no video",
        "https://www.youtube.com/@medaris",
        "youtube-no-video",
      ],
      [
        "a Bunny host that is not a player",
        `https://vz-abc.b-cdn.net/${VIDEO}/play_720p.mp4`,
        "bunny-no-video",
      ],
    ])("refuses %s with 400 RECORDING_LINK_INVALID, writing nothing", async (_name, url, reason) => {
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url,
      }).expect(400);
      expect(res.body).toMatchObject({
        code: "RECORDING_LINK_INVALID",
        context: { reason },
      });
      expect(await recordingRows()).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);
    });

    it("gives the enrolled talebe the link, and a stranger none while it is ENROLLED", async () => {
      await add(lessonId, MUDERRIS_ID, { title: "Kayıt", url: ZOOM }).expect(
        201
      );
      const talebe = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(talebe.body).toHaveLength(1);
      expect(talebe.body[0]).toMatchObject({ url: ZOOM, status: "READY" });

      const stranger = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(STRANGER_ID))
        .expect(200);
      expect(stranger.body).toEqual([]);
    });

    it.each([
      ["a missing title", { url: ZOOM }],
      ["an empty title", { title: "   ", url: ZOOM }],
      ["a title over 200 characters", { title: "a".repeat(201), url: ZOOM }],
      ["a missing link", { title: "Kayıt" }],
      ["a plain http link", { title: "Kayıt", url: "http://zoom.us/rec/1" }],
      ["not a link", { title: "Kayıt", url: "kayit" }],
      [
        "a link over 500 characters",
        { title: "Kayıt", url: `https://zoom.us/${"a".repeat(500)}` },
      ],
      ["another visibility", { title: "Kayıt", url: ZOOM, visibility: "ALL" }],
    ])("refuses %s with 400", async (_name, body) => {
      await add(lessonId, MUDERRIS_ID, body).expect(400);
      expect(await recordingRows()).toHaveLength(0);
    });

    it.each([
      ["a ders nazırı given recording.manage", NAZIR_ID],
      ["a ders nazırı given a group that names it", GROUP_NAZIR_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["the başnazım", ADMIN_ID],
    ])("lets %s add one", async (_name, sub) => {
      await add(secondLessonId, sub, { title: "Kayıt", url: ZOOM }).expect(201);
      expect(await recordingRows()).toHaveLength(1);
    });

    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["a stranger", STRANGER_ID],
      ["a ders nazırı given only another permission", OTHER_NAZIR_ID],
      ["a ders nazırı whose grant has lapsed", EXPIRED_NAZIR_ID],
    ])("refuses %s with 403, before the link is read", async (_name, sub) => {
      for (const body of [
        { title: "Kayıt", url: ZOOM },
        { title: "Kayıt", url: "https://www.youtube.com/@medaris" },
      ]) {
        const res = await add(lessonId, sub, body).expect(403);
        expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      }
      expect(await recordingRows()).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);
    });

    it("keeps the one recording a session has: 409 RECORDING_EXISTS names it", async () => {
      const first = await add(lessonId, MUDERRIS_ID, {
        title: "Birinci",
        url: ZOOM,
      }).expect(201);
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "İkinci",
        url: DRIVE,
      }).expect(409);
      expect(res.body.code).toBe("RECORDING_EXISTS");
      expect(res.body.context).toEqual({
        lessonId,
        recordingId: first.body.id,
      });
      expect(await recordingRows()).toHaveLength(1);
    });

    it("refuses a cancelled session with 409 LESSON_CANCELLED", async () => {
      const res = await add(cancelledLessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url: ZOOM,
      }).expect(409);
      expect(res.body.code).toBe("LESSON_CANCELLED");
      expect(await recordingRows()).toHaveLength(0);
    });

    it("answers 404 for a lesson that is archived or not there", async () => {
      for (const id of [archivedLessonId, ABSENT_ID, "not-a-uuid"]) {
        const res = await add(id, MUDERRIS_ID, {
          title: "Kayıt",
          url: ZOOM,
        }).expect(404);
        expect(res.body.code).toBe("LESSON_NOT_FOUND");
      }
    });

    it("takes a session with no time set, and dates the recording now", async () => {
      const res = await add(thirdLessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url: ZOOM,
      }).expect(201);
      expect(res.body.recordedAt).not.toBeNull();
    });

    it("needs a token", async () => {
      await http()
        .post(`/lessons/${lessonId}/recordings`)
        .send({ title: "Kayıt", url: ZOOM })
        .expect(401);
    });
  });

  describe("PATCH /recordings/:id", () => {
    let recordingId: string;

    beforeEach(async () => {
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url: ZOOM,
      }).expect(201);
      recordingId = res.body.id;
    });

    it("renames a recording and leaves the rest alone", async () => {
      const res = await change(recordingId, MUDERRIS_ID, {
        title: "Birinci celse",
      }).expect(200);
      expect(res.body).toMatchObject({
        id: recordingId,
        title: "Birinci celse",
        url: ZOOM,
        visibility: RecordingVisibility.ENROLLED,
        provider: RecordingProvider.OTHER,
      });
    });

    it("opens a recording to everyone and closes it again, each change audited", async () => {
      await change(recordingId, MUDERRIS_ID, { visibility: "PUBLIC" }).expect(
        200
      );
      const visitor = await http()
        .get(`/courses/${courseId}/recordings`)
        .expect(200);
      expect(visitor.body.map((r: { id: string }) => r.id)).toEqual([
        recordingId,
      ]);

      await change(recordingId, MUDERRIS_ID, { visibility: "ENROLLED" }).expect(
        200
      );
      const closed = await http()
        .get(`/courses/${courseId}/recordings`)
        .expect(200);
      expect(closed.body).toEqual([]);

      const rows = await auditRows(recordingId);
      expect(rows.map((r) => r.action)).toEqual([
        "recording.add",
        "recording.update",
        "recording.update",
      ]);
      expect(rows[1]?.details).toMatchObject({
        courseId,
        previous: { visibility: "ENROLLED" },
        next: { visibility: "PUBLIC" },
      });
    });

    it("reads the provider again when the link is replaced", async () => {
      const res = await change(recordingId, MUDERRIS_ID, {
        url: DRIVE,
      }).expect(200);
      expect(res.body).toMatchObject({
        url: DRIVE,
        provider: RecordingProvider.DRIVE,
        status: RecordingStatus.READY,
      });
    });

    it("moves a recording to YouTube while it stays ENROLLED, and takes a public one back to ENROLLED", async () => {
      const moved = await change(recordingId, MUDERRIS_ID, {
        url: "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
      }).expect(200);
      expect(moved.body).toMatchObject({
        provider: RecordingProvider.YOUTUBE,
        url: YOUTUBE,
        visibility: RecordingVisibility.ENROLLED,
      });

      await change(recordingId, MUDERRIS_ID, { visibility: "PUBLIC" }).expect(
        200
      );
      await change(recordingId, MUDERRIS_ID, {
        visibility: "ENROLLED",
      }).expect(200);
      expect((await stored(recordingId))[0]).toMatchObject({
        provider: RecordingProvider.YOUTUBE,
        url: YOUTUBE,
        visibility: RecordingVisibility.ENROLLED,
      });
    });

    it("refuses a new link that cannot be stored with 400 RECORDING_LINK_INVALID, and keeps the old one", async () => {
      const res = await change(recordingId, MUDERRIS_ID, {
        url: "https://www.youtube.com/playlist?list=PL1234567",
      }).expect(400);
      expect(res.body).toMatchObject({
        code: "RECORDING_LINK_INVALID",
        context: { reason: "youtube-no-video" },
      });
      expect((await stored(recordingId))[0]).toMatchObject({
        provider: RecordingProvider.OTHER,
        url: ZOOM,
      });
      expect((await auditRows(recordingId)).map((r) => r.action)).toEqual([
        "recording.add",
      ]);
    });

    it.each([
      ["a null title", { title: null }],
      ["an empty title", { title: "  " }],
      ["a null link", { url: null }],
      ["a plain http link", { url: "http://zoom.us/rec/1" }],
      ["a null visibility", { visibility: null }],
      ["another visibility", { visibility: "ALL" }],
    ])("refuses %s with 400", async (_name, body) => {
      await change(recordingId, MUDERRIS_ID, body).expect(400);
      const [row] = await stored(recordingId);
      expect(row).toMatchObject({ title: "Kayıt", url: ZOOM });
    });

    it.each([
      ["a ders nazırı given recording.manage", NAZIR_ID],
      ["a ders nazırı given a group that names it", GROUP_NAZIR_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["the başnazım", ADMIN_ID],
    ])("lets %s change it", async (_name, sub) => {
      await change(recordingId, sub, { title: "Yeni" }).expect(200);
      expect((await stored(recordingId))[0]?.title).toBe("Yeni");
    });

    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["a stranger", STRANGER_ID],
      ["a ders nazırı given only another permission", OTHER_NAZIR_ID],
      ["a ders nazırı whose grant has lapsed", EXPIRED_NAZIR_ID],
    ])("refuses %s with 403", async (_name, sub) => {
      const res = await change(recordingId, sub, { title: "Yeni" }).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      expect((await stored(recordingId))[0]?.title).toBe("Kayıt");
    });

    it("answers 404 for a recording that is not there, or whose lesson is archived", async () => {
      for (const id of [ABSENT_ID, "not-a-uuid"]) {
        const res = await change(id, MUDERRIS_ID, { title: "Yeni" }).expect(
          404
        );
        expect(res.body.code).toBe("RECORDING_NOT_FOUND");
      }
      await db()
        .update(lessons)
        .set({ archivedAt: new Date() })
        .where(eq(lessons.id, lessonId));
      const res = await change(recordingId, MUDERRIS_ID, {
        title: "Yeni",
      }).expect(404);
      expect(res.body.code).toBe("RECORDING_NOT_FOUND");
    });

    it("does not let a müderris of another course reach it", async () => {
      await assignRole(db(), {
        userId: STRANGER_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: otherCourseId,
        grantedBy: MANAGER_ID,
      });
      await change(recordingId, STRANGER_ID, { title: "Yeni" }).expect(403);
    });

    it("needs a token", async () => {
      await http()
        .patch(`/recordings/${recordingId}`)
        .send({ title: "Yeni" })
        .expect(401);
    });
  });

  describe("a pasted Bunny link (MDRS-247 on MDRS-119)", () => {
    it("stores a player link of our library as its video, READY with no url, and plays it signed", async () => {
      const res = await add(
        lessonId,
        MUDERRIS_ID,
        { title: "Bunny", url: bunnyLink(VIDEO.toUpperCase()) },
        library
      ).expect(201);
      expect(res.body).toMatchObject({
        lessonId,
        provider: RecordingProvider.BUNNY,
        status: RecordingStatus.READY,
        visibility: RecordingVisibility.ENROLLED,
      });
      // the writer is answered with a signed link, never the video id itself
      expectSigned(res.body.url, VIDEO);
      expect(Object.keys(res.body)).not.toContain("bunnyVideoId");

      const row = await recordingOf(lessonId);
      expect(row).toMatchObject({
        provider: RecordingProvider.BUNNY,
        url: null,
        bunnyVideoId: VIDEO,
        status: RecordingStatus.READY,
      });
      expect(row?.uploadExpiresAt?.getTime()).toBeLessThanOrEqual(Date.now());
      const [entry] = await auditRows(res.body.id);
      expect(entry).toMatchObject({
        action: "recording.add",
        details: {
          provider: RecordingProvider.BUNNY,
          url: null,
          bunnyVideoId: VIDEO,
        },
      });

      const talebe = await request(library.getHttpServer())
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(talebe.body).toHaveLength(1);
      expectSigned(talebe.body[0].url, VIDEO);

      // READY, so the encoding poll leaves it alone; nothing asked Bunny
      await library.get(RecordingEncodingPoller).pollOnce(new Date());
      expect(await recordingOf(lessonId)).toMatchObject({
        status: RecordingStatus.READY,
        bunnyVideoId: VIDEO,
      });
      expect(bunnyCalls).toEqual([]);
    });

    it("refuses a player link of another library with 400 bunny-foreign-library, writing nothing", async () => {
      const res = await add(
        lessonId,
        MUDERRIS_ID,
        { title: "Bunny", url: bunnyLink(VIDEO, "999999") },
        library
      ).expect(400);
      expect(res.body).toMatchObject({
        code: "RECORDING_LINK_INVALID",
        context: { reason: "bunny-foreign-library" },
      });
      expect(await recordingRows()).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);
    });

    it("refuses any Bunny link while no library is configured", async () => {
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Bunny",
        url: bunnyLink(VIDEO),
      }).expect(400);
      expect(res.body).toMatchObject({
        code: "RECORDING_LINK_INVALID",
        context: { reason: "bunny-foreign-library" },
      });
      expect(await recordingRows()).toHaveLength(0);
    });

    it("refuses a video another session holds with 400 bunny-video-used, on add and on change", async () => {
      await add(
        lessonId,
        MUDERRIS_ID,
        { title: "Bunny", url: bunnyLink(VIDEO) },
        library
      ).expect(201);
      const other = `https://iframe.mediadelivery.net/embed/${LIBRARY.libraryId}/${VIDEO}`;
      const added = await add(
        secondLessonId,
        MUDERRIS_ID,
        { title: "Aynı video", url: other },
        library
      ).expect(400);
      expect(added.body).toMatchObject({
        code: "RECORDING_LINK_INVALID",
        context: { reason: "bunny-video-used" },
      });
      expect(await recordingOf(secondLessonId)).toBeUndefined();

      // an upload's video is held the same way
      await bunnyUpload(thirdLessonId, RecordingStatus.PROCESSING, OTHER_VIDEO);
      const zoom = await add(secondLessonId, MUDERRIS_ID, {
        title: "Zoom",
        url: ZOOM,
      }).expect(201);
      for (const video of [VIDEO, OTHER_VIDEO]) {
        const changed = await change(
          zoom.body.id,
          MUDERRIS_ID,
          { url: bunnyLink(video) },
          library
        ).expect(400);
        expect(changed.body.context).toEqual({ reason: "bunny-video-used" });
      }
      expect(await recordingOf(secondLessonId)).toMatchObject({
        provider: RecordingProvider.OTHER,
        url: ZOOM,
        bunnyVideoId: null,
      });
    });

    it("replaces a Bunny upload that FAILED with the pasted link, in the same row", async () => {
      const failed = await bunnyUpload(lessonId, RecordingStatus.FAILED);
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Zoom kaydı",
        url: ZOOM,
      }).expect(201);
      expect(res.body).toMatchObject({
        id: failed.id,
        provider: RecordingProvider.OTHER,
        url: ZOOM,
        status: RecordingStatus.READY,
      });
      const rows = await recordingRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: failed.id,
        title: "Zoom kaydı",
        provider: RecordingProvider.OTHER,
        url: ZOOM,
        bunnyVideoId: null,
        uploadExpiresAt: null,
        status: RecordingStatus.READY,
      });
      const [entry] = await auditRows(failed.id);
      expect(entry?.details).toMatchObject({ replacedVideoId: OTHER_VIDEO });
    });

    it("replaces a FAILED upload with a Bunny link too, even of the same video", async () => {
      const failed = await bunnyUpload(lessonId, RecordingStatus.FAILED);
      await add(
        lessonId,
        MUDERRIS_ID,
        { title: "Bunny", url: bunnyLink(OTHER_VIDEO) },
        library
      ).expect(201);
      expect(await recordingOf(lessonId)).toMatchObject({
        id: failed.id,
        provider: RecordingProvider.BUNNY,
        bunnyVideoId: OTHER_VIDEO,
        status: RecordingStatus.READY,
      });
    });

    it.each([
      ["READY", RecordingStatus.READY],
      ["still PROCESSING", RecordingStatus.PROCESSING],
    ])("keeps a Bunny upload that is %s: 409 RECORDING_EXISTS names it", async (_name, status) => {
      const upload = await bunnyUpload(lessonId, status);
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Zoom",
        url: ZOOM,
      }).expect(409);
      expect(res.body).toMatchObject({
        code: "RECORDING_EXISTS",
        context: { lessonId, recordingId: upload.id },
      });
      expect(await recordingOf(lessonId)).toMatchObject({
        provider: RecordingProvider.BUNNY,
        bunnyVideoId: OTHER_VIDEO,
        status,
      });
      expect(await auditRows()).toHaveLength(0);
    });

    it("moves a recording from a pasted link to a Bunny video and back, every column with it", async () => {
      const zoom = await add(lessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url: ZOOM,
      }).expect(201);
      const id = zoom.body.id;

      const toBunny = await change(
        id,
        MUDERRIS_ID,
        { url: bunnyLink(VIDEO) },
        library
      ).expect(200);
      expectSigned(toBunny.body.url, VIDEO);
      expect((await stored(id))[0]).toMatchObject({
        provider: RecordingProvider.BUNNY,
        url: null,
        bunnyVideoId: VIDEO,
        status: RecordingStatus.READY,
      });
      expect((await stored(id))[0]?.uploadExpiresAt).not.toBeNull();

      // its own video again is no conflict; a rename leaves the video alone
      await change(id, MUDERRIS_ID, { url: bunnyLink(VIDEO) }, library).expect(
        200
      );
      await change(id, MUDERRIS_ID, { title: "Yeni ad" }, library).expect(200);
      expect((await stored(id))[0]).toMatchObject({
        title: "Yeni ad",
        provider: RecordingProvider.BUNNY,
        bunnyVideoId: VIDEO,
      });

      const back = await change(id, MUDERRIS_ID, { url: DRIVE }).expect(200);
      expect(back.body).toMatchObject({
        provider: RecordingProvider.DRIVE,
        url: DRIVE,
      });
      expect((await stored(id))[0]).toMatchObject({
        provider: RecordingProvider.DRIVE,
        url: DRIVE,
        bunnyVideoId: null,
        uploadExpiresAt: null,
        status: RecordingStatus.READY,
      });

      const rows = await auditRows(id);
      expect(rows[1]?.details).toMatchObject({
        previous: { provider: RecordingProvider.OTHER, url: ZOOM },
        next: {
          provider: RecordingProvider.BUNNY,
          url: null,
          bunnyVideoId: VIDEO,
        },
      });
      expect(rows.at(-1)?.details).toMatchObject({
        previous: { provider: RecordingProvider.BUNNY, bunnyVideoId: VIDEO },
        next: { provider: RecordingProvider.DRIVE, bunnyVideoId: null },
      });
      expect(bunnyCalls).toEqual([]);
    });

    it("replaces an upload still PROCESSING with a pasted link, which the poll then leaves alone", async () => {
      const upload = await bunnyUpload(lessonId, RecordingStatus.PROCESSING);
      await change(upload.id, MUDERRIS_ID, { url: ZOOM }, library).expect(200);
      expect(await recordingOf(lessonId)).toMatchObject({
        provider: RecordingProvider.OTHER,
        url: ZOOM,
        bunnyVideoId: null,
        uploadExpiresAt: null,
        status: RecordingStatus.READY,
      });
      await library.get(RecordingEncodingPoller).pollOnce(new Date());
      expect(bunnyCalls).toEqual([]);
    });
  });
});
