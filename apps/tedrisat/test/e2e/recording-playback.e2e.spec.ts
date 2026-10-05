import { INestApplication } from "@nestjs/common";
import { inArray } from "drizzle-orm";
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
import { DatabaseService } from "../../src/database/database.service";
import { BAN_SCOPES, bans } from "../../src/database/schema/ban.schema";
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
 * MDRS-119 — signed Bunny playback on the two reads that hand out
 * recordings (`GET /courses/:id/recordings` and the session page), and that
 * `GET /courses/:id` carries no recording at all. The token formula and the
 * expiry arithmetic are unit-tested (test/unit/bunny-stream); this covers who
 * is handed a signed link, that its expiry is the configured one, that it is
 * never cached, and that nobody outside the course is handed an ENROLLED
 * recording's video id or link. Bunny is never reached: its transport is a
 * stub, and nothing on these reads calls it.
 */

const MANAGER_ID = "e1190000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e1190000-0000-4000-8000-000000000002";
const TALEBE_ID = "e1190000-0000-4000-8000-000000000003";
const STRANGER_ID = "e1190000-0000-4000-8000-000000000004";
const BANNED_ID = "e1190000-0000-4000-8000-000000000005";

/** A lifetime other than the 6-hour default, so the test proves it is read from the config. */
const LIFETIME_SECONDS = 900;
const LIBRARY: IBunnyStreamConfig = {
  libraryId: "424242",
  apiKey: "e2e-library-api-key",
  tokenKey: "e2e-token-key",
  embedLifetimeSeconds: LIFETIME_SECONDS,
};

/** The Bunny videos: two only the course's people may see, one public. */
const ENROLLED_VIDEO = "b1190000-0000-4000-8000-0000000000e1";
const PROCESSING_VIDEO = "b1190000-0000-4000-8000-0000000000e2";
const PUBLIC_VIDEO = "b1190000-0000-4000-8000-0000000000f1";
const ENROLLED_YOUTUBE = "https://www.youtube.com/watch?v=enrolled119";
const PUBLIC_DRIVE = "https://drive.google.com/file/d/public119/view";

const HOUR = 3_600_000;
const PLAYER = new RegExp(
  `^https://player\\.mediadelivery\\.net/embed/${LIBRARY.libraryId}/([0-9a-f-]{36})\\?token=([0-9a-f]{64})&expires=(\\d+)$`
);

interface IListed {
  lessonId: string;
  provider: string;
  visibility: string;
  status: string;
  url: string | null;
}

/**
 * Checks a signed player link: our library, the video expected, a token that
 * is Bunny's formula over that video and expiry, and an expiry the configured
 * lifetime ahead of the request (a few seconds of slack for the request).
 */
function expectSigned(url: string | null, videoId: string, before: number) {
  const match = PLAYER.exec(url ?? "");
  expect(match, `not a signed player link: ${url}`).not.toBeNull();
  const [, video, token, expiresRaw] = match as RegExpExecArray;
  const expires = Number(expiresRaw);
  const after = Math.floor(Date.now() / 1000);
  expect(video).toBe(videoId);
  expect(expires).toBeGreaterThan(after);
  expect(expires).toBeGreaterThanOrEqual(before + LIFETIME_SECONDS);
  expect(expires).toBeLessThanOrEqual(after + LIFETIME_SECONDS);
  expect(token).toBe(embedViewToken(LIBRARY.tokenKey ?? "", video, expires));
}

/** Every key anywhere in a JSON body, lower-cased. */
function keysOf(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, into);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      into.push(key.toLowerCase());
      keysOf(inner, into);
    }
  }
  return into;
}

describe("signed Bunny playback (MDRS-119, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let enrolledLessonId: string;
  let processingLessonId: string;
  let publicLessonId: string;
  let youtubeLessonId: string;
  let driveLessonId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) => bearerFor({ sub });
  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const get = (path: string, sub: string | null) => {
    const req = http().get(path);
    return sub ? req.set("Authorization", as(sub)) : req;
  };

  const bunnyFetchCalls: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: BUNNY_STREAM_CONFIG, useValue: LIBRARY },
        {
          provide: BUNNY_STREAM_FETCH,
          useValue: async (input: string | URL | Request) => {
            bunnyFetchCalls.push(String(input));
            return new Response("{}", { status: 404 });
          },
        },
      ],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    bunnyFetchCalls.length = 0;
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "bans", "users");
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
      grantedBy: MANAGER_ID,
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
    [
      { id: enrolledLessonId },
      { id: processingLessonId },
      { id: publicLessonId },
      { id: youtubeLessonId },
      { id: driveLessonId },
    ] = await db()
      .insert(lessons)
      .values(
        ["Bir", "İki", "Üç", "Dört", "Beş"].map((title, orderIndex) => ({
          weekId: week.id,
          orderIndex,
          title,
          type: LessonType.LIVE,
          durationMinutes: 60,
          scheduledAt: new Date(Date.now() - (48 - orderIndex) * HOUR),
        }))
      )
      .returning();

    const bunnyRow = (
      lessonId: string,
      videoId: string,
      visibility: RecordingVisibility,
      status: RecordingStatus
    ) => ({
      lessonId,
      title: `Kayıt ${videoId.slice(-2)}`,
      provider: RecordingProvider.BUNNY,
      url: null,
      visibility,
      status,
      bunnyVideoId: videoId,
      uploadExpiresAt: new Date(Date.now() + 24 * HOUR),
    });
    await db()
      .insert(lessonRecordings)
      .values([
        bunnyRow(
          enrolledLessonId,
          ENROLLED_VIDEO,
          RecordingVisibility.ENROLLED,
          RecordingStatus.READY
        ),
        bunnyRow(
          processingLessonId,
          PROCESSING_VIDEO,
          RecordingVisibility.ENROLLED,
          RecordingStatus.PROCESSING
        ),
        bunnyRow(
          publicLessonId,
          PUBLIC_VIDEO,
          RecordingVisibility.PUBLIC,
          RecordingStatus.READY
        ),
        {
          lessonId: youtubeLessonId,
          title: "YouTube kaydı",
          provider: RecordingProvider.YOUTUBE,
          url: ENROLLED_YOUTUBE,
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.READY,
        },
        {
          lessonId: driveLessonId,
          title: "Drive kaydı",
          provider: RecordingProvider.DRIVE,
          url: PUBLIC_DRIVE,
          visibility: RecordingVisibility.PUBLIC,
          status: RecordingStatus.READY,
        },
      ]);
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId, status: EnrollmentStatus.ENROLLED },
        // What a ban leaves behind (MDRS-177): the enrollment revoked and
        // the ban on the course.
        { userId: BANNED_ID, courseId, status: EnrollmentStatus.REVOKED },
      ]);
    await db().insert(bans).values({
      userId: BANNED_ID,
      koskId: kosk.id,
      courseId,
      scope: BAN_SCOPES.COURSE,
      reason: "Düzeni bozdu.",
      bannedBy: MANAGER_ID,
      bannedRole: "KOSK_NAZIM",
      bannedTier: 2,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "bans", "users");
    await app.close();
  });

  describe("GET /courses/:id/recordings", () => {
    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["the müderris", MUDERRIS_ID],
    ])("gives %s a signed, uncached player link for every READY Bunny recording", async (_who, sub) => {
      const before = nowSeconds();
      const res = await get(`/courses/${courseId}/recordings`, sub).expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const body = res.body as IListed[];
      expect(body).toHaveLength(5);
      const byLesson = new Map(body.map((r) => [r.lessonId, r]));

      expectSigned(
        byLesson.get(enrolledLessonId)?.url ?? null,
        ENROLLED_VIDEO,
        before
      );
      expectSigned(
        byLesson.get(publicLessonId)?.url ?? null,
        PUBLIC_VIDEO,
        before
      );
      // Still encoding: listed, with nothing to play and nothing signed.
      expect(byLesson.get(processingLessonId)).toMatchObject({
        provider: "BUNNY",
        status: "PROCESSING",
        url: null,
      });
      expect(JSON.stringify(body)).not.toContain(PROCESSING_VIDEO);
      // A pasted link is handed out as stored, never signed.
      expect(byLesson.get(youtubeLessonId)?.url).toBe(ENROLLED_YOUTUBE);
      expect(byLesson.get(driveLessonId)?.url).toBe(PUBLIC_DRIVE);
      expect(keysOf(body)).not.toContain("bunnyvideoid");
      expect(bunnyFetchCalls).toEqual([]);
    });

    it("signs a fresh expiry on every read", async () => {
      const first = await get(`/courses/${courseId}/recordings`, TALEBE_ID);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const second = await get(`/courses/${courseId}/recordings`, TALEBE_ID);
      const urlOf = (body: IListed[]) =>
        body.find((r) => r.lessonId === enrolledLessonId)?.url;
      expect(urlOf(second.body)).not.toBe(urlOf(first.body));
    });

    it.each([
      ["a stranger", STRANGER_ID],
      ["a banned talebe", BANNED_ID],
      ["a visitor with no token", null],
    ])("gives %s only the PUBLIC recordings, and no ENROLLED video id or link", async (_who, sub) => {
      const before = nowSeconds();
      const res = await get(`/courses/${courseId}/recordings`, sub).expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const body = res.body as IListed[];
      expect(body.map((r) => r.lessonId).sort()).toEqual(
        [publicLessonId, driveLessonId].sort()
      );
      expect(body.every((r) => r.visibility === "PUBLIC")).toBe(true);
      expectSigned(
        body.find((r) => r.lessonId === publicLessonId)?.url ?? null,
        PUBLIC_VIDEO,
        before
      );
      const text = JSON.stringify(body);
      for (const hidden of [
        ENROLLED_VIDEO,
        PROCESSING_VIDEO,
        ENROLLED_YOUTUBE,
        "enrolled119",
      ]) {
        expect(text).not.toContain(hidden);
      }
    });

    it.each([
      ["a stranger", STRANGER_ID],
      ["a banned talebe", BANNED_ID],
      ["a visitor with no token", null],
    ])("gives %s an empty list when no recording is PUBLIC", async (_who, sub) => {
      await db()
        .update(lessonRecordings)
        .set({ visibility: RecordingVisibility.ENROLLED })
        .where(
          inArray(lessonRecordings.lessonId, [publicLessonId, driveLessonId])
        );
      const res = await get(`/courses/${courseId}/recordings`, sub).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /courses/:courseId/sessions/:sessionId", () => {
    const session = (id: string) => `/courses/${courseId}/sessions/${id}`;

    it("gives an enrolled talebe the session's Bunny recording with a signed, uncached link", async () => {
      const before = nowSeconds();
      const res = await get(session(enrolledLessonId), TALEBE_ID).expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.body.recording).toMatchObject({
        provider: "BUNNY",
        status: "READY",
        visibility: "ENROLLED",
      });
      expectSigned(res.body.recording.url, ENROLLED_VIDEO, before);
      expect(keysOf(res.body)).not.toContain("bunnyvideoid");
    });

    it.each([
      ["a stranger", STRANGER_ID],
      ["a banned talebe", BANNED_ID],
      ["a visitor with no token", null],
    ])("hands %s neither the ENROLLED video id nor a link", async (_who, sub) => {
      const res = await get(session(enrolledLessonId), sub).expect(200);
      expect(res.body.contentLocked).toBe(true);
      expect(res.body).not.toHaveProperty("recording");
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(ENROLLED_VIDEO);
      expect(text).not.toContain("mediadelivery");
    });
  });

  describe("GET /courses/:id", () => {
    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["the müderris", MUDERRIS_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["a stranger", STRANGER_ID],
      ["a banned talebe", BANNED_ID],
      ["a visitor with no token", null],
    ])("carries no recording data for %s", async (_who, sub) => {
      const res = await get(`/courses/${courseId}`, sub).expect(200);
      const text = JSON.stringify(res.body);
      for (const recordingValue of [
        ENROLLED_VIDEO,
        PROCESSING_VIDEO,
        PUBLIC_VIDEO,
        "mediadelivery",
        ENROLLED_YOUTUBE,
        "enrolled119",
        PUBLIC_DRIVE,
        "Kayıt e1",
        "YouTube kaydı",
        "Drive kaydı",
      ]) {
        expect(text).not.toContain(recordingValue);
      }
      expect(
        keysOf(res.body).filter((key) => key.includes("recording"))
      ).toEqual([]);
    });
  });
});
