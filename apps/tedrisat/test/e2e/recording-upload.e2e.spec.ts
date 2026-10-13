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
import { RecordingExistsError } from "../../src/course/errors/recording-exists.error";
import { RecordingRepository } from "../../src/course/recording.repository";
import { RecordingEncodingPoller } from "../../src/course/recording-encoding.poller";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  bunnyVideoRemovals,
  courses,
  courseWeeks,
  enrollments,
  lessonRecordings,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { notifications } from "../../src/database/schema/notification.schema";
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
  embedLifetimeSeconds: 6 * 3600,
  collectionId: null,
};

/** A stand-in for Bunny's Stream API: Create, Get and Delete Video, in memory. */
class FakeBunny {
  readonly videos = new Map<string, { status: number; length: number }>();
  /** videos whose Delete Bunny answers with 500 */
  readonly refused = new Set<string>();
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
    if (method === "DELETE" && url.startsWith(`${root}/`)) {
      const id = url.slice(root.length + 1);
      if (this.refused.has(id)) return new Response("{}", { status: 500 });
      return this.videos.delete(id)
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response("{}", { status: 404 });
    }
    return new Response("{}", { status: 400 });
  };

  /** The videos Delete Video was called for, in order. */
  deleted(): string[] {
    const root = `https://video.bunnycdn.com/library/${LIBRARY.libraryId}/videos/`;
    return this.calls
      .filter((c) => c.method === "DELETE")
      .map((c) => c.url.slice(root.length));
  }

  reset() {
    this.videos.clear();
    this.refused.clear();
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
  /** The Bunny videos waiting to be deleted (13 October). */
  const queued = () => db().select().from(bunnyVideoRemovals);

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
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "bunny_video_removals",
      "notifications",
      "audit_log",
      "users"
    );
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
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "bunny_video_removals",
      "notifications",
      "audit_log",
      "users"
    );
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
          replacedLink: null,
        },
      });
    });

    it("lets the köşk nazımı start one too", async () => {
      await start(MANAGER_ID).expect(201);
    });

    it("refuses a session whose recording is a Bunny video PROCESSING or READY with 409, before Bunny is called", async () => {
      const { videoId } = (await start(MUDERRIS_ID).expect(201)).body;
      const processing = await start(MUDERRIS_ID).expect(409);
      expect(processing.body.code).toBe("RECORDING_EXISTS");
      await db()
        .update(lessonRecordings)
        .set({ status: RecordingStatus.READY })
        .where(eq(lessonRecordings.lessonId, lessonId));
      const ready = await start(MUDERRIS_ID).expect(409);
      expect(ready.body.code).toBe("RECORDING_EXISTS");
      // "Kayıt ekle" sends no `replaceVideo`; `false` is the same
      const unflagged = await start(MUDERRIS_ID, lessonId, {
        title: "Emsile: 1. celse",
        replaceVideo: false,
      }).expect(409);
      expect(unflagged.body.code).toBe("RECORDING_EXISTS");
      expect(bunny.calls.filter((c) => c.method === "POST")).toHaveLength(1);
      expect((await recordingOf(lessonId)).bunnyVideoId).toBe(videoId);
      expect(await queued()).toEqual([]);
    });

    // 13 October: "yanlış dosya yüklemiş olsak değiştiremeyecek miyiz?" The
    // edit dialog of a Bunny recording sends `replaceVideo`.
    it("replaces a READY Bunny video when replaceVideo is sent: the new video PROCESSING in the same row, the old one queued", async () => {
      const releaseAt = new Date("2026-10-20T17:00:00.000Z");
      await db()
        .update(lessons)
        .set({ recordingAvailableAt: releaseAt })
        .where(eq(lessons.id, lessonId));
      const first = (await start(MUDERRIS_ID).expect(201)).body;
      await db()
        .update(lessonRecordings)
        .set({ status: RecordingStatus.READY, durationMinutes: 31 })
        .where(eq(lessonRecordings.lessonId, lessonId));
      await db().delete(auditLog);

      const res = await start(MUDERRIS_ID, lessonId, {
        title: "Emsile: doğru dosya",
        visibility: RecordingVisibility.PUBLIC,
        replaceVideo: true,
      }).expect(201);
      expect(res.body.recordingId).toBe(first.recordingId);
      expect(res.body.videoId).not.toBe(first.videoId);
      expect(await recordingOf(lessonId)).toMatchObject({
        id: first.recordingId,
        title: "Emsile: doğru dosya",
        provider: RecordingProvider.BUNNY,
        status: RecordingStatus.PROCESSING,
        visibility: RecordingVisibility.PUBLIC,
        url: null,
        bunnyVideoId: res.body.videoId,
      });
      const [lesson] = await db()
        .select({ recordingAvailableAt: lessons.recordingAvailableAt })
        .from(lessons)
        .where(eq(lessons.id, lessonId));
      expect(lesson.recordingAvailableAt).toEqual(releaseAt);

      expect(await queued()).toEqual([
        {
          videoId: first.videoId,
          recordingId: first.recordingId,
          replacedByVideoId: res.body.videoId,
          queuedBy: MUDERRIS_ID,
          queuedAt: expect.any(Date),
          attempts: 0,
          lastAttemptAt: null,
        },
      ]);
      // nothing is deleted while the new upload runs
      expect(bunny.deleted()).toEqual([]);
      const [audit] = await db().select().from(auditLog);
      expect(audit).toMatchObject({
        action: "recording.upload_start",
        details: {
          recordingId: first.recordingId,
          bunnyVideoId: res.body.videoId,
          replacedVideoId: first.videoId,
          replacedLink: null,
        },
      });
    });

    it("replaces one still PROCESSING with replaceVideo, and queues a FAILED one's video without it", async () => {
      const first = (await start(MUDERRIS_ID).expect(201)).body;
      const second = (
        await start(MUDERRIS_ID, lessonId, {
          title: "İptal edilen yüklemenin yerine",
          replaceVideo: true,
        }).expect(201)
      ).body;
      expect(await recordingOf(lessonId)).toMatchObject({
        status: RecordingStatus.PROCESSING,
        bunnyVideoId: second.videoId,
      });

      await db()
        .update(lessonRecordings)
        .set({ status: RecordingStatus.FAILED })
        .where(eq(lessonRecordings.lessonId, lessonId));
      const third = (await start(MUDERRIS_ID).expect(201)).body;
      const pairs = (await queued()).map((q) => [
        q.videoId,
        q.replacedByVideoId,
      ]);
      expect(pairs).toHaveLength(2);
      expect(pairs).toEqual(
        expect.arrayContaining([
          [first.videoId, second.videoId],
          [second.videoId, third.videoId],
        ])
      );
    });

    // The owner's report of 12 October: a session's stream, added as its
    // recording, was private; its video is uploaded in the link's place.
    it("replaces a session's link with the upload, keeps the link in the audit entry and leaves the release time", async () => {
      const releaseAt = new Date("2026-10-20T17:00:00.000Z");
      await db()
        .update(lessons)
        .set({ recordingAvailableAt: releaseAt })
        .where(eq(lessons.id, linkedLessonId));
      const link = await recordingOf(linkedLessonId);

      const res = await start(MUDERRIS_ID, linkedLessonId, {
        title: "Bağlantılı: video",
        visibility: RecordingVisibility.PUBLIC,
      }).expect(201);
      expect(res.body.recordingId).toBe(link.id);
      expect(bunny.videos.has(res.body.videoId)).toBe(true);
      expect(await recordingOf(linkedLessonId)).toMatchObject({
        id: link.id,
        title: "Bağlantılı: video",
        provider: RecordingProvider.BUNNY,
        status: RecordingStatus.PROCESSING,
        visibility: RecordingVisibility.PUBLIC,
        url: null,
        bunnyVideoId: res.body.videoId,
      });
      const [lesson] = await db()
        .select({ recordingAvailableAt: lessons.recordingAvailableAt })
        .from(lessons)
        .where(eq(lessons.id, linkedLessonId));
      expect(lesson.recordingAvailableAt).toEqual(releaseAt);

      const audit = await db()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entity, "lesson"),
            eq(auditLog.entityId, linkedLessonId)
          )
        );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: MUDERRIS_ID,
        action: "recording.upload_start",
        details: {
          courseId,
          recordingId: link.id,
          bunnyVideoId: res.body.videoId,
          visibility: "PUBLIC",
          replacedVideoId: null,
          replacedLink: {
            provider: "YOUTUBE",
            url: "https://www.youtube.com/watch?v=rec456",
          },
        },
      });

      // the video is the recording now: a second upload is refused
      const again = await start(MUDERRIS_ID, linkedLessonId).expect(409);
      expect(again.body.code).toBe("RECORDING_EXISTS");
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
          `^https://player\\.mediadelivery\\.net/embed/${LIBRARY.libraryId}/${videoId}\\?token=[0-9a-f]{64}&expires=\\d+$`
        )
      );
      expect(JSON.stringify(res.body)).not.toContain("bunnyVideoId");

      const signed = await resign(MUDERRIS_ID, videoId).expect(409);
      expect(signed.body.code).toBe("RECORDING_UPLOAD_CLOSED");
    });

    // MDRS-283: "Kayıt eklendi" for an upload is the poll's READY, once.
    it("tells the enrolled talebe once, when the poll marks the upload READY", async () => {
      const news = () =>
        db()
          .select()
          .from(notifications)
          .where(eq(notifications.type, "RECORDING_ADDED"));
      const { videoId } = (await start(MUDERRIS_ID).expect(201)).body;
      expect(await news()).toEqual([]);
      await poll();
      expect(await news()).toEqual([]);

      bunny.videos.set(videoId, { status: 4, length: 1_830 });
      expect(await poll()).toMatchObject({ ready: 1 });
      const told = await news();
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        userId: TALEBE_ID,
        targetType: "SESSION",
        targetId: lessonId,
        params: { courseId, courseTitle: "Emsile ve Bina" },
      });

      // Settled: a later poll does not read it again, so nobody is told twice.
      await poll();
      expect(await news()).toHaveLength(1);
    });

    it("tells nobody of an upload that failed", async () => {
      const { videoId } = (await start(MUDERRIS_ID).expect(201)).body;
      bunny.videos.set(videoId, { status: 5, length: 0 });
      expect(await poll()).toMatchObject({ failed: 1 });
      expect(
        await db()
          .select()
          .from(notifications)
          .where(eq(notifications.type, "RECORDING_ADDED"))
      ).toEqual([]);
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

  // `start` judges the session's recording before Bunny is called; the write
  // judges it again under the lesson's lock, as it is by then.
  describe("the check made again under the lesson's lock", () => {
    let n = 0;
    const write = (id: string, replaceVideo?: boolean) =>
      app.get(RecordingRepository).startBunnyUpload({
        lessonId: id,
        title: "Kilit altında",
        visibility: RecordingVisibility.ENROLLED,
        recordedAt: null,
        bunnyVideoId: `c0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        uploadExpiresAt: new Date(Date.now() + 3_600_000),
        actorId: MUDERRIS_ID,
        replaceVideo,
      });

    it("replaces a link", async () => {
      const link = await recordingOf(linkedLessonId);
      const { recordingId } = await write(linkedLessonId);
      expect(recordingId).toBe(link.id);
      expect(await recordingOf(linkedLessonId)).toMatchObject({
        provider: RecordingProvider.BUNNY,
        status: RecordingStatus.PROCESSING,
        url: null,
      });
    });

    it("refuses a Bunny video PROCESSING or READY, and leaves it as it was", async () => {
      await write(lessonId);
      const held = (await recordingOf(lessonId)).bunnyVideoId;
      await expect(write(lessonId)).rejects.toBeInstanceOf(
        RecordingExistsError
      );
      await db()
        .update(lessonRecordings)
        .set({ status: RecordingStatus.READY })
        .where(eq(lessonRecordings.lessonId, lessonId));
      await expect(write(lessonId)).rejects.toBeInstanceOf(
        RecordingExistsError
      );
      expect(await recordingOf(lessonId)).toMatchObject({
        status: RecordingStatus.READY,
        bunnyVideoId: held,
      });
      expect(await queued()).toEqual([]);
    });

    it("replaces a Bunny video PROCESSING or READY with replaceVideo, and queues each video it replaces", async () => {
      await write(lessonId);
      const processing = (await recordingOf(lessonId)).bunnyVideoId;
      await write(lessonId, true);
      const ready = (await recordingOf(lessonId)).bunnyVideoId;
      await db()
        .update(lessonRecordings)
        .set({ status: RecordingStatus.READY })
        .where(eq(lessonRecordings.lessonId, lessonId));
      await write(lessonId, true);
      const latest = await recordingOf(lessonId);
      expect(latest.status).toBe(RecordingStatus.PROCESSING);
      const pairs = (await queued()).map((q) => [
        q.videoId,
        q.replacedByVideoId,
      ]);
      expect(pairs).toHaveLength(2);
      expect(pairs).toEqual(
        expect.arrayContaining([
          [processing, ready],
          [ready, latest.bunnyVideoId],
        ])
      );
    });
  });

  /**
   * 13 October: the video a new upload replaced is deleted from Bunny once
   * that upload is over ("yükleme bitince"), so the wrong file does not stay
   * in the library; never while a recording holds it again. The poll's own
   * handling of Bunny's answers is unit-tested
   * (test/unit/course/recording-encoding-poller.spec.ts); this covers which
   * videos are due, against the database.
   */
  describe("deleting a replaced video", () => {
    const deletions = () =>
      db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "recording.video_delete"));

    /** A READY upload of the session, then a new upload in its place. */
    const replaced = async () => {
      const first = (await start(MUDERRIS_ID).expect(201)).body;
      bunny.videos.set(first.videoId, { status: 4, length: 600 });
      expect(await poll()).toMatchObject({ ready: 1 });
      const next = (
        await start(MUDERRIS_ID, lessonId, {
          title: "Emsile: doğru dosya",
          replaceVideo: true,
        }).expect(201)
      ).body;
      return { first, next };
    };

    it("waits while the new upload is PROCESSING, deletes the old video once it is READY, and audits it", async () => {
      const { first, next } = await replaced();
      expect(await poll()).toMatchObject({
        waiting: 1,
        removed: 0,
        removeErrors: 0,
      });
      expect(bunny.deleted()).toEqual([]);
      expect(bunny.videos.has(first.videoId)).toBe(true);

      bunny.videos.set(next.videoId, { status: 4, length: 1_830 });
      expect(await poll()).toMatchObject({ ready: 1, removed: 1 });
      expect(bunny.deleted()).toEqual([first.videoId]);
      expect(bunny.videos.has(first.videoId)).toBe(false);
      expect(bunny.calls.find((c) => c.method === "DELETE")?.accessKey).toBe(
        LIBRARY.apiKey
      );
      expect(await queued()).toEqual([]);
      const [entry] = await deletions();
      expect(entry).toMatchObject({
        actorId: MUDERRIS_ID,
        entity: "lesson_recording",
        entityId: first.recordingId,
        details: {
          courseId,
          lessonId,
          bunnyVideoId: first.videoId,
          replacedByVideoId: next.videoId,
          attempts: 1,
          alreadyGone: false,
        },
      });

      // done: a later poll asks nothing more of Bunny
      await poll();
      expect(bunny.deleted()).toEqual([first.videoId]);
      expect(await deletions()).toHaveLength(1);
    });

    it("deletes it once the new upload FAILED too", async () => {
      const { first, next } = await replaced();
      bunny.videos.set(next.videoId, { status: 5, length: 0 });
      expect(await poll()).toMatchObject({ failed: 1, removed: 1 });
      expect(bunny.deleted()).toEqual([first.videoId]);
    });

    it("deletes it when the new upload was itself replaced, and waits for the newest", async () => {
      const { first, next } = await replaced();
      const newest = (
        await start(MUDERRIS_ID, lessonId, {
          title: "Emsile: en doğru dosya",
          replaceVideo: true,
        }).expect(201)
      ).body;
      expect(await poll()).toMatchObject({ waiting: 1, removed: 1 });
      expect(bunny.deleted()).toEqual([first.videoId]);
      expect((await queued()).map((q) => q.videoId)).toEqual([next.videoId]);

      bunny.videos.set(newest.videoId, { status: 4, length: 600 });
      expect(await poll()).toMatchObject({ ready: 1, removed: 1 });
      expect(bunny.deleted()).toEqual([first.videoId, next.videoId]);
    });

    it("keeps a video a recording holds again: drops it from the queue and calls nothing", async () => {
      const { first, next } = await replaced();
      // its link pasted on another session's recording
      const linked = await recordingOf(linkedLessonId);
      await request(app.getHttpServer())
        .patch(`/recordings/${linked.id}`)
        .set("Authorization", as(MUDERRIS_ID))
        .send({
          url: `https://player.mediadelivery.net/embed/${LIBRARY.libraryId}/${first.videoId}`,
        })
        .expect(200);
      expect((await recordingOf(linkedLessonId)).bunnyVideoId).toBe(
        first.videoId
      );

      bunny.videos.set(next.videoId, { status: 4, length: 600 });
      expect(await poll()).toMatchObject({ ready: 1, removed: 0 });
      expect(bunny.deleted()).toEqual([]);
      expect(bunny.videos.has(first.videoId)).toBe(true);
      expect(await queued()).toEqual([]);
      expect(await deletions()).toEqual([]);
    });

    it("counts a video Bunny no longer has as deleted", async () => {
      const { first, next } = await replaced();
      bunny.videos.delete(first.videoId);
      bunny.videos.set(next.videoId, { status: 4, length: 600 });
      expect(await poll()).toMatchObject({ removed: 1, removeErrors: 0 });
      expect(await queued()).toEqual([]);
      const [entry] = await deletions();
      expect(entry.details).toMatchObject({
        bunnyVideoId: first.videoId,
        alreadyGone: true,
      });
    });

    it("counts a video Bunny refuses to delete, keeps it queued and deletes it on a later pass", async () => {
      const { first, next } = await replaced();
      bunny.refused.add(first.videoId);
      bunny.videos.set(next.videoId, { status: 4, length: 600 });
      expect(await poll()).toMatchObject({
        ready: 1,
        removed: 0,
        removeErrors: 1,
      });
      const [row] = await queued();
      expect(row).toMatchObject({ videoId: first.videoId, attempts: 1 });
      expect(row.lastAttemptAt).not.toBeNull();
      expect(bunny.videos.has(first.videoId)).toBe(true);
      expect(await deletions()).toEqual([]);

      bunny.refused.clear();
      expect(await poll()).toMatchObject({ removed: 1, removeErrors: 0 });
      expect(bunny.videos.has(first.videoId)).toBe(false);
      expect(await queued()).toEqual([]);
      const [entry] = await deletions();
      expect(entry.details).toMatchObject({ attempts: 2, alreadyGone: false });
    });

    it("tries the videos it never tried before one Bunny keeps refusing", async () => {
      const { first, next } = await replaced();
      bunny.refused.add(first.videoId);
      bunny.videos.set(next.videoId, { status: 4, length: 600 });
      await poll();
      // a second session's video replaced by a pasted link: due at once
      const linked = await recordingOf(linkedLessonId);
      const pasted = "d0000000-0000-4000-8000-000000000001";
      await db()
        .update(lessonRecordings)
        .set({
          provider: RecordingProvider.BUNNY,
          url: null,
          bunnyVideoId: pasted,
          uploadExpiresAt: new Date(),
        })
        .where(eq(lessonRecordings.id, linked.id));
      bunny.videos.set(pasted, { status: 4, length: 600 });
      await request(app.getHttpServer())
        .patch(`/recordings/${linked.id}`)
        .set("Authorization", as(MUDERRIS_ID))
        .send({ url: "https://www.youtube.com/watch?v=rec456" })
        .expect(200);
      bunny.calls.length = 0;

      // never tried comes first, then the one tried least recently
      expect(await poll()).toMatchObject({ removed: 1, removeErrors: 1 });
      expect(bunny.deleted()).toEqual([pasted, first.videoId]);
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
