import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { tusUploadSignature } from "../../src/bunny-stream/bunny-signature";
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
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-116, part A — `POST /lessons/:id/recordings/uploads`, its re-sign
 * route and the encoding poll. Bunny is never reached: the app runs with a
 * stub transport (`BUNNY_STREAM_FETCH`) that keeps its videos in a map, and
 * a second app runs with no library configured at all. The signature and the
 * status rule are unit-tested (test/unit/bunny-stream); this covers the
 * permission, the row, the CHECK constraint, the 503 and the round trip to
 * the talebe's player link.
 */

const MANAGER_ID = "e1160000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e1160000-0000-4000-8000-000000000002";
const TALEBE_ID = "e1160000-0000-4000-8000-000000000003";
const STRANGER_ID = "e1160000-0000-4000-8000-000000000004";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const LIBRARY: IBunnyStreamConfig = {
  libraryId: "424242",
  apiKey: "e2e-library-api-key",
  tokenKey: "e2e-token-key",
};

/** A stand-in for Bunny's Stream API: Create Video and Get Video, in memory. */
class FakeBunny {
  readonly videos = new Map<string, { status: number; length: number }>();
  readonly calls: Array<{ method: string; url: string; accessKey: string }> =
    [];
  private next = 0;

  readonly fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    this.calls.push({ method, url, accessKey: headers.AccessKey });
    const root = `https://video.bunnycdn.com/library/${LIBRARY.libraryId}/videos`;
    if (method === "POST" && url === root) {
      this.next++;
      const guid = `b0000000-0000-4000-8000-${String(this.next).padStart(12, "0")}`;
      this.videos.set(guid, { status: 0, length: 0 });
      return new Response(JSON.stringify({ guid }), { status: 200 });
    }
    if (method === "GET" && url.startsWith(`${root}/`)) {
      const video = this.videos.get(url.slice(root.length + 1));
      return video
        ? new Response(JSON.stringify(video), { status: 200 })
        : new Response("{}", { status: 404 });
    }
    return new Response("{}", { status: 400 });
  };

  reset() {
    this.videos.clear();
    this.calls.length = 0;
  }
}

describe("recording uploads to Bunny Stream (MDRS-116, e2e)", () => {
  const bunny = new FakeBunny();
  let app: INestApplication;
  let bare: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let lessonId: string;
  let linkedLessonId: string;

  const db = () => databaseService.db;
  const as = (sub: string) => bearerFor({ sub });
  const start = (
    sub: string,
    id = lessonId,
    body: object = { title: "Emsile: 1. celse" },
    target = app
  ) =>
    request(target.getHttpServer())
      .post(`/lessons/${id}/recordings/uploads`)
      .set("Authorization", as(sub))
      .send(body);
  const resign = (sub: string, videoId: string, id = lessonId) =>
    request(app.getHttpServer())
      .post(`/lessons/${id}/recordings/uploads/${videoId}/signature`)
      .set("Authorization", as(sub))
      .send();
  const recordingOf = async (id: string) =>
    (
      await db()
        .select()
        .from(lessonRecordings)
        .where(eq(lessonRecordings.lessonId, id))
    )[0];
  const poll = (batch?: number) =>
    app.get(RecordingEncodingPoller).pollOnce(new Date(), batch);

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: BUNNY_STREAM_CONFIG, useValue: LIBRARY },
        { provide: BUNNY_STREAM_FETCH, useValue: bunny.fetch },
      ],
    });
    bare = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    bunny.reset();
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "audit_log", "users");
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
    });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId: kosk.id,
        authorId: MANAGER_ID,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
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
    [{ id: lessonId }, { id: linkedLessonId }] = await db()
      .insert(lessons)
      .values([
        {
          weekId: week.id,
          orderIndex: 0,
          title: "Celse",
          type: LessonType.LIVE,
          durationMinutes: 60,
          scheduledAt: new Date(Date.now() - 48 * 3_600_000),
        },
        {
          weekId: week.id,
          orderIndex: 1,
          title: "Bağlantılı",
          type: LessonType.LIVE,
          durationMinutes: 60,
          scheduledAt: new Date(Date.now() - 24 * 3_600_000),
        },
      ])
      .returning();
    await db().insert(lessonRecordings).values({
      lessonId: linkedLessonId,
      title: "YouTube kaydı",
      provider: RecordingProvider.YOUTUBE,
      url: "https://www.youtube.com/watch?v=rec456",
      visibility: RecordingVisibility.ENROLLED,
      status: RecordingStatus.READY,
    });
    await db().insert(enrollments).values({
      userId: TALEBE_ID,
      courseId,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "audit_log", "users");
    await bare.close();
    await app.close();
  });

  describe("POST /lessons/:id/recordings/uploads", () => {
    it("refuses a talebe with 403, before Bunny is called", async () => {
      const res = await start(TALEBE_ID).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      expect(bunny.calls).toEqual([]);
      expect(await recordingOf(lessonId)).toBeUndefined();
    });

    it("refuses a stranger with 403", async () => {
      const res = await start(STRANGER_ID).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
    });

    it("gives the müderris a TUS upload and records a PROCESSING Bunny recording", async () => {
      const before = Math.floor(Date.now() / 1000);
      const res = await start(MUDERRIS_ID, lessonId, {
        title: "  Emsile: 1. celse  ",
        visibility: RecordingVisibility.PUBLIC,
      }).expect(201);
      expect(res.headers["cache-control"]).toBe("private, no-store");

      const body = res.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        "authorizationExpire",
        "authorizationSignature",
        "endpoint",
        "libraryId",
        "recordingId",
        "videoId",
      ]);
      expect(body.endpoint).toBe("https://video.bunnycdn.com/tusupload");
      expect(body.libraryId).toBe(LIBRARY.libraryId);
      const videoId = body.videoId as string;
      expect(bunny.videos.has(videoId)).toBe(true);
      const expire = body.authorizationExpire as number;
      expect(expire - before).toBeGreaterThanOrEqual(86_400 - 5);
      expect(expire - before).toBeLessThanOrEqual(86_400 + 5);
      expect(body.authorizationSignature).toBe(
        tusUploadSignature(LIBRARY.libraryId, LIBRARY.apiKey, expire, videoId)
      );
      expect(JSON.stringify(body)).not.toContain(LIBRARY.apiKey);

      expect(bunny.calls).toEqual([
        {
          method: "POST",
          url: `https://video.bunnycdn.com/library/${LIBRARY.libraryId}/videos`,
          accessKey: LIBRARY.apiKey,
        },
      ]);

      expect(await recordingOf(lessonId)).toMatchObject({
        id: body.recordingId,
        title: "Emsile: 1. celse",
        provider: RecordingProvider.BUNNY,
        status: RecordingStatus.PROCESSING,
        visibility: RecordingVisibility.PUBLIC,
        url: null,
        bunnyVideoId: videoId,
        uploadExpiresAt: new Date(expire * 1000),
      });
      const audit = await db()
        .select()
        .from(auditLog)
        .where(
          and(eq(auditLog.entity, "lesson"), eq(auditLog.entityId, lessonId))
        );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: MUDERRIS_ID,
        action: "recording.upload_start",
        details: {
          courseId,
          recordingId: body.recordingId,
          bunnyVideoId: videoId,
          visibility: "PUBLIC",
          replacedVideoId: null,
        },
      });
    });

    it("lets the köşk nazımı start one too", async () => {
      await start(MANAGER_ID).expect(201);
    });

    it("refuses a session that already has a recording with 409, before Bunny is called", async () => {
      const res = await start(MUDERRIS_ID, linkedLessonId).expect(409);
      expect(res.body.code).toBe("RECORDING_EXISTS");
      await start(MUDERRIS_ID).expect(201);
      const again = await start(MUDERRIS_ID).expect(409);
      expect(again.body.code).toBe("RECORDING_EXISTS");
      expect(bunny.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    });

    it("answers 404 for a missing lesson and 400 for a missing title", async () => {
      const missing = await start(MUDERRIS_ID, ABSENT_ID).expect(404);
      expect(missing.body.code).toBe("LESSON_NOT_FOUND");
      await start(MUDERRIS_ID, lessonId, { title: "   " }).expect(400);
      expect(bunny.calls).toEqual([]);
    });

    it("answers 404 for an archived session, before Bunny is called", async () => {
      await db()
        .update(lessons)
        .set({ archivedAt: new Date() })
        .where(eq(lessons.id, lessonId));
      const res = await start(MUDERRIS_ID).expect(404);
      expect(res.body.code).toBe("LESSON_NOT_FOUND");
      expect(bunny.calls).toEqual([]);
      expect(await recordingOf(lessonId)).toBeUndefined();
    });

    it("answers 503 when the server has no Bunny library, and still 403 to a talebe", async () => {
      const res = await start(MUDERRIS_ID, lessonId, undefined, bare).expect(
        503
      );
      expect(res.body.code).toBe("BUNNY_STREAM_NOT_CONFIGURED");
      await start(TALEBE_ID, lessonId, undefined, bare).expect(403);
      expect(await recordingOf(lessonId)).toBeUndefined();
    });
  });

  describe("POST /lessons/:id/recordings/uploads/:videoId/signature", () => {
    it("signs the same video with the original expiry, for the müderris only", async () => {
      const first = (await start(MUDERRIS_ID).expect(201)).body;
      const again = await resign(MUDERRIS_ID, first.videoId).expect(200);
      expect(again.body).toEqual(first);

      const refused = await resign(TALEBE_ID, first.videoId).expect(403);
      expect(refused.body.code).toBe("AUTHZ_FORBIDDEN");
    });

    it("answers 404 for a video that is not this session's upload", async () => {
      await start(MUDERRIS_ID).expect(201);
      const res = await resign(
        MUDERRIS_ID,
        "b0000000-0000-4000-8000-999999999999"
      ).expect(404);
      expect(res.body.code).toBe("RECORDING_UPLOAD_NOT_FOUND");
    });

    it("refuses once the upload's lifetime has passed", async () => {
      const { videoId } = (await start(MUDERRIS_ID).expect(201)).body;
      await db()
        .update(lessonRecordings)
        .set({ uploadExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(lessonRecordings.lessonId, lessonId));
      const res = await resign(MUDERRIS_ID, videoId).expect(409);
      expect(res.body).toMatchObject({ code: "RECORDING_UPLOAD_CLOSED" });
    });
  });

  describe("the encoding poll", () => {
    it("moves an encoded video to READY and the talebe gets a signed player link", async () => {
      const { videoId } = (await start(MUDERRIS_ID).expect(201)).body;
      expect(await poll()).toMatchObject({ ready: 0, waiting: 1 });

      bunny.videos.set(videoId, { status: 4, length: 1_830 });
      expect(await poll()).toMatchObject({ ready: 1, failed: 0 });
      expect(await recordingOf(lessonId)).toMatchObject({
        status: RecordingStatus.READY,
        durationMinutes: 31,
        url: null,
      });

      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      const bunnyRow = res.body.find(
        (r: { lessonId: string }) => r.lessonId === lessonId
      );
      expect(bunnyRow).toMatchObject({
        provider: "BUNNY",
        status: "READY",
      });
      expect(bunnyRow.url).toMatch(
        new RegExp(
          `^https://iframe\\.mediadelivery\\.net/embed/${LIBRARY.libraryId}/${videoId}\\?token=[0-9a-f]{64}&expires=\\d+$`
        )
      );
      expect(JSON.stringify(res.body)).not.toContain("bunnyVideoId");

      const signed = await resign(MUDERRIS_ID, videoId).expect(409);
      expect(signed.body.code).toBe("RECORDING_UPLOAD_CLOSED");
    });

    it("fails an upload that never completed within its lifetime, and a new upload replaces it", async () => {
      const { videoId } = (await start(MUDERRIS_ID).expect(201)).body;
      await db()
        .update(lessonRecordings)
        .set({ uploadExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(lessonRecordings.lessonId, lessonId));
      expect(await poll()).toMatchObject({ failed: 1 });
      expect((await recordingOf(lessonId)).status).toBe(RecordingStatus.FAILED);

      const retry = await start(MUDERRIS_ID).expect(201);
      expect(retry.body.videoId).not.toBe(videoId);
      const row = await recordingOf(lessonId);
      expect(row).toMatchObject({
        status: RecordingStatus.PROCESSING,
        bunnyVideoId: retry.body.videoId,
      });
      expect(row.id).toBe(retry.body.recordingId);
    });

    it("fails a video Bunny reports as failed, or no longer has", async () => {
      const { videoId } = (await start(MUDERRIS_ID).expect(201)).body;
      bunny.videos.set(videoId, { status: 5, length: 0 });
      expect(await poll()).toMatchObject({ failed: 1 });

      await start(MUDERRIS_ID).expect(201);
      bunny.videos.clear();
      expect(await poll()).toMatchObject({ failed: 1 });
      expect((await recordingOf(lessonId)).status).toBe(RecordingStatus.FAILED);

      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(
        res.body.map((r: { lessonId: string }) => r.lessonId)
      ).not.toContain(lessonId);
    });

    it("goes round every waiting upload instead of re-reading the oldest", async () => {
      const { id: otherLessonId } = (
        await db()
          .insert(lessons)
          .values({
            weekId: (
              await db()
                .select({ weekId: lessons.weekId })
                .from(lessons)
                .where(eq(lessons.id, lessonId))
            )[0].weekId,
            orderIndex: 2,
            title: "Sonraki celse",
            type: LessonType.LIVE,
            durationMinutes: 60,
            scheduledAt: new Date(Date.now() - 3_600_000),
          })
          .returning()
      )[0];
      await start(MUDERRIS_ID).expect(201);
      const newer = (await start(MUDERRIS_ID, otherLessonId).expect(201)).body;
      bunny.videos.set(newer.videoId, { status: 4, length: 600 });

      expect(await poll(1)).toMatchObject({ waiting: 1, ready: 0 });
      expect(await poll(1)).toMatchObject({ waiting: 0, ready: 1 });
      expect((await recordingOf(otherLessonId)).status).toBe(
        RecordingStatus.READY
      );
      expect((await recordingOf(lessonId)).status).toBe(
        RecordingStatus.PROCESSING
      );
    });
  });

  describe("the provider CHECK constraint", () => {
    it("refuses a BUNNY row with a url or without a video id, and a link row with a video id", async () => {
      const base = {
        lessonId,
        title: "x",
        status: RecordingStatus.PROCESSING,
      };
      const expiry = new Date(Date.now() + 3_600_000);
      await expect(
        db()
          .insert(lessonRecordings)
          .values({
            ...base,
            provider: RecordingProvider.BUNNY,
            uploadExpiresAt: expiry,
          })
      ).rejects.toThrow();
      await expect(
        db()
          .insert(lessonRecordings)
          .values({
            ...base,
            provider: RecordingProvider.BUNNY,
            bunnyVideoId: "v",
            uploadExpiresAt: expiry,
            url: "https://example.org/v",
          })
      ).rejects.toThrow();
      await expect(
        db()
          .insert(lessonRecordings)
          .values({
            ...base,
            provider: RecordingProvider.YOUTUBE,
            url: "https://www.youtube.com/watch?v=x",
            bunnyVideoId: "v",
          })
      ).rejects.toThrow();
      await expect(
        db()
          .insert(lessonRecordings)
          .values({
            ...base,
            provider: RecordingProvider.YOUTUBE,
            status: RecordingStatus.READY,
          })
      ).rejects.toThrow();
    });
  });
});
